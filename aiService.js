const Groq = require('groq-sdk');
const { extractSkills } = require('./analysisEngine');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/* ─────────────────────────────────────────────
   SYSTEM PROMPT
   Strict, concise rules the model must follow.
───────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are an expert ATS resume writer. Your job is to rewrite a resume so it is highly optimised for a specific job description.

STRICT RULES — follow every rule exactly:
1. Keep ONLY the sections that exist in the original resume. Do not add or remove sections.
2. Do NOT invent skills, tools, technologies, companies, projects, or qualifications that are not already in the resume.
3. Do NOT copy or re-use any line more than once.
4. Write every job or project achievement as a single strong bullet point using this exact format:
   • [Strong action verb] + [specific task] + [technology/tool used] + [measurable result if available]
   Example: • Developed a fake-news detection model in Python using scikit-learn, achieving 92% classification accuracy.
5. Section headers must be written in ALL CAPS on their own line with no extra punctuation.
6. The contact block (name + contact details) goes at the very top, before any section header.
7. Output plain text only. No markdown, no asterisks, no HTML, no bold formatting.
8. If the original resume has a languages or achievements section, keep it.
9. Do not truncate. Output the complete resume from top to bottom.`;

/* ─────────────────────────────────────────────
   USER PROMPT TEMPLATE
───────────────────────────────────────────── */
const USER_PROMPT_TEMPLATE = `Below you will find three inputs. Read all three carefully before writing.

════════════════════════════════════
ORIGINAL RESUME
════════════════════════════════════
{resumeText}

════════════════════════════════════
JOB DESCRIPTION
════════════════════════════════════
{jobDescription}

════════════════════════════════════
SKILLS CONFIRMED IN THE RESUME
(only these may appear in the rewritten resume)
════════════════════════════════════
{resumeSkills}

════════════════════════════════════
YOUR TASKS
════════════════════════════════════

TASK 1 — REWRITE THE RESUME
Rewrite the resume section-by-section in this order (skip any section not in the original):
  1. Full name (first line)
  2. Contact details (email, phone, LinkedIn, GitHub, city — one per line)
  3. SUMMARY
  4. SKILLS
  5. EXPERIENCE
  6. PROJECTS
  7. EDUCATION
  8. Any other sections that exist in the original

Rules for each section:
- SUMMARY: 2–3 sentences. Highlight the candidate's strongest relevant skills from the job description. No invented facts.
- SKILLS: List skills from the original resume, separated by commas, on a single line. Prioritise skills mentioned in the job description.
- EXPERIENCE: For each role, write the job title and company on one line, dates on the next line, then 3–5 bullet points. Each bullet must start with •.
- PROJECTS: For each project, write the project name on one line, then 2–4 bullet points. Each bullet must start with •.
- EDUCATION: Degree, institution, and dates on one line each. No bullets needed.

TASK 2 — WRITE A COVER LETTER
Write a short, professional cover letter (3 paragraphs). Base it only on facts in the resume. Address it to "Hiring Manager". Sign off as the candidate.

════════════════════════════════════
OUTPUT FORMAT — follow exactly
════════════════════════════════════

===TAILORED_RESUME===
[full rewritten resume here — plain text, no markdown]

===COVER_LETTER===
[cover letter here — plain text, no markdown]`;

/* ─────────────────────────────────────────────
   RESPONSE PARSER
───────────────────────────────────────────── */
function parseAiResponse(text) {
  if (!text) return { tailoredResume: '', coverLetter: '' };

  const RESUME_MARKER = '===TAILORED_RESUME===';
  const COVER_MARKER = '===COVER_LETTER===';

  const resumeIdx = text.indexOf(RESUME_MARKER);
  const coverIdx = text.indexOf(COVER_MARKER);

  if (resumeIdx === -1 && coverIdx === -1) {
    // Model ignored the format — treat entire output as the resume
    return { tailoredResume: text.trim(), coverLetter: '' };
  }

  if (resumeIdx !== -1 && coverIdx === -1) {
    return {
      tailoredResume: text.slice(resumeIdx + RESUME_MARKER.length).trim(),
      coverLetter: '',
    };
  }

  if (resumeIdx === -1 && coverIdx !== -1) {
    return {
      tailoredResume: text.slice(0, coverIdx).trim(),
      coverLetter: text.slice(coverIdx + COVER_MARKER.length).trim(),
    };
  }

  return {
    tailoredResume: text.slice(resumeIdx + RESUME_MARKER.length, coverIdx).trim(),
    coverLetter: text.slice(coverIdx + COVER_MARKER.length).trim(),
  };
}

/* ─────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────── */
async function generateTailoredResumeAndCoverLetter(
  resumeText,
  jobDescription,
  resumeSkills = [],
) {
  try {
    if (!resumeSkills || resumeSkills.length === 0) {
      resumeSkills = extractSkills(resumeText);
    }

    const skillsStr =
      resumeSkills.length > 0
        ? resumeSkills.slice(0, 60).join(', ')
        : 'Use only skills already present in the resume above';

    const prompt = USER_PROMPT_TEMPLATE
      .replace('{resumeText}', resumeText.trim())
      .replace('{jobDescription}', jobDescription.trim())
      .replace('{resumeSkills}', skillsStr);

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,   // lower = more consistent, less hallucination
      max_tokens: 3500,   // was 2000 — caused truncation on longer resumes
    });

    const aiText = completion.choices?.[0]?.message?.content || '';
    return parseAiResponse(aiText);

  } catch (error) {
    console.error('AI generation error:', error);
    // Graceful fallback: return the original resume unchanged
    return { tailoredResume: resumeText, coverLetter: '' };
  }
}

module.exports = { generateTailoredResumeAndCoverLetter };
