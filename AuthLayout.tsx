import Link from 'next/link';
import { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  title: string;
  subtitle?: string;
};

export function AuthLayout({ children, title, subtitle }: Props) {
  return (
    <div className="min-h-screen gradient-bg flex flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/40">
            <span className="text-lg font-semibold">HL</span>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold tracking-tight text-slate-50">
              HireLoop
            </span>
            <span className="text-xs text-slate-300">
              AI Resume Optimization for ATS Systems
            </span>
          </div>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-200">
          <Link href="/login" className="hover:text-white">
            Login
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-md shadow-slate-900/30 hover:bg-slate-100"
          >
            Get Started
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-12">
        <div className="card w-full max-w-md p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-slate-300">{subtitle}</p>
          )}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

