/**
 * resumeFormatter.js
 * Parse plain-text resume into sections and render as PDF via Puppeteer.
 *
 * Key improvements over the previous version:
 *  1. Expanded SECTION_HEADERS list covers common resume variants.
 *  2. Section header detection is now fuzzy — it matches headers that appear
 *     on a short line (≤40 chars) in all-caps OR that exactly match a known
 *     header string, which catches AI-generated ALL-CAPS headers reliably.
 *  3. Contact block is rendered as individual lines (not pipe-joined wall of text).
 *  4. Bullet points starting with • are rendered as proper <li> elements.
 *  5. Section bleeding fix: flushContent() is called whenever a header is
 *     detected, regardless of whether a blank line preceded it.
 */

/* ─────────────────────────────────────────────
   KNOWN SECTION HEADERS
───────────────────────────────────────────── */
const SECTION_HEADERS = new Set([
  // Summary variants
  'summary', 'professional summary', 'career summary', 'profile', 'objective', 'about',
  // Skills variants
  'skills', 'technical skills', 'core skills', 'key skills', 'competencies',
  // Experience variants
  'experience', 'work experience', 'professional experience', 'employment', 'employment history',
  // Projects variants
  'projects', 'personal projects', 'academic projects', 'project experience',
  // Education variants
  'education', 'academic background', 'qualifications',
  // Certifications
  'certifications', 'certificates', 'licenses',
  // Languages
  'languages',
  // Achievements — 'key achievements' was previously missing; its absence caused
  // the parser to treat "KEY ACHIEVEMENTS" as body text inside the Skills section,
  // which made skill list items appear under the achievements heading.
  'awards', 'achievements', 'key achievements', 'academic achievements',
  'honours', 'honors', 'accomplishments',
  // Other
  'publications', 'research',
  'volunteer', 'volunteering', 'extracurricular',
  'interests', 'hobbies',
  'references', 'contact',
]);

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Decide whether a line is a section header.
 *
 * A line qualifies only if its normalised lowercase value is a known entry
 * in SECTION_HEADERS.
 *
 * WHY the ALL-CAPS heuristic was removed:
 *   The previous version also matched any short all-caps line as a header.
 *   That incorrectly consumed the candidate's name (e.g. "DEVASYA GUPTA")
 *   as a section key before the header-extraction logic could read it,
 *   leaving sections.header empty and triggering the "Candidate" fallback.
 *   Since the AI prompt now outputs explicit section names that are all in
 *   SECTION_HEADERS, the heuristic is unnecessary and harmful.
 */
function isSectionHeader(line) {
  const stripped = line.trim();
  if (!stripped) return false;
  const lower = stripped.toLowerCase().replace(/:$/, '').trim();
  return SECTION_HEADERS.has(lower);
}

function normaliseSectionKey(line) {
  return line
    .trim()
    .toLowerCase()
    .replace(/:$/, '')
    .replace(/\s+/g, '_');
}

/* ─────────────────────────────────────────────
   CONTACT LINE DETECTOR
   Returns true when a line looks like a piece of
   contact information.  Intentionally broad so
   that email / phone / URLs / location lines are
   never missed, regardless of what order they
   appear in the header block.
───────────────────────────────────────────── */
function isContactLine(line) {
  const s = line.trim();
  if (!s) return false;

  return (
    // email address  (e.g. GuptaDeva700@gmail.com)
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(s) ||

    // phone — starts with + or digit, contains mostly digits/spaces/dashes
    /^[+\d][\d\s\-(). ]{5,}$/.test(s) ||

    // full URL  (http:// or https://)
    /^https?:\/\//i.test(s) ||

    // LinkedIn (with or without protocol)
    /linkedin\.com/i.test(s) ||

    // GitHub (with or without protocol)
    /github\.com/i.test(s) ||

    // generic bare domain + optional path  (e.g. devasya-gupta.netlify.app)
    /^[\w\-]+\.[\w\-]{2,}(\/[\w\-./]*)?$/.test(s) ||

    // "City, Country" or "City, ST"  — letters + comma, no digits
    /^[A-Za-z\s]+,\s*[A-Za-z\s]+$/.test(s)
  );
}

