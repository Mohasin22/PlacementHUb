import re
import os
import zipfile
import xml.etree.ElementTree as ET
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid

# Curated Technology & Skills Taxonomies
COMMON_PROGRAMMING_LANGUAGES = [
    "Python", "JavaScript", "TypeScript", "Java", "C", "C++", "C#", "Go", "Rust", "Ruby",
    "PHP", "Swift", "Kotlin", "Dart", "SQL", "R", "MATLAB", "HTML", "CSS", "Bash", "Shell"
]

COMMON_FRAMEWORKS = [
    "React", "React.js", "React Native", "Next.js", "Angular", "Vue", "Vue.js", "Node.js",
    "Express", "Express.js", "FastAPI", "Flask", "Django", "Spring", "Spring Boot",
    "ASP.NET", "Tailwind CSS", "Bootstrap", "Flutter", "PyTorch", "TensorFlow", "Pandas",
    "NumPy", "Scikit-Learn", "Keras"
]

COMMON_TOOLS_DATABASES = [
    "MongoDB", "PostgreSQL", "MySQL", "SQLite", "Redis", "Oracle", "Firebase", "DynamoDB",
    "Docker", "Kubernetes", "Git", "GitHub", "GitLab", "AWS", "Azure", "GCP", "Linux",
    "Postman", "Figma", "Jira", "VS Code", "GraphQL", "REST API", "CI/CD", "Kafka"
]

def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extracts clean text from a DOCX file using Python's standard zipfile and xml parsing."""
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as docx:
            xml_content = docx.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            
            # XML namespace for Word
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            paragraphs = []
            for p in tree.iterfind('.//w:p', ns):
                texts = [node.text for node in p.iterfind('.//w:t', ns) if node.text]
                if texts:
                    paragraphs.append("".join(texts))
            return "\n".join(paragraphs)
    except Exception:
        # Fallback raw extraction
        try:
            return file_bytes.decode('utf-8', errors='ignore')
        except Exception:
            return ""

