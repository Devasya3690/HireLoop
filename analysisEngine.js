/**
 * Improved Analysis Engine
 * Handles skill extraction, ATS score and missing skills detection
 */

const STOPWORDS = new Set([
  'about','above','after','again','against','along','also','although','among',
  'and','any','are','because','been','before','being','below','between','both',
  'but','by','can','could','did','does','doing','down','during','each','few',
  'for','from','further','had','has','have','having','here','how','into','its',
  'itself','just','more','most','other','our','out','over','own','same','should',
  'some','such','than','that','their','theirs','them','then','there','these',
  'they','this','those','through','too','under','until','very','was','were',
  'what','when','where','which','while','who','why','with','would','your',
  'the','a','an','is','in','of','to','it','be','as','at','so','we','he',
  'she','do','if','me','my','up','or','on','no','us','am','go','use','used',
  'will','not','all','one','have','has','her','his','him','you','are','was',
  'may','work','team','role','strong','experience','years','year','using',
  'including','ability','must','required','preferred','plus','well','good',
  'excellent','great','high','large','new','key','help','make','based','across',
  'within','per','via','take','part','time','full','looking','join','grow',
  'building','build','working','ability','skills','knowledge','understanding',
  'manage','management','support','lead','leading','develop','developing',
  'create','creating','ensure','provide','drive','driving','deliver','delivering'
]);

const SKILL_PATTERNS = [
  /\b(python|java|javascript|typescript|c\+\+|c#|go|rust|ruby|php|swift|kotlin|scala|r|matlab)\b/gi,
  /\b(react|angular|vue|next\.?js|nuxt|svelte|node\.?js|express|django|flask|fastapi|spring|rails|laravel)\b/gi,
  /\b(aws|azure|gcp|google cloud|docker|kubernetes|terraform|ansible|jenkins|github actions|circleci)\b/gi,
  /\b(sql|mysql|postgresql|postgres|mongodb|redis|cassandra|dynamodb|elasticsearch|sqlite|oracle)\b/gi,
  /\b(agile|scrum|jira|git|github|gitlab|bitbucket|ci\/cd|devops|tdd|bdd)\b/gi,
  /\b(machine learning|deep learning|ml|ai|nlp|computer vision|data science|llm|generative ai)\b/gi,
  /\b(tensorflow|pytorch|scikit-learn|keras|pandas|numpy|scipy|hugging face|langchain)\b/gi,
  /\b(html|css|sass|less|rest api|graphql|grpc|microservices|websockets|oauth|jwt)\b/gi,
  /\b(tableau|power bi|excel|analytics|looker|dbt|spark|hadoop|kafka|airflow)\b/gi,
  /\b(figma|sketch|adobe xd|photoshop|illustrator|ux|ui design|prototyping|wireframing)\b/gi,
  /\b(linux|unix|bash|shell|powershell|networking|tcp\/ip|security|encryption|oauth)\b/gi,
  /\b(product management|roadmap|okrs|kpis|a\/b testing|user research|stakeholder)\b/gi
];

// High-value technical keywords that boost score more
const HIGH_VALUE_KEYWORDS = new Set([
  'python','java','javascript','typescript','react','angular','vue','nodejs',
  'aws','azure','gcp','docker','kubernetes','sql','postgresql','mongodb',
  'machine learning','deep learning','tensorflow','pytorch','scikit-learn',
  'graphql','microservices','rest','api','ci/cd','devops','agile','scrum',
  'redis','kafka','spark','airflow','terraform','ansible','git','github'
]);

/**
 * Basic tokenizer
 */
function tokenize(text) {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 &&
        !STOPWORDS.has(word)
    );
}

/**
 * Extract technical skills
 */
function extractSkills(text) {
  if (!text) return [];

  const skills = new Set();

  for (const pattern of SKILL_PATTERNS) {
    const matches = text.match(pattern);

    if (matches) {
      matches.forEach((m) =>
        skills.add(m.toLowerCase())
      );
    }
  }

  return [...skills].sort();
}

/**
 * Compute ATS score using a weighted system:
 * - Skills match:    60%
 * - Keyword overlap: 30%
 * - Resume structure: 10%
 */
function computeAtsScore(resumeText, jobDescription) {

  if (!jobDescription || jobDescription.trim().length === 0) {
    return { score: 0, missingKeywords: [] };
  }

  // --- 1. Skills match (60% weight) ---
  const resumeSkills = extractSkills(resumeText);
  const jdSkills     = extractSkills(jobDescription);

  const resumeSkillSet = new Set(resumeSkills.map(s => s.toLowerCase()));
  const jdSkillSet     = new Set(jdSkills.map(s => s.toLowerCase()));

  let skillsScore = 0;
  if (jdSkillSet.size > 0) {
    let matched = 0;
    jdSkillSet.forEach(skill => {
      if (resumeSkillSet.has(skill)) matched++;
    });
    skillsScore = matched / jdSkillSet.size;
  } else {
    // No skills found in JD — give partial credit so score doesn't tank
    skillsScore = 0.6;
  }

  // --- 2. Keyword overlap (30% weight) ---
  const resumeTokens = new Set(tokenize(resumeText));
  const jdTokens     = new Set(tokenize(jobDescription));

  let keywordScore = 0;
  if (jdTokens.size > 0) {
    let overlap = 0;
    let highValueOverlap = 0;

    jdTokens.forEach(token => {
      if (resumeTokens.has(token)) {
        overlap++;
        if (HIGH_VALUE_KEYWORDS.has(token)) {
          highValueOverlap++;
        }
      }
    });

    const baseRatio     = overlap / jdTokens.size;
    // Bonus for matching high-value technical terms
    const highValueBonus = Math.min(0.2, highValueOverlap * 0.04);
    keywordScore = Math.min(1, baseRatio * 1.3 + highValueBonus);
  }

  // --- 3. Resume structure (10% weight) ---
  // Reward resumes that have recognisable sections
  const structureIndicators = [
    /experience/i, /education/i, /skills/i, /summary|objective/i,
    /projects/i, /certifications?/i, /achievements?|accomplishments?/i
  ];
  const structureMatches = structureIndicators.filter(p => p.test(resumeText)).length;
  const structureScore   = Math.min(1, structureMatches / structureIndicators.length);

  // --- Weighted total (raw, 0–1) ---
  const rawScore =
    skillsScore   * 0.60 +
    keywordScore  * 0.30 +
    structureScore * 0.10;

  // --- Map raw score to realistic 55–92 range ---
  // A perfect match shouldn't be 100; a weak match shouldn't fall below ~55
  const MIN_SCORE = 55;
  const MAX_SCORE = 92;
  const score = Math.round(MIN_SCORE + rawScore * (MAX_SCORE - MIN_SCORE));

  // --- Missing keywords (still based on skill set for actionability) ---
  const missingKeywords = [...jdSkillSet]
    .filter(skill => !resumeSkillSet.has(skill))
    .concat(
      [...jdTokens]
        .filter(token =>
          !resumeTokens.has(token) &&
          HIGH_VALUE_KEYWORDS.has(token) &&
          !jdSkillSet.has(token)
        )
    )
    .slice(0, 15);

  return {
    score,
    missingKeywords
  };
}

/**
 * Detect missing skills
 */
function detectMissingSkills(resumeSkills, jdSkills) {

  const resumeSet = new Set(
    resumeSkills.map((s) => s.toLowerCase())
  );

  return jdSkills.filter(
    (skill) => !resumeSet.has(skill.toLowerCase())
  );
}

module.exports = {
  extractSkills,
  computeAtsScore,
  detectMissingSkills
};
