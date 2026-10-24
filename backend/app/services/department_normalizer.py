import re
from typing import Set, Dict, List, Optional, Any

# Map canonical department code -> set of normalized lowercase alias strings
DEPARTMENT_TAXONOMY: Dict[str, Dict[str, Any]] = {
    "CSM": {
        "code": "CSM",
        "canonical_name": "Computer Science and Machine Learning",
        "aliases": [
            "csm", "aiml", "ai&ml", "ai/ml", "ai ml", "cse(aiml)", "cse (aiml)",
            "cse(ai&ml)", "cse (ai & ml)", "cse-aiml", "cse - aiml",
            "computer science and machine learning", "computer science & machine learning",
            "computer science engineering machine learning",
            "artificial intelligence and machine learning", "artificial intelligence & machine learning",
            "ai and ml", "ai & ml", "artificial intelligence machine learning"
        ]
    },
    "CSD": {
        "code": "CSD",
        "canonical_name": "Computer Science and Data Science",
        "aliases": [
            "csd", "aids", "ai&ds", "ai/ds", "ai ds", "cse(aids)", "cse (aids)",
            "cse(ai&ds)", "cse (ai & ds)", "cse-aids", "cse - aids",
            "computer science and data science", "computer science & data science",
            "data science", "artificial intelligence and data science",
            "artificial intelligence & data science", "ai and data science",
            "cse data science"
        ]
    },
    "CSBS": {
        "code": "CSBS",
        "canonical_name": "Computer Science and Business Systems",
        "aliases": [
            "csbs", "csc", "computer science and business systems",
            "computer science & business systems"
        ]
    },
    "CSIT": {
        "code": "CSIT",
        "canonical_name": "Computer Science and Information Technology",
        "aliases": [
            "csit", "computer science and information technology",
            "computer science & information technology"
        ]
    },
    "CSE": {
        "code": "CSE",
        "canonical_name": "Computer Science and Engineering",
        "aliases": [
            "cse", "cs", "computer science", "computer science and engineering",
            "computer science & engineering", "computer science engineering",
            "b.tech cse", "b.tech in cse", "b.tech computer science",
            "b.tech in computer science and engineering", "btech cse",
            "b.e cse", "b.e. computer science", "comp sci", "cs & e", "cs and e"
        ]
    },
    "IT": {
        "code": "IT",
        "canonical_name": "Information Technology",
        "aliases": [
            "it", "information technology", "information tech", "info tech",
            "b.tech it", "b.tech in it", "btech it", "b.tech information technology"
        ]
    },
    "ECE": {
        "code": "ECE",
        "canonical_name": "Electronics and Communication Engineering",
        "aliases": [
            "ece", "ec", "electronics and communication engineering",
            "electronics & communication engineering", "electronics and communication",
            "electronics & communication", "electronics and communications engineering",
            "electronics communication", "b.tech ece", "btech ece", "b.e ece"
        ]
    },
    "EEE": {
        "code": "EEE",
        "canonical_name": "Electrical and Electronics Engineering",
        "aliases": [
            "eee", "ee", "electrical and electronics engineering",
            "electrical & electronics engineering", "electrical and electronics",
            "electrical & electronics", "electrical engineering",
            "b.tech eee", "btech eee", "b.e eee"
        ]
    },
    "MECH": {
        "code": "MECH",
        "canonical_name": "Mechanical Engineering",
        "aliases": [
            "mech", "me", "mechanical", "mechanical engineering",
            "b.tech mech", "b.tech mechanical", "btech mech", "b.e mech"
        ]
    },
    "CIVIL": {
        "code": "CIVIL",
        "canonical_name": "Civil Engineering",
        "aliases": [
            "civil", "ce", "civil engineering",
            "b.tech civil", "btech civil", "b.e civil"
        ]
    },
    "CHEM": {
        "code": "CHEM",
        "canonical_name": "Chemical Engineering",
        "aliases": [
            "chem", "che", "chemical", "chemical engineering",
            "b.tech chemical", "btech chem"
        ]
    },
    "AERO": {
        "code": "AERO",
        "canonical_name": "Aeronautical Engineering",
        "aliases": [
            "aero", "ae", "aeronautical", "aerospace", "aeronautical engineering",
            "aerospace engineering"
        ]
    },
    "AUTO": {
        "code": "AUTO",
        "canonical_name": "Automobile Engineering",
        "aliases": [
            "auto", "automobile", "automotive", "automobile engineering",
            "automotive engineering"
        ]
    },
    "BT": {
        "code": "BT",
        "canonical_name": "Biotechnology",
        "aliases": [
            "bt", "biotech", "bio-tech", "biotechnology", "bio technology"
        ]
    },
    "MBA": {
        "code": "MBA",
        "canonical_name": "Master of Business Administration",
        "aliases": [
            "mba", "management", "business administration",
            "finance", "marketing", "hr", "human resources", "mba-fin", "mark-a"
        ]
    },
    "MCA": {
        "code": "MCA",
        "canonical_name": "Master of Computer Applications",
        "aliases": [
            "mca", "master of computer applications", "computer applications"
        ]
    }
}

