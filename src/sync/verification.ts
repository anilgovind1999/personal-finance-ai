/**
 * Bookkeeping for the "confirm your email" step.
 *
 * Two things go wrong without it. Firebase rate-limits verification emails, so
 * an app that fires one off on every render earns `auth/too-many-requests` and
 * then sends nothing at all — which is how a working account ends up with no
 * email. And a failure that is swallowed leaves the app telling someone to
 * check an inbox for a message it never managed to send.
 *
 * So each attempt is recorded, successes and failures alike, and a cooldown
 * sits in front of the send. Kept free of Firebase so the rules can be tested
 * directly.
 */

export interface VerificationState {
  /** When a send last succeeded. Epoch ms. */
  sentAt?: number;
  /** When one was last attempted, successfully or not. */
  triedAt?: number;
  /** The failure, in the user's language. Absent once a send succeeds. */
  error?: string;
  /** Firebase's code for it, which decides whether retrying is worth offering. */
  code?: string;
  /** Sends the app made on its own, as opposed to ones the user asked for. */
  autoAttempts?: number;
  /** Set when the address turned out to be confirmed already. */
  alreadyVerified?: boolean;
}

/** Long enough that Firebase's own limiter is never the thing a user meets. */
export const RESEND_COOLDOWN_MS = 60_000;

/**
 * How many times the app will try on its own before it stops and waits to be
 * asked.
 *
 * Retrying a failure automatically is right the first couple of times — a
 * network blip should not need a button press. Retrying it forever is not: a
 * project that has exhausted its daily email quota would be hit once a minute
 * for as long as the tab stays open, which helps nobody and is precisely the
 * behaviour that earns a rate limit.
 */
export const MAX_AUTO_ATTEMPTS = 3;

export function remainingCooldownMs(state: VerificationState, now = Date.now()): number {
  if (!state.triedAt) return 0;
  return Math.max(0, state.triedAt + RESEND_COOLDOWN_MS - now);
}

/**
 * Whether to actually send.
 *
 * `force` is the user pressing Resend, which still respects the cooldown — the
 * button reports the wait rather than spending an attempt that Firebase would
 * refuse anyway. What force overrides is the "one send already succeeded"
 * rule, since wanting another copy is the whole point of the button.
 */
export function shouldSend(state: VerificationState, now = Date.now(), force = false): boolean {
  if (remainingCooldownMs(state, now) > 0) return false;
  if (force) return true;
  // Nothing automatic once a send has succeeded: reopening the app is not a
  // request for a second copy.
  if (state.sentAt) return false;
  // A failure is worth retrying, but only a few times. Past that the user asks.
  if (isPermanent(state.code)) return false;
  return (state.autoAttempts ?? 0) < MAX_AUTO_ATTEMPTS;
}

/** True when the app has given up trying by itself and the button is the only route. */
export function autoAttemptsSpent(state: VerificationState): boolean {
  return !state.sentAt && (isPermanent(state.code) || (state.autoAttempts ?? 0) >= MAX_AUTO_ATTEMPTS);
}

export function recordSent(now = Date.now()): VerificationState {
  // A success clears the failure and the attempt count: whatever was wrong is
  // no longer wrong.
  return { sentAt: now, triedAt: now };
}

export function recordFailure(
  code: string | undefined,
  message: string,
  previous: VerificationState = {},
  now = Date.now(),
  automatic = true,
): VerificationState {
  return {
    ...previous,
    triedAt: now,
    error: message,
    code,
    autoAttempts: (previous.autoAttempts ?? 0) + (automatic ? 1 : 0),
  };
}

/** A failure the user can do nothing about by pressing the button again. */
export function isPermanent(code?: string): boolean {
  return (
    code === 'auth/unauthorized-continue-uri' ||
    code === 'auth/invalid-continue-uri' ||
    code === 'auth/operation-not-allowed' ||
    code === 'auth/invalid-recipient-email'
  );
}

const KEY = 'finsight.verification';

/** Per-account, so signing in as someone else does not inherit their cooldown. */
export function loadState(uid: string): VerificationState {
  try {
    const raw = localStorage.getItem(`${KEY}.${uid}`);
    return raw ? (JSON.parse(raw) as VerificationState) : {};
  } catch {
    return {};
  }
}

export function saveState(uid: string, state: VerificationState): void {
  try {
    localStorage.setItem(`${KEY}.${uid}`, JSON.stringify(state));
  } catch {
    /* private mode; the cooldown is a courtesy, not a guarantee */
  }
}

export function clearState(uid: string): void {
  try {
    localStorage.removeItem(`${KEY}.${uid}`);
  } catch {
    /* nothing to do */
  }
}