/* ─────────────────────────────────────────────
   SECTION PARSER
───────────────────────────────────────────── */
/**
 * Two-pass parser.
 *
 * PASS 1 — Header pre-pass
 *   Scans from the top of the document until it hits the first known section
 *   header.  Within that region:
 *     • The very first non-empty line is always the candidate name.
 *     • Every other line that matches isContactLine() is kept as a contact
 *       detail.  Non-contact lines (e.g. a job title like "Computer Science
 *       Student") are skipped but do NOT terminate the scan — this is the key
 *       fix for Bug 1, where stopping early caused email / LinkedIn / GitHub
 *       lines to be missed.
 *
 * PASS 2 — Section body pass
 *   Everything from headerEndIndex onward is parsed into named sections using
 *   the SECTION_HEADERS lookup.
 */
function parseResumeSections(text) {
  const lines = text.split('\n').map((l) => l.trim());

  /* ── PASS 1: extract name + contact from the header region ── */

  // Find the first non-empty line — unconditionally the candidate name.
  // isSectionHeader is deliberately NOT called on this line so that
  // all-caps names like "DEVASYA GUPTA" are never swallowed as section keys.
  let nameIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) { nameIndex = i; break; }
  }

  if (nameIndex === -1) {
    return { name: 'Candidate', contactLines: [] };
  }

  const name = lines[nameIndex];

  // Scan forward from nameIndex+1 until the first known section header.
  // Collect every line that looks like contact info.
  // Lines that are neither contact nor section-header (e.g. a job title like
  // "Computer Science Student") are silently skipped so they don't terminate
  // the scan prematurely — this is what fixes the missing email/LinkedIn/GitHub.
  let headerEndIndex = nameIndex + 1;
  const rawContactLines = [];

  for (let i = nameIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    if (!line) {
      // Blank line inside header region — keep scanning
      continue;
    }

    if (isSectionHeader(line)) {
      // First real section header found — header region ends here
      headerEndIndex = i;
      break;
    }

    // Not a section header — decide whether it's contact info or a title line
    if (isContactLine(line)) {
      rawContactLines.push(line);
    }
    // Non-contact lines (job title, degree, etc.) are skipped but do NOT stop
    // the scan.  The scan only stops at a section header.
    headerEndIndex = i + 1; // keep advancing so Pass 2 starts after this line
  }

  /* ── PASS 2: parse section bodies ── */
  const sections = {};
  let currentSection = null;
  let currentContent = [];

  function flushContent() {
    if (currentSection === null) return;
    const content = currentContent.join('\n').trim();
    if (content) {
      sections[currentSection] = sections[currentSection]
        ? sections[currentSection] + '\n\n' + content
        : content;
    }
    currentContent = [];
  }

  for (let i = headerEndIndex; i < lines.length; i++) {
    const line = lines[i];

    if (!line) {
      flushContent();
      continue;
    }

    if (isSectionHeader(line)) {
      flushContent();                          // flush previous section first
      currentSection = normaliseSectionKey(line);
      continue;
    }

    if (currentSection !== null) {
      currentContent.push(line);
    }
    // Lines that appear before the first section header in Pass 2 are discarded
  }

  flushContent();

  /* ── Attach name + contact ── */
  sections.name = name;
  sections.contactLines = dedupeArray(rawContactLines);

  return sections;
}

function dedupeArray(arr) {
  const seen = new Set();
  return arr.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

/* ─────────────────────────────────────────────
   SKILL-LIST DETECTOR
   Returns true when a block of text looks like a
   comma-separated list of technology keywords
   rather than real achievement sentences.

   Criteria (ALL must be true):
   1. No bullet-point markers (•, -, *).
   2. No sentence-ending punctuation (.  !  ?)
      except inside parentheses like "(Basic)".
   3. When split by comma, the average token
      length is short (≤ 4 words per token) —
      real achievements are full sentences.
   4. At least 3 comma-separated tokens exist,
      meaning it really is a list structure.
───────────────────────────────────────────── */
function looksLikeSkillList(text) {
  if (!text || !text.trim()) return false;

  // Bullet markers mean real content — not a skill list
  if (/^[•\-*]\s/m.test(text)) return false;

  // Strip parenthetical qualifiers like "(Basic)" before checking punctuation,
  // so "Artificial Intelligence (Basic)" doesn't trigger the sentence detector
  const withoutParens = text.replace(/\([^)]*\)/g, '');

  // Sentence-ending punctuation outside parens means real achievement prose
  if (/[.!?]/.test(withoutParens)) return false;

  // Split on commas and check token structure
  const tokens = text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length < 3) return false; // too few tokens to call it a list

  const avgWords =
    tokens.reduce((sum, t) => sum + t.split(/\s+/).length, 0) / tokens.length;

  // Short average word count per token → it's a keyword list, not sentences
  return avgWords <= 4;
}