def clean_dept_string(text: str) -> str:
    """Removes noise, punctuation, degrees, and extra whitespace."""
    if not text:
        return ""
    t = str(text).lower().strip()
    t = t.replace("&", " and ").replace("/", " ")
    t = re.sub(r"\b(?:b\.?tech|b\.?e\.?|m\.?tech|m\.?e\.?|bachelor(?:'s)?\s+of\s+technology)\s+(?:in\s+)?", "", t)
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t

def get_canonical_dept_code(name_or_code: str) -> Optional[str]:
    """Resolves an abbreviation or full form into its standard code (e.g. 'CSE')."""
    if not name_or_code:
        return None
    cleaned = clean_dept_string(name_or_code)
    raw_lower = str(name_or_code).strip().lower()

    # Pass 1: Exact code or exact alias match (prioritized)
    for code, info in DEPARTMENT_TAXONOMY.items():
        if raw_lower == code.lower() or cleaned == code.lower():
            return code
        for alias in info["aliases"]:
            if raw_lower == alias or cleaned == clean_dept_string(alias):
                return code

    # Pass 2: Longest alias containment match (prevent shorter substring collision)
    best_match_code = None
    longest_len = 0
    for code, info in DEPARTMENT_TAXONOMY.items():
        for alias in info["aliases"]:
            alias_clean = clean_dept_string(alias)
            if len(alias_clean) >= 3 and alias_clean in cleaned:
                if len(alias_clean) > longest_len:
                    longest_len = len(alias_clean)
                    best_match_code = code

    return best_match_code

def are_departments_equivalent(dept1: str, dept2: str) -> bool:
    """
    Returns True if dept1 and dept2 refer to the same academic department.
    e.g. are_departments_equivalent('CSE', 'Computer science and engineering') -> True
         are_departments_equivalent('ECE', 'Electronics & Communication') -> True
    """
    if not dept1 or not dept2:
        return False
    
    d1_clean = clean_dept_string(dept1)
    d2_clean = clean_dept_string(dept2)

    if d1_clean == d2_clean:
        return True

    code1 = get_canonical_dept_code(dept1)
    code2 = get_canonical_dept_code(dept2)

    if code1 and code2:
        return code1 == code2

    return False

def get_all_department_aliases(dept_name_or_code: str) -> List[str]:
    """Returns all known aliases, abbreviation and full forms for a department."""
    code = get_canonical_dept_code(dept_name_or_code)
    if code and code in DEPARTMENT_TAXONOMY:
        info = DEPARTMENT_TAXONOMY[code]
        return list(set([info["code"], info["canonical_name"]] + info["aliases"]))
    return [dept_name_or_code]
