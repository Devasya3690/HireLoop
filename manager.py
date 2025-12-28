"""ParserManager for HireLoop.

Auto-detects document type (resume vs job) and routes to the appropriate
parser, returning a normalized schema for downstream usage.
"""

from __future__ import annotations

import os
from typing import Dict, Literal, Optional

from .resume_parser import extract_resume_data
from .job_parser import extract_job_data
from .utils import clean_text, read_pdf, read_docx, read_txt


DocType = Literal["resume", "job", "unknown"]


def _read_any(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return read_pdf(file_path)
    if ext == ".docx":
        return read_docx(file_path)
    if ext == ".txt":
        return read_txt(file_path)
    return ""


class ParserManager:
    """High-level manager to parse resumes and job descriptions.

    Methods:
        detect_file_type(file_path, text): heuristic detection of doc type
        parse(file_path): returns normalized schema with `type` and `data`
    """

    def detect_file_type(self, file_path: str, text: Optional[str] = None) -> DocType:
        raw = text if text is not None else _read_any(file_path)
        normalized = clean_text(raw)
        lower = normalized.lower()

        # Resume indicators
        resume_markers = [
            "resume", "curriculum vitae", "cv", "skills", "experience", "education", "linkedin.com/in/",
        ]
        # Job indicators
        job_markers = [
            "job title", "responsibilities", "requirements", "what you'll do", "what you'll need", "company", "employer",
        ]

        resume_score = sum(1 for m in resume_markers if m in lower)
        job_score = sum(1 for m in job_markers if m in lower)

        if resume_score == 0 and job_score == 0:
            return "unknown"
        if resume_score >= job_score:
            return "resume"
        return "job"

    def parse(self, file_path: str) -> Dict:
        """Parse a file and return a normalized schema.

        Schema:
            type: "resume" | "job" | "unknown"
            data: original parser output (dict)
            normalized: unified view for HireLoop downstream steps
        """
        raw = _read_any(file_path)
        doc_type = self.detect_file_type(file_path, raw)

        if doc_type == "resume":
            data = extract_resume_data(file_path)
            normalized = {
                "name": data.get("name"),
                "contact": {
                    "email": data.get("email"),
                    "phone": data.get("phone"),
                    "linkedin": data.get("linkedin"),
                    "github": data.get("github"),
                },
                "skills": data.get("skills", []),
                "education": data.get("education", []),
                "experience": data.get("experience", []),
                "projects": data.get("projects", []),
                "certifications": data.get("certifications", []),
                "raw_text": data.get("raw_text", ""),
            }
            return {"type": doc_type, "data": data, "normalized": normalized}

        if doc_type == "job":
            data = extract_job_data(file_path)
            normalized = {
                "title": data.get("title"),
                "company": data.get("company"),
                "location": data.get("location"),
                "skills": data.get("skills_required", []),
                "requirements": {
                    "experience": data.get("experience_required"),
                    "education": data.get("education_required"),
                },
                "responsibilities": data.get("responsibilities", []),
                "raw_text": data.get("raw_text", ""),
            }
            return {"type": doc_type, "data": data, "normalized": normalized}

        # unknown
        return {"type": "unknown", "data": {}, "normalized": {"raw_text": clean_text(raw)}}


