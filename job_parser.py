"""Job description parser for HireLoop.

Parses job postings to extract title, company, required skills, experience,
education, responsibilities, and location using regex and section heuristics.
"""

from __future__ import annotations

import os
import re
from typing import Dict, List, Optional

from .utils import (
    clean_text,
    find_skills,
    read_docx,
    read_pdf,
    read_txt,
    split_sections,
)


def _read_any(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return read_pdf(file_path)
    if ext == ".docx":
        return read_docx(file_path)
    if ext == ".txt":
        return read_txt(file_path)
    return ""


TITLE_RE = re.compile(r"(?:Job\s*Title|Title)\s*:?\s*(.+)", re.I)
COMPANY_RE = re.compile(r"(?:Company|Employer|Organization)\s*:?\s*(.+)", re.I)
LOCATION_RE = re.compile(r"(?:Location|Based\s*in)\s*:?\s*(.+)", re.I)
EXPERIENCE_RE = re.compile(r"(\d+\+?\s*(?:years|yrs)\s+of\s+experience[^\n]*)", re.I)
EDUCATION_RE = re.compile(r"(Bachelor'?s|Master'?s|Ph\.?D\.|BS|BA|MS|MA)[^\n]*", re.I)


SECTION_KEYWORDS = {
    "responsibilities": ["responsibilities", "what you'll do", "what you will do", "key responsibilities", "duties"],
    "requirements": ["requirements", "what you'll need", "qualifications", "must have", "nice to have"],
}


def _extract_first_match(regex: re.Pattern, text: str) -> Optional[str]:
    m = regex.search(text or "")
    return m.group(1).strip() if m else None


def _extract_bullets(section_text: str) -> List[str]:
    lines = [ln.strip(" -•\t") for ln in section_text.split("\n") if ln.strip()]
    # Prefer bullet-like lines
    bullets = [ln for ln in lines if ln.startswith(('-', '*', '•')) or ln[:2].isdigit()]
    return bullets if bullets else lines[:20]


def _find_section(text: str, names: List[str]) -> str:
    sections = split_sections(text)
    for section_name, section_text in sections:
        if section_name in names:
            return section_text
    return ""


def extract_job_data(file_path: str) -> Dict:
    """Extract structured data from a job posting.

    Args:
        file_path: Path to a .pdf, .docx, or .txt job description.

    Returns:
        A JSON-serializable dict with keys: title, company, skills_required,
        experience_required, education_required, responsibilities, location, raw_text.
    """
    raw = _read_any(file_path)
    text = clean_text(raw)

    title = _extract_first_match(TITLE_RE, text)
    company = _extract_first_match(COMPANY_RE, text)
    location = _extract_first_match(LOCATION_RE, text)

    responsibilities_sec = _find_section(text, ["responsibilities"])
    requirements_sec = _find_section(text, ["requirements"])

    # If sections not found via headers, attempt naive heuristics
    if not responsibilities_sec:
        responsibilities_sec = "\n".join(
            ln for ln in text.split("\n") if any(k in ln.lower() for k in ["responsibilities", "you will", "you'll"])
        )
    if not requirements_sec:
        requirements_sec = "\n".join(
            ln for ln in text.split("\n") if any(k in ln.lower() for k in ["requirements", "must have", "qualifications"])
        )

    experience_required = _extract_first_match(EXPERIENCE_RE, requirements_sec or text)
    education_required = _extract_first_match(EDUCATION_RE, requirements_sec or text)

    skills_required = find_skills((requirements_sec or "") + "\n" + text)

    responsibilities = _extract_bullets(responsibilities_sec)

    return {
        "title": title,
        "company": company,
        "skills_required": skills_required,
        "experience_required": experience_required,
        "education_required": education_required,
        "responsibilities": responsibilities,
        "location": location,
        "raw_text": text,
    }


