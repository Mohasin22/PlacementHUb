import pytest
from app.services.resume_parser import parse_resume_content, generate_profile_diff

def test_resume_structured_parsing():
    sample_text = """
    John Doe
    Email: john@example.com | LinkedIn: linkedin.com/in/johndoe | GitHub: github.com/johndoe
    
    SKILLS
    Languages: Python, JavaScript, TypeScript, SQL
    Frameworks: React, FastAPI, Node.js, Tailwind CSS
    Tools: Docker, MongoDB, AWS, Git
    
    PROJECTS
    Placement Automation Portal: Built using FastAPI and React with MongoDB.
    Smart Chatbot: Developed AI chatbot using Python.
    
    EXPERIENCE
    Software Engineering Intern at Google (Summer 2025): Developed scalable microservices.
    
    CERTIFICATIONS
    AWS Certified Solutions Architect
    """

    res = parse_resume_content(sample_text)
    
    # Check links
    assert "linkedin.com/in/johndoe" in (res["links"]["linkedin"] or "")
    assert "github.com/johndoe" in (res["links"]["github"] or "")
    
    # Check detected languages
    lang_names = [item["value"] for item in res["programming_languages"]]
    assert "Python" in lang_names
    assert "JavaScript" in lang_names
    assert "TypeScript" in lang_names
    
    # Check frameworks
    fw_names = [item["value"] for item in res["frameworks"]]
    assert "React" in fw_names
    assert "FastAPI" in fw_names
    
    # Check tools
    tool_names = [item["value"] for item in res["tools"]]
    assert "Docker" in tool_names
    assert "MongoDB" in tool_names

def test_profile_diff_generation():
    existing_profile = {
        "skills": ["Python", "C"],
        "projects": ["Old Project"],
        "links": {"github": "github.com/existing"}
    }
    extracted_data = {
        "skills": [
            {"value": "Python", "confidence": 0.95},
            {"value": "FastAPI", "confidence": 0.98},
            {"value": "React", "confidence": 0.96}
        ],
        "projects": [{"title": "New AI App"}],
        "links": {"github": "github.com/existing", "linkedin": "linkedin.com/in/new"}
    }

    diff = generate_profile_diff(existing_profile, extracted_data)
    assert "FastAPI" in diff["skills"]["new_suggested"]
    assert "React" in diff["skills"]["new_suggested"]
    assert "Python" in diff["skills"]["already_present"]
    assert diff["links"]["new_suggested"].get("linkedin") == "linkedin.com/in/new"
