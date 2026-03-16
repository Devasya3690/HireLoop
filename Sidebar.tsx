import Link from 'next/link';

type Props = {
  step: number;
  onLogout: () => void;
};

export function Sidebar({ step, onLogout }: Props) {

  const workflow = [
    { id: 1, label: "Upload Resume",    icon: "📄" },
    { id: 2, label: "Job Description",  icon: "📋" },
    { id: 3, label: "Analysis",         icon: "🔍" },
    { id: 4, label: "Results",          icon: "✨" }
  ];

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200/70 bg-white shadow-[2px_0_16px_rgba(0,0,0,0.04)]">

      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-slate-100">
        <Link href="/dashboard" className="flex items-center gap-3 group">

          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200 group-hover:shadow-indigo-300 transition-shadow">
            <span className="text-sm font-bold">HL</span>
          </div>

          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-900 tracking-tight">
              HireLoop
            </span>
            <span className="text-[10px] font-medium text-indigo-400 tracking-wide uppercase">
              AI Resume Optimizer
            </span>
          </div>

        </Link>
      </div>


      {/* Navigation */}
      <nav className="flex-1 px-4 py-5 space-y-7 overflow-y-auto text-sm">

        {/* Workflow Steps */}
        <div>
          <p className="mb-4 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Workflow
          </p>

          <ul className="relative space-y-1">
            {/* Connecting line */}
            <div className="absolute left-[18px] top-6 bottom-6 w-px bg-slate-100 z-0" />

            {workflow.map((item) => {
              const isCompleted = step > item.id;
              const isActive    = step === item.id;
              const isUpcoming  = step < item.id;

              return (
                <li key={item.id} className="relative z-10">
                  <div
                    className={`
                      flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150
                      ${isActive   ? 'bg-indigo-50 shadow-sm' : ''}
                      ${isCompleted ? 'opacity-80' : ''}
                      ${isUpcoming  ? 'opacity-50' : ''}
                    `}
                  >
                    {/* Step indicator */}
                    {isCompleted && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold shadow-sm shadow-emerald-200">
                        ✓
                      </span>
                    )}
                    {isActive && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white text-[10px] font-bold shadow-md shadow-indigo-300 ring-4 ring-indigo-100">
                        {item.id}
                      </span>
                    )}
                    {isUpcoming && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-[10px] font-semibold text-slate-400">
                        {item.id}
                      </span>
                    )}

                    <div className="flex flex-col min-w-0">
                      <span
                        className={`text-[13px] font-semibold leading-tight truncate ${
                          isActive    ? 'text-indigo-700' :
                          isCompleted ? 'text-slate-600'  :
                                        'text-slate-400'
                        }`}
                      >
                        {item.label}
                      </span>
                      {isActive && (
                        <span className="text-[10px] text-indigo-400 font-medium mt-0.5">
                          In progress
                        </span>
                      )}
                      {isCompleted && (
                        <span className="text-[10px] text-emerald-500 font-medium mt-0.5">
                          Complete
                        </span>
                      )}
                    </div>

                  </div>
                </li>
              );
            })}
          </ul>
        </div>


        {/* Data section */}
        <div>
          <p className="mb-3 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Data
          </p>

          <ul className="space-y-1">
            <li>
              <button
                onClick={() => {
                  const el = document.getElementById("history");
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-indigo-600 hover:shadow-sm active:scale-[0.98]"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-sm">
                  🕑
                </span>
                History
              </button>
            </li>
          </ul>
        </div>

      </nav>


      {/* Footer */}
      <div className="border-t border-slate-100 px-4 py-4 space-y-3">

        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-semibold text-slate-600 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-[0.98]"
        >
          <span>↩</span>
          Logout
        </button>

        <p className="text-[10px] leading-relaxed text-slate-400 text-center">
          Secured with JWT · Your data stays private
        </p>

      </div>

    </aside>
  );
}
