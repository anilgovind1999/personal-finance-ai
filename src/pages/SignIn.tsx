import { useState } from 'react';
import { Button, Card, cx } from '@/components/ui/Primitives';
import { IconShield, IconSparkles } from '@/components/Icons';
import {
  authErrorMessage, registerWithPassword, sendReset, signInWithGoogle, signInWithPassword,
} from '@/sync/firebase';

type Mode = 'signin' | 'register' | 'reset';

/**
 * The gate in front of a cloud-enabled build.
 *
 * Identity is Firebase's, and separation between users is enforced by Firestore
 * security rules on the server — not by anything this screen does. That matters:
 * a login rendered in the browser is only a door, never the lock.
 */
export function SignIn() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      if (done) setNotice(done);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (mode === 'reset') {
      if (!email.trim()) return setError('Enter the email to send a reset link to.');
      return void run(() => sendReset(email), 'Reset link sent. Check your inbox.');
    }
    if (!email.trim()) return setError('Enter your email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    return void run(async () => {
      if (mode !== 'register') return signInWithPassword(email, password);
      // The account is created either way; whether the confirmation email got
      // out is reported on the screen that follows, which is where it matters.
      await registerWithPassword(email, password, name);
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-plane px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-white shadow-card">
            <IconSparkles width={22} height={22} />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight">FinSight</h1>
            <p className="text-xs text-subtle">Personal Finance AI</p>
          </div>
        </div>

        <Card>
          <h2 className="text-sm font-semibold">
            {mode === 'register' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Sign in'}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {mode === 'reset'
              ? 'We will email you a link to set a new password.'
              : 'Your ledger syncs to this account and to no one else’s. Each person who signs in gets their own separate data.'}
          </p>

          <div className="mt-4 space-y-3">
            {mode === 'register' && (
              <label className="block">
                <span className="label">Your name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
              </label>
            )}

            <label className="block">
              <span className="label">Email</span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                autoFocus
              />
            </label>

            {mode !== 'reset' && (
              <label className="block">
                <span className="label">Password</span>
                <input
                  className="input"
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              </label>
            )}

            {error && <p className="text-xs font-medium text-critical">{error}</p>}
            {notice && <p className="text-xs font-medium text-good">{notice}</p>}

            <Button variant="primary" className="w-full" onClick={submit} disabled={busy}>
              {busy
                ? 'Working…'
                : mode === 'register'
                  ? 'Create account'
                  : mode === 'reset'
                    ? 'Send reset link'
                    : 'Sign in'}
            </Button>

            {mode !== 'reset' && (
              <>
                <div className="flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-[11px] uppercase tracking-wide text-subtle">or</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <Button className="w-full" onClick={() => void run(() => signInWithGoogle())} disabled={busy}>
                  Continue with Google
                </Button>
              </>
            )}
          </div>

          <div className={cx('mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs')}>
            {mode !== 'signin' && (
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => { setMode('signin'); setError(''); }}>
                Back to sign in
              </button>
            )}
            {mode === 'signin' && (
              <>
                <button type="button" className="font-semibold text-accent hover:underline" onClick={() => { setMode('register'); setError(''); }}>
                  Create an account
                </button>
                <button type="button" className="text-muted hover:underline" onClick={() => { setMode('reset'); setError(''); }}>
                  Forgot password
                </button>
              </>
            )}
          </div>
        </Card>

        <div className="flex items-start gap-2.5 rounded-card border border-line bg-surface px-3.5 py-3">
          <IconShield width={16} height={16} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted">
            Your transactions are stored under your account and are readable only by you — enforced on the
            server, not in this page. Receipt images stay on the device that captured them.
          </p>
        </div>
      </div>
    </div>
  );
}