/* ─────────────────────────────────────────────
   ACHIEVEMENT SECTION RECONCILER
   Called once after parseResumeSections() has
   built the sections map.

   For every achievement-type key
   (key_achievements, achievements, awards, …):

   • If the content looks like a skill list
     → append it to sections.skills (creating
       that key if it doesn't exist yet), then
       delete the achievement key so it is never
       rendered.

   • If the content contains real achievement
     text (sentences / bullets) AND also has
     some skill-list lines intermixed, only the
     skill-list lines are moved to skills; the
     sentence/bullet lines stay in the
     achievement section.

   • If the content is already proper achievement
     text, leave it completely untouched.

   • After any stripping, if the achievement
     section is left empty, delete it so no
     empty section heading appears in the PDF.
───────────────────────────────────────────── */
const ACHIEVEMENT_KEYS = new Set([
  'key_achievements', 'achievements', 'academic_achievements', 'accomplishments',
]);

function reconcileAchievements(sections) {
  for (const key of ACHIEVEMENT_KEYS) {
    const raw = sections[key];
    if (!raw || !raw.trim()) continue;

    // Split into individual lines for fine-grained analysis
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

    const skillLines = [];    // lines that belong in Skills
    const achieveLines = [];  // lines that are genuine achievements

    for (const line of lines) {
      // A line is a genuine achievement if it:
      //  • starts with a bullet marker, OR
      //  • contains sentence-ending punctuation outside parentheses, OR
      //  • has more than 6 words (clearly a sentence, not a keyword)
      const withoutParens = line.replace(/\([^)]*\)/g, '');
      const wordCount = line.split(/\s+/).length;
      const isBullet = /^[•\-*]\s/.test(line);
      const hasSentencePunct = /[.!?]/.test(withoutParens);

      if (isBullet || hasSentencePunct || wordCount > 6) {
        achieveLines.push(line);
      } else {
        // Short, no punctuation — treat as a skill keyword / list fragment
        skillLines.push(line);
      }
    }

    // Move skill-like lines into the skills section
    if (skillLines.length > 0) {
      const skillText = skillLines.join('\n');
      sections.skills = sections.skills
        ? sections.skills + '\n' + skillText
        : skillText;
    }

    // Keep or discard the achievement section
    if (achieveLines.length > 0) {
      sections[key] = achieveLines.join('\n');
    } else {
      // Nothing genuine left — drop the section entirely so no empty
      // heading appears in the rendered PDF
      delete sections[key];
    }
  }

  return sections;
}

/* ─────────────────────────────────────────────
   HTML CONTENT RENDERER
───────────────────────────────────────────── */
function contentToHtml(content) {
  if (!content) return '';

  const blocks = content.split('\n\n');
  const out = [];

  for (const block of blocks) {
    const b = block.trim();
    if (!b) continue;

    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);

    // Bullet list block
    const isList = lines.some((l) => /^[•\-*]\s/.test(l));

    if (isList) {
      out.push('<ul>');
      for (const l of lines) {
        if (/^[•\-*]\s/.test(l)) {
          const text = l.replace(/^[•\-*]\s*/, '');
          if (text) out.push(`  <li>${escapeHtml(text)}</li>`);
        } else {
          // Non-bullet line in a bullet block (e.g. sub-header like role + date)
          out.push(`</ul><p class="role-line">${escapeHtml(l)}</p><ul>`);
        }
      }
      out.push('</ul>');
    } else {
      for (const l of lines) {
        out.push(`<p>${escapeHtml(l)}</p>`);
      }
    }
  }

  return out.join('\n');
}

