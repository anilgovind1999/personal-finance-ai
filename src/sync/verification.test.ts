import { describe, expect, it } from 'vitest';
import {
  autoAttemptsSpent, isPermanent, MAX_AUTO_ATTEMPTS, RESEND_COOLDOWN_MS, recordFailure, recordSent,
  remainingCooldownMs, shouldSend,
} from './verification';

const T = 1_700_000_000_000;

describe('deciding whether to send a confirmation email', () => {
  it('sends when nothing has been sent yet', () => {
    expect(shouldSend({}, T)).toBe(true);
  });

  it('does not send again just because the app was reopened', () => {
    expect(shouldSend(recordSent(T), T + RESEND_COOLDOWN_MS + 1)).toBe(false);
  });

  it('retries by itself when the last attempt failed', () => {
    const failed = recordFailure('auth/too-many-requests', 'Too many attempts.', {}, T);
    expect(shouldSend(failed, T + RESEND_COOLDOWN_MS + 1)).toBe(true);
  });

  it('holds off inside the cooldown, even when asked directly', () => {
    // Pressing Resend faster than this is what makes Firebase refuse outright,
    // so the button reports the wait rather than spending the attempt.
    const sent = recordSent(T);
    expect(shouldSend(sent, T + 1000, true)).toBe(false);
    expect(shouldSend(sent, T + RESEND_COOLDOWN_MS + 1, true)).toBe(true);
  });

  it('reports how long is left', () => {
    expect(remainingCooldownMs(recordSent(T), T + 20_000)).toBe(RESEND_COOLDOWN_MS - 20_000);
    expect(remainingCooldownMs(recordSent(T), T + RESEND_COOLDOWN_MS)).toBe(0);
    expect(remainingCooldownMs({}, T)).toBe(0);
  });
});

describe('recording what happened', () => {
  it('a success clears nothing but records the time', () => {
    expect(recordSent(T)).toEqual({ sentAt: T, triedAt: T });
  });

  it('a failure keeps an earlier success, so the screen can still say one went out', () => {
    const failed = recordFailure('auth/too-many-requests', 'Too many attempts.', recordSent(T), T + 90_000);
    expect(failed.sentAt).toBe(T);
    expect(failed.error).toBe('Too many attempts.');
    expect(failed.triedAt).toBe(T + 90_000);
  });
});

describe('failures a user cannot resolve by trying again', () => {
  it('names the ones that need the project fixed', () => {
    expect(isPermanent('auth/unauthorized-continue-uri')).toBe(true);
    expect(isPermanent('auth/operation-not-allowed')).toBe(true);
  });

  it('leaves the transient ones retryable', () => {
    expect(isPermanent('auth/too-many-requests')).toBe(false);
    expect(isPermanent('auth/network-request-failed')).toBe(false);
    expect(isPermanent(undefined)).toBe(false);
  });
});

describe('not sending forever on its own', () => {
  /** Repeated automatic failures, each one cooldown apart. */
  function afterFailures(n: number) {
    let state = {};
    for (let i = 0; i < n; i++) {
      state = recordFailure('auth/too-many-requests', 'Too many attempts.', state, T + i * RESEND_COOLDOWN_MS);
    }
    return state;
  }

  it('retries a failure by itself, but only a few times', () => {
    const nearly = afterFailures(MAX_AUTO_ATTEMPTS - 1);
    expect(shouldSend(nearly, T + 10 * RESEND_COOLDOWN_MS)).toBe(true);

    const spent = afterFailures(MAX_AUTO_ATTEMPTS);
    expect(shouldSend(spent, T + 10 * RESEND_COOLDOWN_MS)).toBe(false);
    expect(autoAttemptsSpent(spent)).toBe(true);
  });

  it('still sends when the user asks, after it has stopped trying', () => {
    const spent = afterFailures(MAX_AUTO_ATTEMPTS);
    expect(shouldSend(spent, T + 10 * RESEND_COOLDOWN_MS, true)).toBe(true);
  });

  it('does not count a user-requested send against the automatic budget', () => {
    const asked = recordFailure('auth/too-many-requests', 'Too many.', {}, T, false);
    expect(asked.autoAttempts ?? 0).toBe(0);
  });

  it('gives up at once on a failure retrying cannot fix', () => {
    const stuck = recordFailure('auth/unauthorized-continue-uri', 'Not authorised.', {}, T);
    expect(shouldSend(stuck, T + 10 * RESEND_COOLDOWN_MS)).toBe(false);
    expect(autoAttemptsSpent(stuck)).toBe(true);
  });

  it('a success wipes the slate, so a later failure starts over', () => {
    const spent = afterFailures(MAX_AUTO_ATTEMPTS);
    const sent = recordSent(T + 99 * RESEND_COOLDOWN_MS);
    expect(sent.autoAttempts).toBeUndefined();
    expect(autoAttemptsSpent(sent)).toBe(false);
    expect(spent).not.toEqual(sent);
  });
});