import io

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extracts text streams from PDF binary safely."""
    # 1. Try PyPDF / pypdf if available
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        pages_text = [p.extract_text() for p in reader.pages if p.extract_text()]
        if pages_text:
            return "\n".join(pages_text)
    except Exception:
        pass

    # 2. Native PDF text stream extractor
    try:
        content = file_bytes.decode('latin-1', errors='ignore')
        # Extract text within ( ... ) Tj and [ ... ] TJ blocks
        text_chunks = []
        for match in re.finditer(r"\(([^)]+)\)\s*Tj", content):
            text_chunks.append(match.group(1))
        for match in re.finditer(r"\[([^\]]+)\]\s*TJ", content):
            raw_array = match.group(1)
            parts = re.findall(r"\(([^)]+)\)", raw_array)
            if parts:
                text_chunks.append("".join(parts))
                
        if text_chunks:
            return " ".join(text_chunks)
            
        # Fallback regex word token extractor
        words = re.findall(r"[A-Za-z0-9\+\#\.\:\/\@\-\_\(\)]{3,}", content)
        return " ".join(words)
    except Exception:
        return ""

def extract_text_from_resume_bytes(file_bytes: bytes, filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".docx":
        return extract_text_from_docx(file_bytes)
    elif ext == ".pdf":
        return extract_text_from_pdf(file_bytes)
    else:
        try:
            return file_bytes.decode('utf-8', errors='ignore')
        except Exception:
            return ""

def parse_resume_content(text: str) -> Dict[str, Any]:
    """
    Parses resume plain text and returns structured JSON suggestions with confidence metrics.
    """
    if not text:
        return {
            "skills": [],
            "programming_languages": [],
            "frameworks": [],
            "tools": [],
            "projects": [],
            "internships": [],
            "certifications": [],
            "achievements": [],
            "education": [],
            "links": {"linkedin": None, "github": None, "portfolio": None},
            "raw_text_preview": ""
        }

    # 1. Extract Links (LinkedIn, GitHub, Portfolio)
    linkedin_match = re.search(r"(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)", text, re.IGNORECASE)
    github_match = re.search(r"(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)", text, re.IGNORECASE)
    portfolio_match = re.search(r"https?:\/\/(?!linkedin|github)[\w\.-]+\.[a-zA-Z]{2,}(?:\/[\w\.-]*)*", text, re.IGNORECASE)

    links = {
        "linkedin": linkedin_match.group(0) if linkedin_match else None,
        "github": github_match.group(0) if github_match else None,
        "portfolio": portfolio_match.group(0) if portfolio_match else None
    }

    # 2. Extract Skills by category
    text_lower = text.lower()
    
    detected_languages = []
    for lang in COMMON_PROGRAMMING_LANGUAGES:
        # Boundary-aware check
        pattern = r"\b" + re.escape(lang.lower()) + r"\b"
        if re.search(pattern, text_lower):
            detected_languages.append({"value": lang, "confidence": 0.96, "status": "DETECTED"})

    detected_frameworks = []
    for fw in COMMON_FRAMEWORKS:
        pattern = r"\b" + re.escape(fw.lower()) + r"\b"
        if re.search(pattern, text_lower):
            detected_frameworks.append({"value": fw, "confidence": 0.94, "status": "DETECTED"})

    detected_tools = []
    for tool in COMMON_TOOLS_DATABASES:
        pattern = r"\b" + re.escape(tool.lower()) + r"\b"
        if re.search(pattern, text_lower):
            detected_tools.append({"value": tool, "confidence": 0.95, "status": "DETECTED"})

    all_skills_flat = [item["value"] for item in (detected_languages + detected_frameworks + detected_tools)]

    # 3. Detect Projects section
    projects = []
    proj_section_match = re.search(r"(?:PROJECTS|ACADEMIC PROJECTS|KEY PROJECTS)\s*[:\n](.*?)(?=(?:INTERNSHIPS|EXPERIENCE|EDUCATION|CERTIFICATIONS|SKILLS|ACHIEVEMENTS|$))", text, re.IGNORECASE | re.DOTALL)
    if proj_section_match:
        proj_text = proj_section_match.group(1).strip()
        lines = [line.strip() for line in proj_text.split('\n') if line.strip()]
        for line in lines[:5]:
            if len(line) > 5 and not line.startswith("http"):
                projects.append({
                    "title": line.split(":")[0].strip()[:60],
                    "description": line[:150],
                    "confidence": 0.88
                })

    # 4. Detect Internships / Experience
    internships = []
    intern_section_match = re.search(r"(?:INTERNSHIPS|WORK EXPERIENCE|EXPERIENCE)\s*[:\n](.*?)(?=(?:PROJECTS|EDUCATION|CERTIFICATIONS|SKILLS|ACHIEVEMENTS|$))", text, re.IGNORECASE | re.DOTALL)
    if intern_section_match:
        intern_text = intern_section_match.group(1).strip()
        lines = [line.strip() for line in intern_text.split('\n') if line.strip()]
        for line in lines[:4]:
            if len(line) > 5:
                internships.append({
                    "company_and_role": line[:80],
                    "details": line[:150],
                    "confidence": 0.85
                })

    # 5. Detect Certifications
    certifications = []
    cert_section_match = re.search(r"(?:CERTIFICATIONS|CERTIFICATES|COURSES)\s*[:\n](.*?)(?=(?:PROJECTS|INTERNSHIPS|EDUCATION|SKILLS|ACHIEVEMENTS|$))", text, re.IGNORECASE | re.DOTALL)
    if cert_section_match:
        cert_text = cert_section_match.group(1).strip()
        lines = [line.strip() for line in cert_text.split('\n') if line.strip()]
        for line in lines[:6]:
            if len(line) > 4:
                certifications.append({"value": line[:80], "confidence": 0.90, "status": "DETECTED"})

    return {
        "skills": [{"value": s, "confidence": 0.95, "status": "DETECTED"} for s in all_skills_flat],
        "programming_languages": detected_languages,
        "frameworks": detected_frameworks,
        "tools": detected_tools,
        "projects": projects,
        "internships": internships,
        "certifications": certifications,
        "achievements": [],
        "education": [],
        "links": links,
        "raw_text_preview": text[:500]
    }

def generate_profile_diff(existing_profile: Dict[str, Any], extracted: Dict[str, Any]) -> Dict[str, Any]:
    """Generates before vs detected diff comparison for student confirmation."""
    existing_skills = set(existing_profile.get("skills") or [])
    detected_skills = {item["value"] for item in extracted.get("skills", [])}

    new_skills = list(detected_skills - existing_skills)
    already_present_skills = list(detected_skills & existing_skills)

    existing_links = existing_profile.get("links") or {}
    detected_links = extracted.get("links") or {}

    new_links = {}
    for k, v in detected_links.items():
        if v and not existing_links.get(k):
            new_links[k] = v

    return {
        "skills": {
            "existing": list(existing_skills),
            "detected": list(detected_skills),
            "new_suggested": new_skills,
            "already_present": already_present_skills
        },
        "projects": {
            "existing": existing_profile.get("projects") or [],
            "detected": extracted.get("projects") or []
        },
        "internships": {
            "existing": existing_profile.get("internships") or [],
            "detected": extracted.get("internships") or []
        },
        "certifications": {
            "existing": existing_profile.get("certifications") or [],
            "detected": [c["value"] for c in extracted.get("certifications", [])]
        },
        "links": {
            "existing": existing_links,
            "detected": detected_links,
            "new_suggested": new_links
        }
    }
