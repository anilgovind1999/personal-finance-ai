import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui/Primitives';
import { IconShield, IconSparkles } from '@/components/Icons';
import {
  refreshAccount, resendVerification, sendVerification, verificationCooldownMs, verificationState,
  verifyWithGoogle, type AccountInfo,
} from '@/sync/firebase';
import { autoAttemptsSpent, isPermanent, type VerificationState } from '@/sync/verification';

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
  const [checking, setChecking] = useState(false);
  const [state, setState] = useState<VerificationState>(() => verificationState(account.uid));
  const [cooldown, setCooldown] = useState(() => verificationCooldownMs(account.uid));
  /** What the last "I've verified" press found, when it did not unlock. */
  const [checkResult, setCheckResult] = useState('');
  const [linking, setLinking] = useState(false);

  // An account that arrived here without a successful send — the first attempt
  // failed, or the app was reopened later — gets one now. sendVerification will
  // decline if one already went out, if the cooldown is running, or once it has
  // tried a few times on its own: this is not allowed to become a loop that
  // hammers the project's email quota for as long as the tab is open.
  useEffect(() => {
    let cancelled = false;
    void sendVerification().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [account.uid]);

  // Verification happens in another tab or on the phone, so keep looking.
  useEffect(() => {
    const handle = setInterval(async () => {
      const fresh = await refreshAccount();
      if (fresh?.emailVerified) onRecheck();
    }, 5000);
    return () => clearInterval(handle);
  }, [onRecheck]);

  // Counts the resend cooldown down, so the button explains itself.
  useEffect(() => {
    const handle = setInterval(() => setCooldown(verificationCooldownMs(account.uid)), 1000);
    return () => clearInterval(handle);
  }, [account.uid]);

  const sent = Boolean(state.sentAt) && !state.error;
  const stuck = isPermanent(state.code);
  const givenUp = autoAttemptsSpent(state);
  const waiting = Math.ceil(cooldown / 1000);

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

          {sent ? (
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              We sent a link to <strong className="text-ink">{account.email}</strong>. Open it, and this
              page will continue on its own.
            </p>
          ) : state.error ? (
            <p className="mt-1.5 rounded-xl border border-critical/35 bg-critical/10 px-3 py-2.5 text-xs leading-relaxed text-ink">
              <strong className="text-ink">The confirmation email could not be sent.</strong>{' '}
              {state.error}
              {stuck && ' This one needs fixing on the Firebase project — resending will not help.'}
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Sending a link to <strong className="text-ink">{account.email}</strong>…
            </p>
          )}

          <p className="mt-2 text-xs leading-relaxed text-muted">
            Confirming proves the address belongs to you before any of your financial data is stored.
            {sent && ' Check your spam folder if it has not arrived — it comes from a noreply@ address.'}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={busy || waiting > 0 || stuck}
              onClick={async () => {
                setBusy(true);
                const next = await resendVerification();
                setState(next);
                setCooldown(verificationCooldownMs(account.uid));
                setBusy(false);
              }}
            >
              {busy
                ? 'Sending…'
                : waiting > 0
                  ? `Resend in ${waiting}s`
                  : sent
                    ? 'Send it again'
                    : 'Try again'}
            </Button>
            <Button
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                setCheckResult('');
                const fresh = await refreshAccount();
                // onRecheck lifts the fresh account into the app, which unlocks
                // it when the address is confirmed. When it is not, saying so is
                // the difference between a button that works and one that looks
                // broken.
                onRecheck();
                if (!fresh) setCheckResult('Your session has expired — sign in again.');
                else if (!fresh.emailVerified) {
                  setCheckResult('Not confirmed yet. Open the link in the email first, then press this again.');
                }
                setChecking(false);
              }}
            >
              {checking ? 'Checking…' : "I've verified my email"}
            </Button>
          </div>

          {checkResult && <p className="mt-3 text-xs font-medium text-warning">{checkResult}</p>}

          {givenUp && !stuck && (
            <p className="mt-3 text-[11px] leading-relaxed text-subtle">
              The app has stopped trying by itself so it does not keep asking Firebase for an email it
              will not send. Use the button above when you are ready to try again.
            </p>
          )}

          {sent && waiting > 0 && (
            <p className="mt-3 text-[11px] text-subtle">
              Another can be sent in {waiting} second{waiting === 1 ? '' : 's'}. The wait is ours, not
              Firebase's — sending faster than this is what makes it refuse to send at all.
            </p>
          )}

          <div className="mt-4 border-t border-line pt-3">
            <p className="text-xs font-semibold text-ink">Not getting the email?</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              If <strong className="text-ink">{account.email}</strong> is a Google address, signing in with
              Google confirms it immediately — Google has already checked you can read that mailbox. You
              only do this once; afterwards your email and password sign you straight in.
            </p>
            <Button
              className="mt-2"
              disabled={linking}
              onClick={async () => {
                setLinking(true);
                setCheckResult('');
                const result = await verifyWithGoogle();
                if (result.verified) onRecheck();
                else setCheckResult(result.error ?? 'That did not confirm the address.');
                setLinking(false);
              }}
            >
              {linking ? 'Opening Google…' : 'Confirm with Google instead'}
            </Button>
          </div>

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
