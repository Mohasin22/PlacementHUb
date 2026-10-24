import pytest
import io
import openpyxl
from app.services.excel_importer import (
    clean_cell_str, clean_email, clean_phone, STANDARD_TEMPLATE_HEADERS, process_excel_import
)

def test_clean_cell_str():
    assert clean_cell_str(None) == ""
    assert clean_cell_str("  Hello World  ") == "Hello World"
    assert clean_cell_str("nan") == ""
    assert clean_cell_str("123.0") == "123"

def test_clean_email():
    assert clean_email("John.Doe@GTU.EDU") == "john.doe@gtu.edu"
    assert clean_email("  student@gmail.com  ") == "student@gmail.com"

def test_clean_phone():
    assert clean_phone("9876543210") == "9876543210"
    assert clean_phone("+91 98765-43210") == "9876543210"
    assert clean_phone("919876543210") == "9876543210"

def test_standard_template_headers_count():
    assert len(STANDARD_TEMPLATE_HEADERS) >= 46
    assert "Student ID / Roll Number" in STANDARD_TEMPLATE_HEADERS
    assert "Admission Year" in STANDARD_TEMPLATE_HEADERS
    assert "Expected Graduation Year" in STANDARD_TEMPLATE_HEADERS
    assert "Academic Batch" in STANDARD_TEMPLATE_HEADERS
    assert "Profile Photo URL" in STANDARD_TEMPLATE_HEADERS
    assert "Combined Document URL" in STANDARD_TEMPLATE_HEADERS
    assert "Technical Certificates URL" in STANDARD_TEMPLATE_HEADERS
    assert "Achievement Certificates URL" in STANDARD_TEMPLATE_HEADERS

from app.services.excel_importer import match_registered_class, resolve_hierarchy_batch_and_faculty

def test_match_registered_class_exact_and_section():
    all_classes = [
        {"id": "c1", "class_name": "CSE-A", "department_id": "dept_cse"},
        {"id": "c2", "class_name": "CSE-B", "department_id": "dept_cse"},
        {"id": "c3", "class_name": "ECE-A", "department_id": "dept_ece"},
    ]

    # Exact match
    m = match_registered_class("CSE-A", "dept_cse", None, all_classes)
    assert m is not None
    assert m["id"] == "c1"

    # Lowercase & hyphen variation
    m = match_registered_class("cse - a", "dept_cse", None, all_classes)
    assert m is not None
    assert m["id"] == "c1"

    # Section letter "A" maps to "CSE-A" in CSE department
    m = match_registered_class("A", "dept_cse", None, all_classes)
    assert m is not None
    assert m["id"] == "c1"

    # Section letter "B" maps to "CSE-B" in CSE department
    m = match_registered_class("B", "dept_cse", None, all_classes)
    assert m is not None
    assert m["id"] == "c2"

    # "Section A" maps to "CSE-A"
    m = match_registered_class("Section A", "dept_cse", None, all_classes)
    assert m is not None
    assert m["id"] == "c1"

    # "Sec-B" maps to "CSE-B"
    m = match_registered_class("Sec-B", "dept_cse", None, all_classes)
    assert m is not None
    assert m["id"] == "c2"

    # ECE department class isolation (section A in ECE maps to ECE-A, not CSE-A)
    m = match_registered_class("A", "dept_ece", None, all_classes)
    assert m is not None
    assert m["id"] == "c3"

def test_match_registered_class_prioritizes_registration_classes():
    # Scenario: DB has both a registered class ("CSE-A") and an old auto-created class ("cse-a | 2023-2027")
    all_classes = [
        {
            "id": "c_auto",
            "class_name": "cse-a",
            "display_name": "cse-a | 2023-2027",
            "academic_batch_id": "batch_123",
            "department_id": "dept_cse"
        },
        {
            "id": "c_reg",
            "class_name": "CSE-A",
            "department_id": "dept_cse"
        }
    ]

    # Must map to c_reg (the registered class), NOT c_auto
    m = match_registered_class("cse-a", "dept_cse", None, all_classes)
    assert m is not None
    assert m["id"] == "c_reg"
    assert m["class_name"] == "CSE-A"

def test_match_registered_class_single_class_fallback():
    all_classes = [
        {"id": "c_only", "class_name": "General-CSE", "department_id": "dept_cse"}
    ]
    # Blank or general section should map to the only registered class
    m = match_registered_class("", "dept_cse", None, all_classes)
    assert m is not None
    assert m["id"] == "c_only"

    m = match_registered_class("Section 1", "dept_cse", None, all_classes)
    assert m is not None
    assert m["id"] == "c_only"

@pytest.mark.anyio
async def test_resolve_hierarchy_batch_does_not_create_new_class():
    from mongomock_motor import AsyncMongoMockClient
    from app.db.connection import db
    mock_client = AsyncMongoMockClient()
    db.db = mock_client["test_db"]
    db.client = mock_client

    all_programs = [{"id": "p1", "program_name": "B.Tech", "duration_years": 4}]
    all_depts = [{"id": "d1", "department_name": "Computer Science and Engineering"}]
    all_classes = [
        {"id": "c_reg_a", "class_name": "CSE-A", "department_id": "d1", "program_id": "p1"},
        {"id": "c_reg_b", "class_name": "CSE-B", "department_id": "d1", "program_id": "p1"}
    ]
    all_faculty = []

    res = await resolve_hierarchy_batch_and_faculty(
        institution_id="inst_1",
        program_name="B.Tech",
        dept_name="Computer Science and Engineering",
        class_name="A",
        admission_year_val=2023,
        graduation_year_val=2027,
        batch_label_val="2023-2027",
        all_programs=all_programs,
        all_depts=all_depts,
        all_classes=all_classes,
        all_faculty=all_faculty
    )

    # Must strictly map to c_reg_a
    assert res["class_id"] == "c_reg_a"
    assert res["class_name"] == "CSE-A"

    # Verify no new class was inserted into db.classes
    classes_in_db = await db.db.classes.find().to_list(10)
    assert len(classes_in_db) == 0



