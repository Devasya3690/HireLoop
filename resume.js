const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../services/db');
const { generateTailoredResumeAndCoverLetter } = require('../services/aiService');
const { validateResume, validateJobDescription } = require('../services/validation');
const { extractSkills, computeAtsScore, detectMissingSkills } = require('../services/analysisEngine');
const { formatResumeToPdf } = require('../services/resumeFormatter');

const router = express.Router();

/* ─────────────────────────────────────────────
   CANONICAL TEXT CLEANER
   Single definition used at every stage.
───────────────────────────────────────────── */
function cleanGeneratedText(text) {
  if (!text) return '';

  return text
    .replace(/<br\s*\/?>/gi, '\n')      // <br> → newline (AI artefact)
    .replace(/<\/?[^>]+>/g, '')         // strip all remaining HTML tags
    .replace(/\r\n/g, '\n')             // Windows line endings
    .replace(/\r/g, '\n')               // old-Mac line endings
    .replace(/\n\s*\n\s*\n+/g, '\n\n') // collapse 3+ blank lines → 2
    .replace(/[ \t]+/g, ' ')            // collapse inline whitespace
    .trim();
}

/* ─────────────────────────────────────────────
   TWO-COLUMN PDF DEDUPLICATOR
   pdf-parse interleaves lines from both columns.
   After cleaning we remove exact duplicate lines
   (case-insensitive) while preserving blank lines
   so section spacing is maintained.
───────────────────────────────────────────── */
function deduplicateLines(text) {
  const seen = new Set();
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true; // keep blank lines for section spacing
      const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');
}

/* ─────────────────────────────────────────────
   MULTER SETUP
───────────────────────────────────────────── */
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only PDF and DOCX files are allowed'));
    }
    cb(null, true);
  },
});

/* ─────────────────────────────────────────────
   UPLOAD RESUME
───────────────────────────────────────────── */
router.post('/upload-resume', authMiddleware, upload.single('resume'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const isPdf = req.file.mimetype === 'application/pdf';

    let text = '';

    if (isPdf) {
      const data = await pdfParse(fs.readFileSync(filePath));
      text = data.text || '';
    } else {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value || '';
    }

    // Step 1: universal clean (handles both PDF and DOCX)
    text = cleanGeneratedText(text);

    // Step 2: remove duplicate lines (two-column PDF artefact)
    text = deduplicateLines(text);

    if (!text) {
      return res.status(400).json({ message: 'Unable to extract text from file' });
    }

    const resumeValidation = validateResume(text);
    if (!resumeValidation.valid) {
      return res.status(400).json({ message: resumeValidation.message });
    }

    res.json({ resumeText: text });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   GENERATE TAILORED RESUME
───────────────────────────────────────────── */
router.post('/generate', authMiddleware, async (req, res, next) => {
  try {
    const { resumeText, jobDescription } = req.body;

    if (!resumeText || !jobDescription) {
      return res.status(400).json({ message: 'Resume text and job description are required' });
    }

    const jdValidation = validateJobDescription(jobDescription);
    if (!jdValidation.valid) {
      return res.status(400).json({ message: jdValidation.message });
    }

    const resumeSkills = extractSkills(resumeText);
    const jdSkills = extractSkills(jobDescription);
    const missingSkills = detectMissingSkills(resumeSkills, jdSkills);
    const { score, missingKeywords } = computeAtsScore(resumeText, jobDescription);

    let { tailoredResume, coverLetter } = await generateTailoredResumeAndCoverLetter(
      resumeText,
      jobDescription,
      resumeSkills,
    );

    // Clean AI output with the single canonical helper
    const cleanResume = cleanGeneratedText(tailoredResume);
    const cleanCoverLetter = cleanGeneratedText(coverLetter);

    const db = getDb();

    const result = db
      .prepare(
        `INSERT INTO resumes (
           user_id, original_resume_text, tailored_resume_text,
           job_description, ats_score, cover_letter,
           missing_keywords, missing_skills
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.user.id,
        resumeText,
        cleanResume,
        jobDescription,
        score,
        cleanCoverLetter,
        JSON.stringify(missingKeywords),
        JSON.stringify(missingSkills),
      );

    res.json({
      id: result.lastInsertRowid,
      atsScore: score,
      missingKeywords,
      missingSkills,
      tailoredResume: cleanResume,
      coverLetter: cleanCoverLetter,
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   HISTORY LIST
───────────────────────────────────────────── */
router.get('/history', authMiddleware, (req, res, next) => {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, ats_score, created_at,
                substr(job_description, 1, 160) AS job_description_snippet
         FROM resumes
         WHERE user_id = ?
         ORDER BY created_at DESC`,
      )
      .all(req.user.id);

    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   HISTORY DETAILS
───────────────────────────────────────────── */
router.get('/history/:id', authMiddleware, (req, res, next) => {
  try {
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM resumes WHERE id = ? AND user_id = ?`)
      .get(req.params.id, req.user.id);

    if (!row) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const result = { ...row };
    result.missing_keywords = row.missing_keywords ? JSON.parse(row.missing_keywords) : [];
    result.missing_skills = row.missing_skills ? JSON.parse(row.missing_skills) : [];

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   EXPORT PDF
───────────────────────────────────────────── */
router.post('/export-pdf', authMiddleware, async (req, res, next) => {
  try {
    const { tailoredResume } = req.body;

    if (!tailoredResume) {
      return res.status(400).json({ message: 'Resume text is required' });
    }

    const cleanedResume = cleanGeneratedText(tailoredResume);
    const pdfBuffer = await formatResumeToPdf(cleanedResume);

    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=hireloop-tailored-resume.pdf',
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
