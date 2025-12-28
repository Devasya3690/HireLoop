"""Utility functions for HireLoop preprocessing.

Includes file readers for PDF, DOCX, and TXT, text cleaning utilities,
and simple regex helpers for common extractions.
"""

from __future__ import annotations

import json
import os
import re
from typing import Iterable, List, Optional, Tuple

try:
    import pdfplumber  # type: ignore
except Exception:  # pragma: no cover - optional dependency at runtime
    pdfplumber = None  # type: ignore

try:
    import docx2txt  # type: ignore
except Exception:  # pragma: no cover
    docx2txt = None  # type: ignore

try:
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover
    pd = None  # type: ignore


# -----------------------------
# File Readers
# -----------------------------

def read_pdf(path: str) -> str:
    """Read text from a PDF file using pdfplumber.

    Args:
        path: Absolute or relative path to the PDF file.

    Returns:
        Extracted text as a string. Returns an empty string on failure.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If pdfplumber is not installed.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"PDF not found: {path}")
    if pdfplumber is None:
        raise ValueError("pdfplumber is required to read PDF files.")
    try:
        text_parts: List[str] = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                content = page.extract_text() or ""
                text_parts.append(content)
        return "\n".join(text_parts)
    except Exception:
        return ""


def read_docx(path: str) -> str:
    """Read text from a DOCX file using docx2txt.

    Args:
        path: Path to the DOCX file.

    Returns:
        Extracted text. Returns an empty string on failure.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If docx2txt is not installed.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"DOCX not found: {path}")
    if docx2txt is None:
        raise ValueError("docx2txt is required to read DOCX files.")
    try:
        return docx2txt.process(path) or ""
    except Exception:
        return ""


def read_txt(path: str) -> str:
    """Read text from a plain text file.

    Args:
        path: Path to the text file.

    Returns:
        File contents as text. Returns an empty string on failure.

    Raises:
        FileNotFoundError: If the file does not exist.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"TXT not found: {path}")
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception:
        return ""


# -----------------------------
# Cleaning
# -----------------------------

WHITESPACE_RE = re.compile(r"\s+")


def clean_text(text: str) -> str:
    """Normalize whitespace and remove control characters.

    Args:
        text: Raw text.

    Returns:
        Cleaned text suitable for downstream parsing.
    """
    if not text:
        return ""
    # Replace non-breaking spaces and normalize line endings
    normalized = text.replace("\xa0", " ").replace("\r\n", "\n").replace("\r", "\n")
    # Collapse excessive whitespace
    normalized = WHITESPACE_RE.sub(" ", normalized)
    return normalized.strip()


# -----------------------------
# Regex helpers
# -----------------------------

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(
    r"(?:(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?|\d{3})[\s.-]?\d{3}[\s.-]?\d{4})"
)
URL_RE = re.compile(r"https?://[\w.-]+(?:/[\w._~:/?#[\]@!$&'()*+,;=-]*)?")
LINKEDIN_RE = re.compile(r"https?://(?:www\.)?linkedin\.com/[\w\-/]+", re.I)
GITHUB_RE = re.compile(r"https?://(?:www\.)?github\.com/[\w\-/]+", re.I)


def extract_email(text: str) -> Optional[str]:
    matches = EMAIL_RE.findall(text or "")
    return matches[0] if matches else None


def extract_phone(text: str) -> Optional[str]:
    matches = PHONE_RE.findall(text or "")
    return matches[0] if matches else None


def extract_urls(text: str) -> List[str]:
    return list(dict.fromkeys(URL_RE.findall(text or "")))


def extract_linkedin(text: str) -> Optional[str]:
    matches = LINKEDIN_RE.findall(text or "")
    return matches[0] if matches else None


def extract_github(text: str) -> Optional[str]:
    matches = GITHUB_RE.findall(text or "")
    return matches[0] if matches else None


# -----------------------------
# Skills dictionary (minimal, extendable)
# -----------------------------

DEFAULT_SKILLS = [
    # Languages
    "python",
    "java",
    "javascript",
    "typescript",
    "go",
    "c++",
    "c#",
    "ruby",
    "scala",
    "rust",
    "sql",
    # Libraries/Frameworks
    "react",
    "node",
    "django",
    "flask",
    "fastapi",
    "spring",
    "rails",
    "angular",
    "vue",
    # Data/ML
    "pandas",
    "numpy",
    "scikit-learn",
    "tensorflow",
    "pytorch",
    "spacy",
    "nltk",
    # Cloud/DevOps
    "aws",
    "gcp",
    "azure",
    "docker",
    "kubernetes",
    "terraform",
    "git",
]


def find_skills(text: str, extra_skills: Optional[Iterable[str]] = None) -> List[str]:
    """Detect skills from text using a small dictionary plus optional extras.

    Matching is case-insensitive and returns unique skills in canonical lowercase.
    """
    if not text:
        return []
    dictionary = set(s.lower() for s in DEFAULT_SKILLS)
    if extra_skills:
        dictionary.update(s.lower() for s in extra_skills)
    found: List[str] = []
    text_lower = f" {text.lower()} "
    for skill in sorted(dictionary):
        # simple word boundary match
        if re.search(rf"(?<![\w+#.]){re.escape(skill)}(?![\w+-])", text_lower):
            found.append(skill)
    return found


# -----------------------------
# Section heuristics
# -----------------------------

SECTION_HEADERS = {
    "education": ["education", "academic background"],
    "experience": ["experience", "work experience", "employment history"],
    "skills": ["skills", "technical skills", "skills & endorsements"],
    "projects": ["projects", "personal projects"],
    "certifications": ["certifications", "licenses", "certifications & licenses"],
    "responsibilities": ["responsibilities", "what you'll do", "what you will do"],
    "requirements": ["requirements", "what you'll need", "qualifications"],
}


def split_sections(text: str) -> List[Tuple[str, str]]:
    """Split text into (section_name, section_text) using header heuristics.

    This is a best-effort approach that scans for known headers and segments
    the text. If none are found, returns a single ("body", text) section.
    """
    if not text:
        return [("body", "")]

    lines = [ln.strip() for ln in (text or "").split("\n") if ln.strip()]
    if not lines:
        return [("body", "")]

    sections: List[Tuple[str, str]] = []
    current_name = "body"
    current_lines: List[str] = []

    header_map = {h: name for name, hs in SECTION_HEADERS.items() for h in hs}
    header_patterns = {
        h: re.compile(rf"^\s*{re.escape(h)}\s*:?$", re.I) for h in header_map.keys()
    }

    def flush():
        nonlocal current_name, current_lines
        if current_lines:
            sections.append((current_name, "\n".join(current_lines).strip()))
        current_lines = []

    for ln in lines:
        matched = None
        for header, pat in header_patterns.items():
            if pat.match(ln):
                matched = header
                break
        if matched:
            flush()
            current_name = header_map[matched]
        else:
            current_lines.append(ln)

    flush()
    return sections if sections else [("body", text)]


def load_json_safe(path: str) -> Optional[dict]:
    """Load JSON from a file path with error handling. Returns None on failure."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


