"""Resume parser for HireLoop.

Extracts structured fields from resume documents using a mix of
spaCy NER (if available), regex, and keyword heuristics.
"""

from __future__ import annotations

import os
from typing import Dict, List, Optional

from .utils import (
    clean_text,
    extract_email,
    extract_github,
    extract_linkedin,
    extract_phone,
    find_skills,
    read_docx,
    read_pdf,
    read_txt,
    split_sections,
)

try:
    import spacy  # type: ignore
except Exception:  # pragma: no cover
    spacy = None  # type: ignore


def _read_any(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return read_pdf(file_path)
    if ext == ".docx":
        return read_docx(file_path)
    if ext == ".txt":
        return read_txt(file_path)
    return ""


def _init_nlp():
    if spacy is None:
        return None
    try:
        return spacy.load("en_core_web_sm")
    except Exception:
        return None


def _guess_name(text: str, nlp_model) -> Optional[str]:
    if not text:
        return None
    # Use spaCy PERSON entities from the first 10 lines
    first_chunk = "\n".join(text.split("\n")[:10])
    if nlp_model is not None:
        try:
            doc = nlp_model(first_chunk)
            people = [ent.text.strip() for ent in doc.ents if ent.label_ == "PERSON"]
            if people:
                return people[0]
        except Exception:
            pass
    # Fallback: first non-empty line that looks like a name
    for ln in first_chunk.split("\n"):
        tokens = ln.strip().split()
        if 1 < len(tokens) <= 5 and all(t[0:1].isalpha() for t in tokens):
            # Require at least one capitalized word
            if sum(1 for t in tokens if t[:1].isupper()) >= 1:
                return ln.strip()
    return None


def _extract_education(section_text: str) -> List[str]:
    items: List[str] = []
    for ln in section_text.split("\n"):
        ln = ln.strip()
        if not ln:
            continue
        if any(k in ln.lower() for k in ["bsc", "b.s", "bs ", "bachelor", "msc", "m.s", "ms ", "master", "phd", "ph.d", "associate", "diploma", "university", "college"]):
            items.append(ln)
    return items


def _extract_experience(section_text: str) -> List[str]:
    items: List[str] = []
    for ln in section_text.split("\n"):
        ln = ln.strip()
        if not ln:
            continue
        if any(k in ln.lower() for k in ["engineer", "developer", "manager", "designer", "intern", "analyst", "lead", "founder", "consultant", "architect"]):
            items.append(ln)
    return items


def _extract_projects(section_text: str) -> List[str]:
    lines = [ln.strip() for ln in section_text.split("\n") if ln.strip()]
    return lines[:20]


def _extract_certs(section_text: str) -> List[str]:
    lines = [ln.strip() for ln in section_text.split("\n") if ln.strip()]
    return lines[:20]


def extract_resume_data(file_path: str) -> Dict:
    """Extract structured data from a resume file.

    Args:
        file_path: Path to a .pdf, .docx, or .txt resume.

    Returns:
        A JSON-serializable dict with fields: name, email, phone, education,
        experience, skills, projects, certifications, linkedin, github, and raw_text.
        Missing fields default to None or empty list as appropriate.
    """
    raw = _read_any(file_path)
    text = clean_text(raw)

    nlp_model = _init_nlp()

    email = extract_email(text)
    phone = extract_phone(text)
    linkedin = extract_linkedin(text)
    github = extract_github(text)
    name = _guess_name(text, nlp_model)

    sections = split_sections(text)
    edu_sec = "\n".join(s for name_s, s in sections if name_s == "education")
    exp_sec = "\n".join(s for name_s, s in sections if name_s == "experience")
    skills_sec = "\n".join(s for name_s, s in sections if name_s == "skills")
    projects_sec = "\n".join(s for name_s, s in sections if name_s == "projects")
    certs_sec = "\n".join(s for name_s, s in sections if name_s == "certifications")

    education = _extract_education(edu_sec)
    experience = _extract_experience(exp_sec)
    projects = _extract_projects(projects_sec)
    certifications = _extract_certs(certs_sec)

    skills = find_skills(skills_sec or text)

    return {
        "name": name,
        "email": email,
        "phone": phone,
        "education": education,
        "experience": experience,
        "skills": skills,
        "projects": projects,
        "certifications": certifications,
        "linkedin": linkedin,
        "github": github,
        "raw_text": text,
    }


