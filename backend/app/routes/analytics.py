from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.db.connection import db
from app.db.utils import id_query, parse_id
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import pandas as pd
import io
import math

router = APIRouter()

def clean_val(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, float) and math.isnan(val):
        return ""
    if isinstance(val, (int, float)):
        # Check if float ending in .0 (e.g. roll numbers read as float 12345.0)
        if isinstance(val, float) and val.is_integer():
            return str(int(val))
        return str(val).strip()
    return str(val).strip()

@router.post("/upload-excel", dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def upload_hr_excel(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    program_type: Optional[str] = Form("Placement Drive"),  # "Placement Drive" or "Training Program"
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel or CSV file.")

    try:
        contents = await file.read()
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    df.columns = [str(col).strip() for col in df.columns]
    df = df.replace({float('nan'): None, pd.NaT: None})

    def norm_key(k: str) -> str:
        return k.lower().replace(" ", "").replace("_", "").replace("-", "")

    headers_map = {norm_key(c): c for c in df.columns}

    # Identify key columns
    name_col = headers_map.get("name") or headers_map.get("studentname") or headers_map.get("nameofstudent")
    roll_col = headers_map.get("rollnumber") or headers_map.get("rollno") or headers_map.get("htno")
    email_col = headers_map.get("email") or headers_map.get("domainmailid") or headers_map.get("emailaddress") or headers_map.get("instituteemail")
    tech_col = headers_map.get("technicalscore") or headers_map.get("techscore") or headers_map.get("coding")
    apt_col = headers_map.get("aptitudescore") or headers_map.get("aptitude") or headers_map.get("reasoning")
    soft_col = headers_map.get("softskills") or headers_map.get("communication") or headers_map.get("interviewscore")
    overall_col = headers_map.get("overallscore") or headers_map.get("totalscore") or headers_map.get("percentage") or headers_map.get("marks")
    status_col = headers_map.get("performancestatus") or headers_map.get("status") or headers_map.get("grade") or headers_map.get("category")
    remarks_col = headers_map.get("hrremarks") or headers_map.get("remarks") or headers_map.get("feedback")
    lacking_col = headers_map.get("lackingareas") or headers_map.get("weaknesses") or headers_map.get("areasforimprovement") or headers_map.get("lacking")
    strengths_col = headers_map.get("strengths") or headers_map.get("strongareas")

    students_records = []
    top_performers = []
    needing_improvement = []

    total_score_sum = 0
    valid_scores_count = 0
    pass_count = 0

    for idx, row in df.iterrows():
        row_dict = row.to_dict()

        name = clean_val(row_dict.get(name_col)) if name_col else f"Student #{idx+1}"
        roll = clean_val(row_dict.get(roll_col)) if roll_col else ""
        email = clean_val(row_dict.get(email_col)).lower() if email_col else ""

        if not name and not roll and not email:
            continue

        try:
            tech_score = float(row_dict.get(tech_col)) if tech_col and row_dict.get(tech_col) is not None else None
        except Exception:
            tech_score = None

        try:
            apt_score = float(row_dict.get(apt_col)) if apt_col and row_dict.get(apt_col) is not None else None
        except Exception:
            apt_score = None

        try:
            soft_score = float(row_dict.get(soft_col)) if soft_col and row_dict.get(soft_col) is not None else None
        except Exception:
            soft_score = None

        try:
            overall_score = float(row_dict.get(overall_col)) if overall_col and row_dict.get(overall_col) is not None else None
        except Exception:
            overall_score = None

        if overall_score is None:
            valid_parts = [s for s in [tech_score, apt_score, soft_score] if s is not None]
            overall_score = round(sum(valid_parts) / len(valid_parts), 1) if valid_parts else 0.0

        if overall_score:
            total_score_sum += overall_score
            valid_scores_count += 1
            if overall_score >= 60:
                pass_count += 1

        perf_status = clean_val(row_dict.get(status_col))
        if not perf_status:
            if overall_score >= 80:
                perf_status = "Top Performer"
            elif overall_score >= 65:
                perf_status = "Good"
            elif overall_score >= 45:
                perf_status = "Needs Improvement"
            else:
                perf_status = "At Risk"

        remarks = clean_val(row_dict.get(remarks_col)) or "No specific remarks provided."
        lacking = clean_val(row_dict.get(lacking_col))
        strengths = clean_val(row_dict.get(strengths_col))

        if not lacking and perf_status in ["Needs Improvement", "At Risk"]:
            inferred = []
            if tech_score is not None and tech_score < 60: inferred.append("Technical / Coding")
            if apt_score is not None and apt_score < 60: inferred.append("Logical Aptitude")
            if soft_score is not None and soft_score < 60: inferred.append("Interview & Communication")
            lacking = ", ".join(inferred) if inferred else "Fundamental Concepts & Practice Needed"

        if not strengths and perf_status in ["Top Performer", "Good"]:
            inferred = []
            if tech_score is not None and tech_score >= 75: inferred.append("Strong Technical Problem Solving")
            if apt_score is not None and apt_score >= 75: inferred.append("Sharp Aptitude")
            if soft_score is not None and soft_score >= 75: inferred.append("Confident Communication")
            strengths = ", ".join(inferred) if inferred else "Consistent Overall Execution"

        record = {
            "name": name,
            "roll_number": roll,
            "email": email,
            "technical_score": tech_score,
            "aptitude_score": apt_score,
            "soft_skills_score": soft_score,
            "overall_score": overall_score,
            "performance_status": perf_status,
            "hr_remarks": remarks,
            "lacking_areas": lacking or "None",
            "strengths": strengths or "Good Effort"
        }

        students_records.append(record)

        if perf_status in ["Top Performer", "Good"]:
            top_performers.append(record)
        else:
            needing_improvement.append(record)

    avg_score = round(total_score_sum / valid_scores_count, 1) if valid_scores_count else 0.0
    pass_rate = round((pass_count / valid_scores_count) * 100, 1) if valid_scores_count else 0.0

    analysis_doc = {
        "institution_id": institution_id,
        "title": title or file.filename.rsplit('.', 1)[0],
        "program_type": program_type,
        "filename": file.filename,
        "total_evaluated": len(students_records),
        "average_score": avg_score,
        "pass_rate_percent": pass_rate,
        "top_performers_count": len(top_performers),
        "needing_improvement_count": len(needing_improvement),
        "students": students_records,
        "uploaded_by": current_user["user_id"],
        "created_at": datetime.now(timezone.utc)
    }

    res = await db.db.training_analytics.insert_one(analysis_doc)
    doc_id = str(res.inserted_id)

    return {
        "message": "HR Excel sheet analyzed successfully!",
        "report_id": doc_id,
        "title": analysis_doc["title"],
        "total_evaluated": len(students_records),
        "average_score": avg_score,
        "pass_rate_percent": pass_rate,
        "top_performers": top_performers[:10],
        "needing_improvement": needing_improvement,
        "all_students": students_records
    }

@router.get("/reports", dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def get_analytics_reports(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    reports_cursor = db.db.training_analytics.find({"institution_id": institution_id}).sort("created_at", -1)
    reports = await reports_cursor.to_list(length=50)

    result = []
    for r in reports:
        result.append({
            "id": str(r["_id"]),
            "title": r.get("title"),
            "program_type": r.get("program_type", "Placement Drive"),
            "filename": r.get("filename"),
            "total_evaluated": r.get("total_evaluated", 0),
            "average_score": r.get("average_score", 0),
            "pass_rate_percent": r.get("pass_rate_percent", 0),
            "top_performers_count": r.get("top_performers_count", 0),
            "needing_improvement_count": r.get("needing_improvement_count", 0),
            "created_at": r.get("created_at"),
            "students": r.get("students", [])
        })

    return result
