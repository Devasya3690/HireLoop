import { useEffect } from "react";
import { getToken } from "../lib/apiClient";
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { AuthLayout } from '../components/Layout/AuthLayout';
import { apiFetch, setToken } from '../lib/apiClient';

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export default function SignupPage() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (token) {
      router.replace("/dashboard");
    }
  }, []);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function passwordStrength() {
    if (password.length < 6) return 'Weak';
    if (password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)) {
      return 'Strong';
    }
    return 'Medium';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must include at least one number and one uppercase letter.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!acceptedTerms) {
      setError('You must accept the Terms & Privacy Policy.');
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch<{ token: string }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email: trimmedEmail,
          password
        }),
      });

      setToken(res.token);
      router.push('/dashboard');

    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your HireLoop account"
      subtitle="Optimize your resume for ATS systems and increase your interview chances."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Full Name
          </label>

          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your Name"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Email Address
          </label>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Password
          </label>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-xs text-slate-500 hover:text-slate-700"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {password && (
            <p className="mt-1 text-xs text-slate-500">
              Strength: {passwordStrength()}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Confirm Password
          </label>

          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          <span>
            I agree to the Terms & Privacy Policy
          </span>
        </div>

        {error && (
          <p className="text-sm text-rose-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-500/40 hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-500/60"
        >
          {loading ? 'Creating account…' : 'Create Account'}
        </button>

        <p className="pt-2 text-center text-xs text-slate-500">
          Already using HireLoop?{' '}
          <Link
            href="/login"
            className="font-medium text-brand-600 hover:text-brand-500"
          >
            Login instead
          </Link>
        </p>

      </form>
    </AuthLayout>
  );
}