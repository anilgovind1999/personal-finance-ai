import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui/Primitives';
import { IconInfo, IconShield, IconSparkles } from '@/components/Icons';
import { authErrorMessage, refreshAccount, resendVerification, type AccountInfo } from '@/sync/firebase';

/**
 * Shown to someone who is signed in but cannot use the app yet — either their
 * email is unproven, or the owner has not invited them.
 *
 * Both are explained plainly rather than left as a broken-looking app. Nothing
 * here grants access: the security rules decide that, and this screen only
 * reports what they will say.
 */
export function AccessGate({
  account, reason, onSignOut, onRecheck,
}: {
  account: AccountInfo;
  reason: 'unverified' | 'not-invited';
  onSignOut: () => void;
  onRecheck: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  // Verification happens in another tab or on the phone, so keep looking.
  useEffect(() => {
    if (reason !== 'unverified') return;
    const handle = setInterval(async () => {
      const fresh = await refreshAccount();
      if (fresh?.emailVerified) onRecheck();
    }, 5000);
    return () => clearInterval(handle);
  }, [reason, onRecheck]);

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
          {reason === 'unverified' ? (
            <>
              <h2 className="text-sm font-semibold">Confirm your email address</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                We sent a link to <strong className="text-ink">{account.email}</strong>. Open it, and this
                page will continue on its own.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Access is granted per email address, so the address has to be proven before your ledger
                can be opened. Check your spam folder if it has not arrived.
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
                  Resend the link
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
                  {checking ? 'Checking…' : "I've confirmed it"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold">Your account is not on the invite list</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                FinSight is shared with a small group. Ask the owner to add{' '}
                <strong className="text-ink">{account.email}</strong> to the invite list, then check again.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={checking}
                  onClick={async () => {
                    setChecking(true);
                    await refreshAccount();
                    onRecheck();
                    setChecking(false);
                  }}
                >
                  {checking ? 'Checking…' : 'Check again'}
                </Button>
              </div>
            </>
          )}

          {notice && <p className="mt-3 text-xs font-medium text-good">{notice}</p>}
          {error && <p className="mt-3 text-xs font-medium text-critical">{error}</p>}

          <div className="mt-4 border-t border-line pt-3">
            <button type="button" onClick={onSignOut} className="text-xs font-semibold text-accent hover:underline">
              Sign in as someone else
            </button>
          </div>
        </Card>

        <div className="flex items-start gap-2.5 rounded-card border border-line bg-surface px-3.5 py-3">
          {reason === 'unverified' ? (
            <IconShield width={16} height={16} className="mt-0.5 shrink-0 text-accent" />
          ) : (
            <IconInfo width={16} height={16} className="mt-0.5 shrink-0 text-accent" />
          )}
          <p className="text-xs leading-relaxed text-muted">
            Nothing you enter is stored until your account has access, and no other person's data is
            reachable from here at any point.
          </p>
        </div>
      </div>
    </div>
  );
}
