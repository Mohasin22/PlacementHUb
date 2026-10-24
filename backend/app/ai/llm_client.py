import os
import re
import json
import logging
from typing import Dict, Any, Optional
try:
    import httpx
except ImportError:
    httpx = None

try:
    import requests
except ImportError:
    requests = None
from app.config import settings

logger = logging.getLogger(__name__)

class LLMClient:
    """
    Configurable LLM Client supporting Gemini REST API, OpenAI REST API,
    and a deterministic heuristic fallback engine when API keys are absent or offline.
    """

    def __init__(
        self,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None
    ):
        self.provider = (provider or settings.AI_PROVIDER).lower()
        self.model = model or settings.AI_MODEL
        self.api_key = api_key or settings.AI_API_KEY

        # Auto-detect provider if "auto"
        if self.provider == "auto":
            if self.api_key:
                if self.api_key.startswith("AIza"):
                    self.provider = "gemini"
                elif self.api_key.startswith("sk-"):
                    self.provider = "openai"
                else:
                    self.provider = "gemini"
            else:
                self.provider = "mock"

        logger.info(f"Initialized LLMClient with provider='{self.provider}', model='{self.model}', key_set={bool(self.api_key)}")

    async def generate_json(self, prompt: str, system_instruction: Optional[str] = None) -> Dict[str, Any]:
        """
        Sends prompt to configured LLM provider and parses structured JSON output.
        Falls back to deterministic heuristic parsing if LLM is unavailable or fails.
        """
        result = None
        if self.provider == "gemini" and self.api_key:
            try:
                result = await self._call_gemini(prompt, system_instruction)
            except Exception as e:
                logger.warning(f"Gemini API call failed: {e}. Falling back to deterministic reasoning.")
                result = self._deterministic_fallback(prompt)

        elif self.provider == "openai" and self.api_key:
            try:
                result = await self._call_openai(prompt, system_instruction)
            except Exception as e:
                logger.warning(f"OpenAI API call failed: {e}. Falling back to deterministic reasoning.")
                result = self._deterministic_fallback(prompt)

        else:
            logger.info("Using deterministic reasoning engine (no external API key or provider='mock').")
            result = self._deterministic_fallback(prompt)

        if isinstance(result, dict) and result.get("drive_deadline"):
            try:
                from app.ai.date_utils import normalize_deadline_to_str
                norm = normalize_deadline_to_str(result["drive_deadline"])
                if norm:
                    result["drive_deadline"] = norm
            except Exception as e:
                logger.debug(f"Could not normalize drive_deadline: {e}")

        return result

    async def _call_gemini(self, prompt: str, system_instruction: Optional[str]) -> Dict[str, Any]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        
        contents = []
        if system_instruction:
            contents.append({
                "role": "user",
                "parts": [{"text": f"SYSTEM INSTRUCTION:\n{system_instruction}\n\nStrictly respond with valid JSON only."}]
            })
            contents.append({
                "role": "model",
                "parts": [{"text": "Understood. I will strictly output valid JSON adhering to your requested schema."}]
            })

        contents.append({
            "role": "user",
            "parts": [{"text": prompt}]
        })

        payload = {
            "contents": contents,
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1
            }
        }

        if httpx:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code != 200:
                    raise RuntimeError(f"Gemini HTTP {resp.status_code}: {resp.text}")
                data = resp.json()
        else:
            import asyncio
            def _post():
                return requests.post(url, json=payload, timeout=30.0)
            resp = await asyncio.to_thread(_post)
            if resp.status_code != 200:
                raise RuntimeError(f"Gemini HTTP {resp.status_code}: {resp.text}")
            data = resp.json()

        candidates = data.get("candidates", [])
        if not candidates:
            raise RuntimeError("No candidate response from Gemini API.")

        raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return self._clean_and_parse_json(raw_text)

    async def _call_openai(self, prompt: str, system_instruction: Optional[str]) -> Dict[str, Any]:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model or "gpt-4o-mini",
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.1
        }

        if httpx:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code != 200:
                    raise RuntimeError(f"OpenAI HTTP {resp.status_code}: {resp.text}")
                data = resp.json()
        else:
            import asyncio
            def _post():
                return requests.post(url, headers=headers, json=payload, timeout=30.0)
            resp = await asyncio.to_thread(_post)
            if resp.status_code != 200:
                raise RuntimeError(f"OpenAI HTTP {resp.status_code}: {resp.text}")
            data = resp.json()

        raw_text = data["choices"][0]["message"]["content"]
        return self._clean_and_parse_json(raw_text)

    def _clean_and_parse_json(self, raw: str) -> Dict[str, Any]:
        text = raw.strip()
        # Remove Markdown code blocks ```json ... ```
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError as err:
            logger.error(f"Failed to parse LLM JSON: {err}. Raw text:\n{raw}")
            # Try finding first { and last }
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1:
                return json.loads(text[start:end+1])
            raise

    def _deterministic_fallback(self, prompt: str) -> Dict[str, Any]:
        """
        Intelligent deterministic reasoning fallback that extracts structured data
        using pattern recognition, regex, and linguistic heuristics.
        Ensures the system never breaks if external LLM APIs are offline.
        """
        text = prompt

        # 1. Company Name
        company_name = None
        # Check patterns like "ABC Technologies is hiring", "Google is hiring", etc.
        c_hire = re.search(r"\b([A-Z][A-Za-z0-9&.\s]{1,35}?)\s+(?:is hiring|invites|announces|conducting recruitment|is looking for)\b", text)
        if c_hire:
            cand = c_hire.group(1).strip()
            if not any(cand.lower().startswith(w) for w in ["we", "our", "the", "this"]):
                company_name = cand

        if not company_name:
            # Check explicit "Company: ..." or "Company Name: ..."
            c_explicit = re.search(r"(?:company(?:\s*name)?|organization|client)\s*[:\-]\s*([A-Za-z0-9&.\s]{2,35})", text, re.IGNORECASE)
            if c_explicit:
                company_name = c_explicit.group(1).strip().split("\n")[0].strip()

        if not company_name:
            # Look for company with standard suffix
            c_suffix = re.search(r"\b([A-Z][A-Za-z0-9&.\s]{2,30}\s+(?:Technologies|Technology|Tech|Solutions|Services|Corp|Corporation|Pvt|Ltd|Inc|Labs|LLC|Systems|Infotech|Consulting|Group))\b", text)
            if c_suffix:
                company_name = c_suffix.group(1).strip()

        if not company_name:
            # Known major tech brands
            for comp in ["Google", "Microsoft", "Amazon", "Apple", "Meta", "Infosys", "TCS", "Wipro", "Cognizant", "Accenture", "Deloitte", "Capgemini", "Oracle", "IBM", "Cisco", "Salesforce", "Uber", "Swiggy", "Zomato", "Paytm", "Flipkart"]:
                if re.search(rf"\b{comp}\b", text, re.IGNORECASE):
                    company_name = comp
                    break

        # 2. Job Role
        role_match = re.search(r"(?:role|position|profile|title|designation|hiring\s+for|looking\s+for)\s*[:\-]?\s*([A-Za-z0-9\s/]{3,45})", text, re.IGNORECASE)
        job_role = None
        if role_match:
            cand = role_match.group(1).strip().split("\n")[0]
            cand = re.sub(r"(for\s+our.*|candidates.*|graduates.*)", "", cand, flags=re.IGNORECASE).strip()
            if cand:
                job_role = cand
        if not job_role:
            if re.search(r"software\s+engineer", text, re.IGNORECASE):
                job_role = "Software Engineer"
            elif re.search(r"developer", text, re.IGNORECASE):
                job_role = "Software Developer"
            elif re.search(r"analyst", text, re.IGNORECASE):
                job_role = "Business / Systems Analyst"
            elif re.search(r"graduate\s+engineer\s+trainee|get", text, re.IGNORECASE):
                job_role = "Graduate Engineer Trainee"

        # 3. Package
        pkg_match = re.search(r"(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s*(?:LPA|Lakhs?|CTC|Per\s*Annum|INR))", text, re.IGNORECASE)
        package = None
        if pkg_match:
            package = pkg_match.group(1).strip().upper()
            if "LPA" not in package and ("LAKH" in package or "INR" in package):
                nums = re.findall(r"\d+(?:\.\d+)?", package)
                if nums:
                    package = f"{nums[0]} LPA"

        # 4. Location
        loc_match = re.search(r"(?:location|work\s+location|office|job\s+location)\s*[:\-]?\s*([A-Za-z,\s]{3,35})", text, re.IGNORECASE)
        location = None
        if loc_match:
            location = loc_match.group(1).strip().split("\n")[0].split(".")[0].strip()
        else:
            for city in ["Hyderabad", "Bengaluru", "Bangalore", "Pune", "Chennai", "Noida", "Gurugram", "Gurgaon", "Mumbai", "Visakhapatnam", "Delhi", "Remote"]:
                if re.search(rf"\b{city}\b", text, re.IGNORECASE):
                    location = city
                    break

        # 5. Mode
        mode = "On-campus"
        if re.search(r"\bremote\b|\bwork\s+from\s+home\b", text, re.IGNORECASE):
            mode = "Remote"
        elif re.search(r"\bhybrid\b", text, re.IGNORECASE):
            mode = "Hybrid"

        # 6. CGPA
        cgpa_match = re.search(r"(?:cgpa|gpa)\s*(?:of|>=|>=|is|above|minimum|min)?\s*[:\-]?\s*(\d+(?:\.\d+)?)", text, re.IGNORECASE)
        min_cgpa = 0.0
        if cgpa_match:
            val = float(cgpa_match.group(1))
            if 0.0 <= val <= 10.0:
                min_cgpa = val

        # 7. Percentage (UG, 10th, 12th)
        ug_pct = None
        pct_matches = re.findall(r"(\d{2}(?:\.\d+)?)\s*%", text)
        if pct_matches:
            # Check context
            if re.search(r"(?:10th|ssc|secondary)\s*[^.\n]*?(\d{2}(?:\.\d+)?)\s*%", text, re.IGNORECASE):
                m = re.search(r"(?:10th|ssc|secondary)\s*[^.\n]*?(\d{2}(?:\.\d+)?)\s*%", text, re.IGNORECASE)
                tenth_pct = float(m.group(1))
            else:
                tenth_pct = None

            if re.search(r"(?:12th|inter|intermediate|higher\s+secondary)\s*[^.\n]*?(\d{2}(?:\.\d+)?)\s*%", text, re.IGNORECASE):
                m = re.search(r"(?:12th|inter|intermediate|higher\s+secondary)\s*[^.\n]*?(\d{2}(?:\.\d+)?)\s*%", text, re.IGNORECASE)
                twelfth_pct = float(m.group(1))
            else:
                twelfth_pct = None

            if re.search(r"(?:ug|graduation|degree|aggregate|b\.?tech)\s*[^.\n]*?(\d{2}(?:\.\d+)?)\s*%", text, re.IGNORECASE):
                m = re.search(r"(?:ug|graduation|degree|aggregate|b\.?tech)\s*[^.\n]*?(\d{2}(?:\.\d+)?)\s*%", text, re.IGNORECASE)
                ug_pct = float(m.group(1))
        else:
            tenth_pct = None
            twelfth_pct = None

        # 8. Backlogs
        max_backlogs = 99
        if re.search(r"no\s+(?:active\s+)?backlogs?|zero\s+backlogs?|0\s+backlogs?", text, re.IGNORECASE):
            max_backlogs = 0
        else:
            bl_match = re.search(r"(?:maximum|max|up\s+to|allowed)?\s*(\d+)\s*(?:active\s+)?backlogs?", text, re.IGNORECASE)
            if bl_match:
                max_backlogs = int(bl_match.group(1))

        # 9. Passout / Graduation Year
        year_match = re.search(r"(?:graduat(?:e|ing|ion)|batch\s+of|passout|pass\s*out|passing\s+year)\s*(?:in|of|:|-)?\s*(\d{4})", text, re.IGNORECASE)
        passout_year = None
        if year_match:
            passout_year = int(year_match.group(1))
        else:
            # Look for isolated 202X or 203X year
            y_cand = re.findall(r"\b(202[4-9]|203[0-5])\b", text)
            if y_cand:
                passout_year = int(y_cand[0])

        # 10. Programs & Departments
        programs = []
        if re.search(r"\bb\.?tech\b|\bbachelor\s+of\s+technology\b", text, re.IGNORECASE):
            programs.append("B.Tech")
        if re.search(r"\bm\.?tech\b|\bmaster\s+of\s+technology\b", text, re.IGNORECASE):
            programs.append("M.Tech")
        if re.search(r"\bmca\b", text, re.IGNORECASE):
            programs.append("MCA")
        if re.search(r"\bmba\b", text, re.IGNORECASE):
            programs.append("MBA")

        departments = []
        if re.search(r"\bcs\b|\bcse\b|computer\s+science", text, re.IGNORECASE):
            departments.append("Computer Science Engineering")
        if re.search(r"\bit\b|information\s+technology", text, re.IGNORECASE):
            departments.append("Information Technology")
        if re.search(r"\bece\b|electronics(?:\s+and|\s*&)?\s+communication", text, re.IGNORECASE):
            departments.append("Electronics and Communication Engineering")
        if re.search(r"\beee\b|electrical(?:\s+and|\s*&)?\s+electronics", text, re.IGNORECASE):
            departments.append("Electrical and Electronics Engineering")
        if re.search(r"\bmech\b|\bmechanical\b", text, re.IGNORECASE):
            departments.append("Mechanical Engineering")
        if re.search(r"\bcivil\b", text, re.IGNORECASE):
            departments.append("Civil Engineering")
        if re.search(r"\bdata\s+science\b|\baids\b|\bcse-ds\b", text, re.IGNORECASE):
            departments.append("Data Science")
        if re.search(r"\bai\b|\bml\b|artificial\s+intelligence", text, re.IGNORECASE):
            departments.append("Artificial Intelligence")

        # 11. Skills
        skills = []
        for s in ["Java", "Python", "C++", "C#", "JavaScript", "TypeScript", "React", "Node.js", "Angular", "SQL", "MySQL", "PostgreSQL", "MongoDB", "AWS", "Azure", "Docker", "Git", "Spring Boot", "Django", "FastAPI", "Machine Learning", "Data Structures", "Algorithms"]:
            if re.search(rf"\b{re.escape(s)}\b", text, re.IGNORECASE):
                skills.append(s)

        # 12. External link
        link_match = re.search(r"(https?://[^\s]+)", text)
        external_apply_link = link_match.group(1).rstrip(".,)") if link_match else None

        # 13. Deadline
        dl_match = re.search(r"(?:deadline|last\s+date|apply\s+before|due\s+date)\s*[:\-]?\s*([0-9A-Za-z\s,:/-]{4,40})", text, re.IGNORECASE)
        drive_deadline = None
        if dl_match:
            cand_dl = dl_match.group(1).strip().split("\n")[0].rstrip(".,)")
            if len(cand_dl) >= 4:
                try:
                    from app.ai.date_utils import normalize_deadline_to_str
                    drive_deadline = normalize_deadline_to_str(cand_dl) or cand_dl
                except Exception:
                    drive_deadline = cand_dl

        return {
            "company_name": company_name,
            "job_role": job_role,
            "package": package,
            "location": location,
            "mode": mode,
            "min_cgpa": min_cgpa,
            "min_ug_percentage": ug_pct,
            "min_tenth_percentage": tenth_pct,
            "min_twelfth_percentage": twelfth_pct,
            "max_backlogs": max_backlogs,
            "max_total_backlogs": None,
            "allowed_programs": programs,
            "allowed_departments": departments,
            "passout_year": passout_year,
            "education_gap_allowed": True,
            "first_attempt_required": False,
            "gender_filter": "All",
            "required_skills": skills,
            "preferred_skills": [],
            "external_apply_link": external_apply_link,
            "drive_deadline": drive_deadline,
            "interview_date": None,
            "other_requirements": None
        }

# Global singleton client
llm_client = LLMClient()
