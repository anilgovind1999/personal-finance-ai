import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui/Primitives';
import { IconShield, IconSparkles } from '@/components/Icons';
import { authErrorMessage, refreshAccount, resendVerification, type AccountInfo } from '@/sync/firebase';

/**
 * Shown to someone who is signed in but has not confirmed their email address.
 *
 * The security rules reject an unverified caller, so without this screen the
 * app would simply look broken. Nothing here grants access — it only explains
 * what the rules will say, and offers the two things that resolve it.
 */
export function AccessGate({
  account, onSignOut, onRecheck,
}: {
  account: AccountInfo;
  onSignOut: () => void;
  onRecheck: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  // Verification happens in another tab or on the phone, so keep looking.
  useEffect(() => {
    const handle = setInterval(async () => {
      const fresh = await refreshAccount();
      if (fresh?.emailVerified) onRecheck();
    }, 5000);
    return () => clearInterval(handle);
  }, [onRecheck]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-plane px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-white shadow-card">
            <IconSparkles width={22} height={22} />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight">FinSight</h1>
            <p className="text-xs text-subtle">Signed in as {account.email}</p>
          </div>
        </div>

        <Card>
          <h2 className="text-sm font-semibold">Confirm your email address</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            We sent a link to <strong className="text-ink">{account.email}</strong>. Open it, and this
            page will continue on its own.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Confirming proves the address belongs to you before any of your financial data is stored.
            Check your spam folder if it has not arrived.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true); setError(''); setNotice('');
                try {
                  await resendVerification();
                  setNotice('Sent. Check your inbox.');
                } catch (err) {
                  setError(authErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Resend verification email
            </Button>
            <Button
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                await refreshAccount();
                onRecheck();
                setChecking(false);
              }}
            >
              {checking ? 'Checking…' : "I've verified my email"}
            </Button>
          </div>

          {notice && <p className="mt-3 text-xs font-medium text-good">{notice}</p>}
          {error && <p className="mt-3 text-xs font-medium text-critical">{error}</p>}

          <div className="mt-4 border-t border-line pt-3">
            <button type="button" onClick={onSignOut} className="text-xs font-semibold text-accent hover:underline">
              Sign in as someone else
            </button>
          </div>
        </Card>

        <div className="flex items-start gap-2.5 rounded-card border border-line bg-surface px-3.5 py-3">
          <IconShield width={16} height={16} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted">
            Nothing is stored against your account until the address is confirmed, and no other person's
            data is reachable from here at any point.
          </p>
        </div>
      </div>
    </div>
  );
}
