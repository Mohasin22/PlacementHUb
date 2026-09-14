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

