import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { Sidebar } from '../../components/Dashboard/Sidebar';
import { apiFetch, getToken, setToken } from '../../lib/apiClient';

type HistoryItem = {
  id: number;
  ats_score: number;
  created_at: string;
  job_description_snippet: string;
};

type GenerateResponse = {
  id: number;
  atsScore: number;
  missingKeywords: string[];
  missingSkills: string[];
  tailoredResume: string;
  coverLetter: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export default function DashboardPage() {
  const router = useRouter();
  useEffect(() => {
    const token = getToken();

    if (!token) {
      router.replace("/login");
    }
  }, []);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [resumeText, setResumeText] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [tailoredResume, setTailoredResume] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [missingKeywords, setMissingKeywords] = useState<string[]>([]);
  const [missingSkills, setMissingSkills] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);

  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
    } else {
      refreshHistory();
    }
  }, []);

  async function refreshHistory() {
    try {
      setLoadingHistory(true);
      const res = await apiFetch<{ items: HistoryItem[] }>('/api/history', {
        method: 'GET',
        auth: true,
      });
      setHistory(res.items);
    } catch {
      // non-fatal
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleUploadResume(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('resume') as HTMLInputElement;
    if (!fileInput.files?.[0]) return;

    setUploading(true);
    setError(null);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('resume', fileInput.files[0]);

      const res = await fetch(`${API_BASE_URL}/api/upload-resume`, {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Upload failed');
      }
      setResumeText(data.resumeText);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload resume');
    } finally {
      setUploading(false);
    }
  }

  function handleContinueToJobDescription() {
    setError(null);
    setStep(2);
  }

  function handleBackToResume() {
    setError(null);
    setStep(1);
  }

  function handleBackToJobDescription() {
    setError(null);
    setStep(2);
  }

  async function handleAnalyze() {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch<GenerateResponse>('/api/generate', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ resumeText, jobDescription }),
      });
      setTailoredResume(res.tailoredResume);
      setCoverLetter(res.coverLetter);
      setAtsScore(res.atsScore);
      setMissingKeywords(res.missingKeywords || []);
      setMissingSkills(res.missingSkills || []);
      setSelectedHistoryId(res.id);
      refreshHistory();
      setStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setStep(2);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSelectHistory(id: number) {
    setSelectedHistoryId(id);
    setError(null);
    try {
      const res = await apiFetch<{
        original_resume_text: string;
        job_description: string;
        tailored_resume_text: string;
        cover_letter: string;
        ats_score: number | null;
      }>(`/api/history/${id}`, {
        method: 'GET',
        auth: true,
      });
      setResumeText(res.original_resume_text || '');
      setJobDescription(res.job_description || '');
      setTailoredResume(res.tailored_resume_text || '');
      setCoverLetter(res.cover_letter || '');
      setAtsScore(res.ats_score ?? null);
      setStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load history item');
    }
  }

  async function handleDownloadPdf() {
    if (!tailoredResume) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/export-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: JSON.stringify({ tailoredResume }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'PDF export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hireloop-tailored-resume.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'PDF export failed');
    }
  }

  function handleDownloadCoverLetter() {
    const blob = new Blob([coverLetter], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hireloop-cover-letter.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLogout() {
    setToken(null);
    router.push('/login');
  }

  function handleStartOver() {
    setStep(1);
    setResumeText('');
    setJobDescription('');
    setTailoredResume('');
    setCoverLetter('');
    setAtsScore(null);
    setMissingKeywords([]);
    setMissingSkills([]);
    setError(null);
  }

  const scorePercent = atsScore ?? 0;

  const stepLabels = ['1. Resume', '2. Job Description', '3. Analysis', '4. Results'];

  return (
    <div className="flex min-h-screen dashboard-bg bg-slate-50">
      <Sidebar step={step} onLogout={handleLogout} />
      <main className="flex-1 overflow-y-auto flex flex-col">
        <header className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-emerald-50 px-8 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">HireLoop Dashboard</h1>
              <p className="mt-1 text-xs text-slate-500">
                {step === 1 && 'Upload your resume to get started.'}
                {step === 2 && 'Paste or upload the job description.'}
                {step === 3 && 'Analyzing your resume against the job.'}
                {step === 4 && 'View your tailored resume and results.'}
              </p>
            </div>
          </div>
        </header>

        <div className="px-8 py-8 pb-16 flex-1">
          

          {error && (
            <div className="mb-6 rounded-lg border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          )}

          {/* Step 1: Resume Upload */}
          {step === 1 && (
            <section className="grid grid-cols-3 gap-6 max-w-6xl">
             <div className="card p-5 col-span-2">
                <h2 className="text-sm font-semibold text-slate-100">Upload Resume</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Upload a PDF or DOCX resume.
                  
                </p>
                <form className="mt-4 space-y-3" onSubmit={handleUploadResume}>
                 <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-indigo-300 rounded-xl bg-indigo-50/40 hover:bg-indigo-50 cursor-pointer transition">

  <div className="flex flex-col items-center justify-center text-center">
    
    <span className="text-3xl mb-2">📄</span>

    <p className="text-sm font-medium text-slate-700">
      Drag & drop your resume
      
    </p>
    {selectedFileName && (
  <div className="mt-3 flex items-center gap-2 text-sm text-emerald-600">
    ✓ {selectedFileName} uploaded
  </div>
)}

    <p className="text-xs text-slate-500 mt-1">
      or click to browse (PDF or DOCX)
    </p>

  </div>

  <input
  type="file"
  name="resume"
  accept=".pdf,.docx"
  className="hidden"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
    }
  }}
/>

</label>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="inline-flex items-center rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2 text-sm font-medium text-white shadow-lg hover:opacity-90"
                  >
                    {uploading ? 'Extracting text…' : 'Extract Resume Text'}
                  </button>
                </form>
              </div>
              {resumeText && (
                <div className="card p-5">
                  <h2 className="text-sm font-semibold text-slate-100">Extracted Resume</h2>
                  <p className="mt-1 text-xs text-slate-400">Resume validated successfully.</p>
                  <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900">
                    <pre className="whitespace-pre-wrap font-sans">{resumeText.slice(0, 500)}…</pre>
                  </div>
                  <button
                    type="button"
                    onClick={handleContinueToJobDescription}
                    className="mt-4 inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-brand-600"
                  >
                    Continue →
                  </button>
                </div>
                
              )}
              <div className="space-y-6">

  <div className="card p-5">
    <h2 className="text-sm font-semibold text-slate-900">
      ATS Optimization Tips
    </h2>

    <ul className="mt-3 space-y-2 text-xs text-slate-600">
      <li>✔ Use standard section headings</li>
      <li>✔ Match keywords from the job description</li>
      <li>✔ Avoid images, tables or graphics</li>
      <li>✔ Keep formatting simple</li>
    </ul>
  </div>

</div>
            </section>
          )}

          {/* Step 2: Job Description */}
{step === 2 && (
  <>
    <button
      type="button"
      onClick={handleBackToResume}
      className="mb-4 text-sm text-slate-400 hover:text-slate-900"
    >
      ← Back to resume
    </button>

    <section className="grid grid-cols-3 gap-6 max-w-6xl">

      {/* Main Job Description Card */}
      <div className="card p-5 col-span-2">
        <h2 className="text-sm font-semibold text-slate-100">Job Description</h2>
        <p className="mt-1 text-xs text-slate-400">
          Paste the full job description (at least 100 words).
        </p>

        <textarea
          className="mt-3 h-64 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none ring-brand-500/60 focus:border-brand-400 focus:ring-2"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the job description here…"
        />

       {(() => {
  const wordCount = jobDescription.trim().split(/\s+/).filter(Boolean).length;
  const progress = Math.min((wordCount / 100) * 100, 100);

  return (
    <div className="mt-3">
      <p className="text-xs text-slate-500">
        {wordCount} / 100 words
      </p>

      <div className="mt-1 h-2 w-full rounded bg-slate-200">
        <div
          className={`h-2 rounded ${
            wordCount >= 100 ? "bg-green-500" : "bg-indigo-500"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {wordCount >= 100 && (
        <p className="mt-1 text-xs text-green-600">
          ✓ Ready for analysis
        </p>
      )}
    </div>
  );
})()}

        <button
          type="button"
          onClick={async () => {
            setError(null);
            const trimmed = jobDescription.trim();

            if (!trimmed) {
              setError('Please enter a job description.');
              return;
            }

            if (trimmed.split(/\s+/).length < 100) {
              setError('Job description must be at least 100 words.');
              return;
            }

            setStep(3);
            await handleAnalyze();
          }}
          disabled={generating || jobDescription.trim().split(/\s+/).length < 100}
          className="mt-4 inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? 'Analyzing…' : 'Analyze Resume'}
        </button>
      </div>

      {/* Right Side Panel */}
      <div className="space-y-6">

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Job Description Tips
          </h2>

          <ul className="mt-3 space-y-2 text-xs text-slate-600">
            <li>✔ Paste the full job description</li>
            <li>✔ Include responsibilities and requirements</li>
            <li>✔ Avoid shortened summaries</li>
            <li>✔ More text = better ATS analysis</li>
          </ul>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Why This Matters
          </h2>

          <p className="mt-2 text-xs text-slate-600">
            HireLoop compares your resume with the job description to detect
            missing keywords, skills, and ATS compatibility.
          </p>
        </div>

      </div>

    </section>
  </>
)}

          {/* Step 3: Analysis (loading state) */}
          {step === 3 && (
            <section className="max-w-2xl space-y-6">
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-slate-100">Resume Analysis</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Generating your tailored resume and cover letter. This may take a moment.
                </p>
                <div className="mt-6 flex flex-col items-center justify-center py-12">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  <p className="mt-4 text-sm text-slate-400">Analyzing and generating…</p>
                </div>
              </div>
            </section>
          )}

          {/* Step 4: Results */}
          {step === 4 && (
            <section className="space-y-8">
              <div className="grid grid-cols-3 gap-6 mb-6">

  <div className="card p-4 text-center">
    <p className="text-xs text-slate-500">ATS Score</p>
    <p className="mt-1 text-3xl font-bold text-indigo-600">
      {atsScore ?? 0}%
    </p>
  </div>

  <div className="card p-4 text-center">
    <p className="text-xs text-slate-500">Keywords Found</p>
    <p className="mt-1 text-3xl font-bold text-emerald-600">
      {missingKeywords?.length ?? 0}
    </p>
  </div>

  <div className="card p-4 text-center">
    <p className="text-xs text-slate-500">Missing Skills</p>
    <p className="mt-1 text-3xl font-bold text-rose-500">
      {missingSkills?.length ?? 0}
    </p>
  </div>

</div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="text-sm text-slate-400 hover:text-slate-900"
                >
                  Start over
                </button>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
  <div className="card p-6 flex flex-col items-center justify-center">

  <h2 className="text-sm font-semibold text-slate-700 mb-4">
    ATS Score
  </h2>

  <div className="relative flex items-center justify-center">

    <svg width="140" height="140">

      {/* background circle */}
      <circle
        cx="70"
        cy="70"
        r="60"
        stroke="#e5e7eb"
        strokeWidth="10"
        fill="none"
      />

      {/* progress circle */}
      <circle
        cx="70"
        cy="70"
        r="60"
        stroke="url(#gradient)"
        strokeWidth="10"
        fill="none"
        strokeDasharray={377}
        strokeDashoffset={377 - (377 * scorePercent) / 100}
        strokeLinecap="round"
        transform="rotate(-90 70 70)"
      />

      <defs>
        <linearGradient id="gradient">
          <stop offset="0%" stopColor="#ef4444"/>
          <stop offset="50%" stopColor="#f59e0b"/>
          <stop offset="100%" stopColor="#22c55e"/>
        </linearGradient>
      </defs>

    </svg>

    <div className="absolute flex flex-col items-center">
      <span className="text-3xl font-bold text-slate-900">
        {atsScore ?? 0}
      </span>
      <span className="text-xs text-slate-500">
        /100
      </span>
    </div>

  </div>

</div>

                {missingSkills.length > 0 && (
                  <div className="card p-5">
                    <h2 className="text-sm font-semibold text-slate-100">Missing Skills</h2>
                    <p className="mt-1 text-xs text-slate-400">
                      These skills appear in the job description but not in your resume.
                    </p>
                    <p className="mt-3 text-sm text-amber-200">
                      {missingSkills.join(', ')}
                    </p>
                  </div>
                )}
              
              </div>

              {missingKeywords.length > 0 && (
                <div className="card p-5">
                  <h2 className="text-sm font-semibold text-slate-100">Keyword Suggestions</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Consider incorporating these keywords where relevant.
                  </p>
                  <p className="mt-2 font-mono text-xs text-emerald-300">
                    {missingKeywords.join(', ')}
                  </p>
                </div>
              )}

              <div className="card p-5">
                <h2 className="text-sm font-semibold text-slate-100">Generated Resume</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Honest tailoring—only your existing skills were used. Edit before exporting.
                </p>
                <textarea
                 className="mt-3 h-64 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500/60 focus:border-indigo-400 focus:ring-2"
                  value={tailoredResume}
                  onChange={(e) => setTailoredResume(e.target.value)}
                  placeholder="Your tailored resume will appear here…"
                />
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(tailoredResume || '')}
                    disabled={!tailoredResume}
                    className="rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Copy to clipboard
                  </button>
                  <button
  type="button"
  onClick={handleDownloadPdf}
  disabled={!tailoredResume}
  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
>
  Download as PDF
</button>
                </div>
              </div>

              <div className="card p-5">
                <h2 className="text-sm font-semibold text-slate-100">Cover Letter</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Personalized cover letter based on your resume and the job description.
                </p>
               <textarea
                  className="mt-3 h-40 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Your AI-generated cover letter will appear here…"
                />
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(coverLetter || '')}
                    disabled={!coverLetter}
                    className="rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Copy to clipboard
                  </button>
                  <button
  type="button"
  onClick={handleDownloadCoverLetter}
  disabled={!coverLetter}
  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
>
  Download
</button>
                </div>
              </div>

              <div id="history" className="card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">History</h2>
                    <p className="mt-1 text-xs text-slate-700">
                      Revisit past generations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshHistory}
                    disabled={loadingHistory}
                    className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-900 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingHistory ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  {history.length === 0 && !loadingHistory && (
                    <p className="text-slate-400">No history yet.</p>
                  )}
                  <ul className="space-y-2">
                    {history.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectHistory(item.id)}
                          className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left transition ${
  selectedHistoryId === item.id
    ? 'border-indigo-500 bg-indigo-600 text-white'
    : 'border-slate-200 bg-white hover:bg-slate-100'
}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-600">
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                            <span className="text-[11px] font-semibold text-brand-200">
                              {item.ats_score ?? '—'}/100
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                            {item.job_description_snippet}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}
        </div>
             <footer className="mt-auto border-t border-slate-200 py-6 text-xs text-slate-500 w-full text-center">
  <p>© 2026 HireLoop</p>
  <p className="mt-1">AI Resume Optimization Platform</p>
  <p className="mt-1 text-slate-400">Built by the HireLoop Team</p>
</footer>
      </main>
    </div>
  );
}
