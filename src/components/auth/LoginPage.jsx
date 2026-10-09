import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { cryptoAuthService } from '../../services/cryptoAuthService';

export function LoginPage({ onAuthSuccess, onContinueAsGuest, onCancel }) {
  const [mode, setMode] = useState('signin');
  const [showEmailForm, setShowEmailForm] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = mode === 'signin'
        ? await cryptoAuthService.signIn(email, password)
        : await cryptoAuthService.signUp(name, email, password);
      onAuthSuccess(user);
    } catch (err) {
      setError(err.message || 'We could not complete sign-in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const user = await cryptoAuthService.signInWithGoogle();
      onAuthSuccess(user);
    } catch (err) {
      setError(err.message || 'Google sign-in could not be completed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef0ed] px-4 py-8 text-[#30322c] sm:px-6">
      <section className="w-full max-w-md rounded-[22px] border border-[#e7e8e2] bg-white p-5 shadow-[0_8px_26px_rgba(37,43,34,0.06)] sm:p-8">
          <div className="w-full">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="mb-6 inline-flex items-center gap-2 rounded-lg text-xs font-medium text-[#777a72] transition-colors hover:text-[#34362f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to meeting setup
              </button>
            )}

            <div className="mb-6 flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-[#d8edb5] to-[#f2b59c] text-[#30332a]">
                <Video className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold tracking-tight text-[#282a25] sm:text-sm">SyncMeet AI</p>
                <p className="hidden text-[10px] text-[#85877f] sm:block">Intelligent video collaboration</p>
              </div>
            </div>

            <div className="mb-5">
              <h2 className="text-[22px] font-bold leading-tight tracking-tight text-[#292b25] sm:text-2xl">
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-[#777a72]">
                {mode === 'signin'
                  ? 'Sign in to pick up where your team left off.'
                  : 'Set up your account and make meetings easier to follow.'}
              </p>
            </div>

            {error && (
              <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#f0d5ce] bg-[#fff4f0] p-3.5 text-sm text-[#a94d40]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading || googleLoading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#e7e8e3] bg-white py-3 text-sm font-semibold text-[#45473f] transition-colors hover:bg-[#f4f5f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {googleLoading
                ? <LoaderCircle className="h-4 w-4 animate-spin text-[#718b4f]" />
                : <span aria-hidden="true" className="text-base font-bold text-[#4285f4]">G</span>}
              {googleLoading ? 'Connecting to Google…' : 'Continue with Google'}
            </button>

            <div className="my-5 flex items-center gap-3">
              <span aria-hidden="true" className="flex-1 border-t border-[#e8e9e5]" />
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-[#a1a39c]">
                or continue with email
              </span>
              <span aria-hidden="true" className="flex-1 border-t border-[#e8e9e5]" />
            </div>

            {!showEmailForm ? (
              <button
                type="button"
                onClick={() => { setShowEmailForm(true); setError(''); }}
                disabled={loading || googleLoading}
                className="w-full rounded-xl border border-[#dfe3d6] py-3 text-sm font-semibold text-[#536a37] transition-colors hover:bg-[#f5f7f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 disabled:opacity-60"
              >
                Continue with email
              </button>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-[#e8e9e3] bg-[#f3f4ef] p-1">
                  {['signin', 'signup'].map((nextMode) => (
                    <button
                      key={nextMode}
                      type="button"
                      onClick={() => { setMode(nextMode); setError(''); }}
                      disabled={loading || googleLoading}
                      aria-pressed={mode === nextMode}
                      className={`rounded-lg py-2.5 text-xs font-semibold transition-all ${
                        mode === nextMode
                          ? 'bg-[#f6dfcc] text-[#805437] shadow-sm ring-1 ring-inset ring-[#e8c4a5]'
                          : 'text-[#85877f] hover:text-[#45473f]'
                      }`}
                    >
                      {nextMode === 'signin' ? 'Sign in' : 'Create account'}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === 'signup' && (
                    <div>
                      <label htmlFor="auth-name" className="mb-1.5 block text-xs font-semibold text-[#555850]">
                        Your name
                      </label>
                      <input
                        id="auth-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        required
                        maxLength={80}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="w-full rounded-xl border border-[#e1e3dc] bg-[#fbfbf8] px-3.5 py-2.5 text-xs text-[#34362f] outline-none transition focus:border-[#9bbc6d] focus:ring-4 focus:ring-[#9bbc6d]/15"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="auth-email" className="mb-1.5 block text-xs font-semibold text-[#555850]">
                      Email address
                    </label>
                    <input
                      id="auth-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      required
                      maxLength={254}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@company.com"
                      className="w-full rounded-xl border border-[#e1e3dc] bg-[#fbfbf8] px-3.5 py-2.5 text-xs text-[#34362f] outline-none transition placeholder:text-[#a1a39c] focus:border-[#9bbc6d] focus:ring-4 focus:ring-[#9bbc6d]/15"
                    />
                  </div>

                  <div>
                    <label htmlFor="auth-password" className="mb-1.5 block text-xs font-semibold text-[#555850]">
                      Password
                    </label>
                    <input
                      id="auth-password"
                      name="password"
                      type="password"
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      required
                      minLength={mode === 'signin' ? 1 : 8}
                      maxLength={128}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={mode === 'signin' ? 'Enter your password' : 'At least 8 characters'}
                      className="w-full rounded-xl border border-[#e1e3dc] bg-[#fbfbf8] px-3.5 py-2.5 text-xs text-[#34362f] outline-none transition placeholder:text-[#a1a39c] focus:border-[#9bbc6d] focus:ring-4 focus:ring-[#9bbc6d]/15"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || googleLoading}
                    className="group mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#171815] px-4 py-3 text-[11px] font-semibold tracking-wide text-white shadow-[0_8px_20px_rgba(31,33,28,0.16)] transition-all hover:-translate-y-0.5 hover:bg-[#30322c] hover:shadow-[0_10px_24px_rgba(31,33,28,0.2)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                    {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                  </button>
                </form>
              </>
            )}

            <div className="mt-5 border-t border-[#e8e9e5] pt-4">
              <button
                type="button"
                onClick={onContinueAsGuest}
                disabled={loading || googleLoading}
                className="w-full rounded-lg py-2 text-sm font-semibold text-[#718b4f] transition-colors hover:text-[#536a37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 disabled:opacity-60"
              >
                Join without an account
              </button>
              <p className="mt-1 text-center text-[11px] text-[#92948d]">
                You can join first and create an account later.
              </p>
            </div>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-[#9a9c94]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#81995c]" />
              Your meetings stay in your control.
            </p>
          </div>
      </section>
    </main>
  );
}
