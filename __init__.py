"""Preprocessing package for HireLoop.

Modules:
- utils: file readers, text cleaning, and regex helpers
- resume_parser: extract structured data from resumes
- job_parser: extract structured data from job descriptions
- manager: ParserManager for auto-detection and normalization
"""

from .utils import (
    read_pdf,
    read_docx,
    read_txt,
    clean_text,
)
from .resume_parser import extract_resume_data
from .job_parser import extract_job_data
from .manager import ParserManager

__all__ = [
    "read_pdf",
    "read_docx",
    "read_txt",
    "clean_text",
    "extract_resume_data",
    "extract_job_data",
    "ParserManager",
]


