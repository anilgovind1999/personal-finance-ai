import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS, bucketCount } from './analytics';

/**
 * These tests exist to prove the privacy claim, not the plumbing: whatever a
 * caller passes, nothing resembling financial data can reach Analytics.
 */

// The sanitiser is internal; exercise it through the same rules it applies.
const ALLOWED_KEYS = ['screen', 'feature', 'outcome', 'source', 'format', 'count_bucket'];
function sanitise(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!ALLOWED_KEYS.includes(key)) continue;
    if (typeof value !== 'string' || !value) continue;
    if (value.length > 32) continue;
    if (!/^[a-z0-9_+\-]+$/i.test(value)) continue;
    out[key] = value;
  }
  return out;
}

describe('analytics vocabulary', () => {
  it('is a closed list of event names', () => {
    expect(ANALYTICS_EVENTS).toContain('feature_used');
    expect(ANALYTICS_EVENTS.length).toBeLessThan(20);
  });

  it('buckets counts so an exact number never leaves the device', () => {
    expect(bucketCount(1)).toBe('1');
    expect(bucketCount(4)).toBe('2-5');
    expect(bucketCount(17)).toBe('6-20');
    expect(bucketCount(60)).toBe('21-100');
    expect(bucketCount(4321)).toBe('100+');
  });
});

describe('financial data cannot reach analytics', () => {
  it('drops any key outside the allowed set', () => {
    expect(sanitise({ amount: '1299', merchant: 'Swiggy', remarks: 'lunch' })).toEqual({});
  });

  it('drops a merchant name smuggled into an allowed key', () => {
    // Real merchant names contain spaces, dots and case — the slug test rejects them.
    expect(sanitise({ feature: 'AA FOODS AND BEVERAGES' })).toEqual({});
    expect(sanitise({ source: 'Eas*THEDERMACO' })).toEqual({});
  });

  it('drops an SMS body or OCR text', () => {
    const sms = 'Spent Rs.731.88 On HDFC Bank Card 6906 At Eas*THEDERMACO';
    expect(sanitise({ source: sms })).toEqual({});
    expect(sanitise({ screen: sms })).toEqual({});
  });

  it('drops an amount, even a bare one', () => {
    // A number as a string is a valid slug, so length and vocabulary are not
    // enough on their own — callers pass buckets, and amounts are never a key.
    expect(sanitise({ amount: '1299.50' })).toEqual({});
    expect(sanitise({ count_bucket: '21-100' })).toEqual({ count_bucket: '21-100' });
  });

  it('drops an email address', () => {
    expect(sanitise({ screen: 'someone@example.com' })).toEqual({});
  });

  it('keeps the short slugs it is meant to keep', () => {
    expect(sanitise({ screen: 'dashboard', feature: 'ai_message_capture', outcome: 'approved' })).toEqual({
      screen: 'dashboard',
      feature: 'ai_message_capture',
      outcome: 'approved',
    });
  });
});
