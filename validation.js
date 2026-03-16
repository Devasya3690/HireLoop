/**
 * Validation utilities for resume and job description.
 */

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const RESUME_SECTION_PATTERNS = [
  /\b(?:education|academic|degree)\b/i,
  /\b(?:experience|work\s*experience|employment|professional)\b/i,
  /\b(?:skills|technical\s*skills|competencies)\b/i,
  /\b(?:projects|project\s*experience)\b/i,
];

const JD_KEYWORD_PATTERNS = [
  /\b(?:responsibilities)\b/i,
  /\b(?:requirements)\b/i,
  /\b(?:skills)\b/i,
  /\b(?:qualifications)\b/i,
];

const MIN_RESUME_SECTIONS = 2;
const MIN_JD_WORDS = 100;

function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, message: 'Please enter a valid email address.' };
  }
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, message: 'Please enter a valid email address.' };
  }
  return { valid: true };
}

function validateResume(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, message: 'Uploaded document does not appear to be a resume.' };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { valid: false, message: 'Uploaded document does not appear to be a resume.' };
  }
  const sectionCount = RESUME_SECTION_PATTERNS.filter((p) => p.test(trimmed)).length;
  if (sectionCount < MIN_RESUME_SECTIONS) {
    return { valid: false, message: 'Uploaded document does not appear to be a resume.' };
  }
  return { valid: true };
}

function validateJobDescription(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, message: 'This does not appear to be a valid job description.' };
  }
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < MIN_JD_WORDS) {
    return { valid: false, message: 'This does not appear to be a valid job description.' };
  }
  const hasKeyword = JD_KEYWORD_PATTERNS.some((p) => p.test(trimmed));
  if (!hasKeyword) {
    return { valid: false, message: 'This does not appear to be a valid job description.' };
  }
  return { valid: true };
}

module.exports = {
  validateEmail,
  validateResume,
  validateJobDescription,
};