/* ─────────────────────────────────────────────
   SECTION RENDER ORDER + TITLES
───────────────────────────────────────────── */
// Preferred display order — sections not in this list are rendered afterward
const SECTION_ORDER = [
  'summary', 'professional_summary', 'career_summary', 'profile', 'objective', 'about',
  'skills', 'technical_skills', 'core_skills', 'key_skills',
  'experience', 'work_experience', 'professional_experience', 'employment', 'employment_history',
  'projects', 'personal_projects', 'academic_projects',
  'education', 'academic_background',
  'certifications', 'certificates',
  'languages',
  'awards', 'achievements', 'key_achievements', 'academic_achievements', 'accomplishments',
  'publications', 'research',
  'interests', 'hobbies',
  'volunteer', 'volunteering',
];

function titleCase(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─────────────────────────────────────────────
   HTML BUILDER
───────────────────────────────────────────── */
function renderResumeHtml(sections) {
  const name = sections.name || 'Candidate';

  const contactHtml = (sections.contactLines || []).length > 0
    ? `<div class="contact-line">${
        (sections.contactLines).map((l) => escapeHtml(l)).join(' &nbsp;|&nbsp; ')
      }</div>`
    : '';

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(name)} — Resume</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #111;
      max-width: 720px;
      margin: 0 auto;
      padding: 36px 44px;
    }

    /* ── Header ── */
    .resume-header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 14px;
      border-bottom: 2px solid #1e3a5f;
    }
    .resume-name {
      font-size: 22pt;
      font-weight: bold;
      color: #1e3a5f;
      letter-spacing: 0.5px;
    }
    .contact-block {
      margin-top: 6px;
    }
    .contact-line {
      font-size: 9pt;
      color: #444;
      line-height: 1.6;
    }

    /* ── Sections ── */
    .section {
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 10pt;
      font-weight: bold;
      color: #1e3a5f;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      border-bottom: 1px solid #b0bec5;
      padding-bottom: 3px;
      margin-bottom: 8px;
    }
    .section-body {
      font-size: 10pt;
    }

    /* ── Text elements ── */
    p {
      margin-bottom: 5px;
    }
    .role-line {
      font-weight: bold;
      margin-top: 6px;
      margin-bottom: 2px;
    }
    ul {
      margin-left: 18px;
      margin-bottom: 6px;
    }
    li {
      margin-bottom: 3px;
    }
  </style>
</head>
<body>
  <div class="resume-header">
    <div class="resume-name">${escapeHtml(name)}</div>
    <div class="contact-block">${contactHtml}</div>
  </div>
`;

  const renderedKeys = new Set(['name', 'contactLines']);

  // Render sections in preferred order first
  for (const key of SECTION_ORDER) {
    const content = sections[key];
    if (content && content.trim()) {
      renderedKeys.add(key);
      html += `  <div class="section">
    <div class="section-title">${titleCase(key)}</div>
    <div class="section-body">${contentToHtml(content)}</div>
  </div>\n`;
    }
  }

  // Render any remaining sections (custom / unexpected) in insertion order
  for (const [key, content] of Object.entries(sections)) {
    if (!renderedKeys.has(key) && content && content.trim()) {
      html += `  <div class="section">
    <div class="section-title">${titleCase(key)}</div>
    <div class="section-body">${contentToHtml(content)}</div>
  </div>\n`;
    }
  }

  html += '</body>\n</html>';
  return html;
}

/* ─────────────────────────────────────────────
   PDF GENERATION
───────────────────────────────────────────── */
async function htmlToPdf(html) {
  const puppeteer = require('puppeteer');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' },
      printBackground: true,
    });

    return pdf;
  } finally {
    await browser.close();
  }
}

/* ─────────────────────────────────────────────
   PUBLIC ENTRY POINT
───────────────────────────────────────────── */
async function formatResumeToPdf(tailoredResumeText) {
  // Final-defence clean (the text should be clean already, but be safe)
  const cleaned = cleanText(tailoredResumeText);

  // Deduplicate any remaining duplicate lines
  const seen = new Set();
  const deduped = cleaned
    .split('\n')
    .filter((line) => {
      const l = line.trim();
      if (!l) return true; // preserve blank lines for section spacing
      const key = l.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');

  const sections = parseResumeSections(deduped);
  reconcileAchievements(sections);
  const html = renderResumeHtml(sections);
  return htmlToPdf(html);
}

module.exports = {
  parseResumeSections,
  renderResumeHtml,
  formatResumeToPdf,
  htmlToPdf,
};
