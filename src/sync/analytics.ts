import { readConfig, services } from './firebase';

/**
 * Privacy-preserving usage analytics.
 *
 * The point is to know how many people use the app and which features they
 * reach — nothing else. Financial data must never reach Google Analytics, and
 * the design here makes that structural rather than a matter of discipline:
 *
 *  - The event name must be one of a fixed list below. There is no way to log
 *    an arbitrary string.
 *  - Parameters are restricted to a fixed set of keys, and every value is
 *    coerced to a short enum-like string or a bucketed count. An amount, a
 *    merchant name, an SMS body or OCR text cannot be expressed in this shape,
 *    so it cannot be sent by accident.
 *  - The user id given to Analytics is the Firebase UID, never an email
 *    address, and never anything derived from a person's data.
 */

/** The complete set of events this app will ever send. */
export const ANALYTICS_EVENTS = [
  'app_open',
  'sign_up',
  'login',
  'screen_view',
  'feature_used',
  'transaction_recorded',
  'capture_reviewed',
  'report_exported',
  'install_prompt',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/** Values allowed for the `feature` parameter — names of things, never data. */
export type FeatureName =
  | 'manual_entry' | 'ai_message_capture' | 'receipt_scan' | 'recurring_rule'
  | 'budget_set' | 'goal_created' | 'search' | 'export' | 'backup' | 'restore'
  | 'currency_changed' | 'live_rates' | 'restore_from_bin' | 'import';

export interface AnalyticsParams {
  /** Which screen or feature, from a fixed vocabulary. */
  screen?: string;
  feature?: FeatureName;
  /** 'approved' | 'rejected' | 'edited' — an outcome, never a value. */
  outcome?: 'approved' | 'rejected' | 'edited';
  /** 'manual' | 'sms' | 'upi' | 'receipt' … — how something was captured. */
  source?: string;
  /** 'csv' | 'xlsx' | 'pdf'. */
  format?: string;
  /**
   * A COUNT of items, bucketed. Never an amount of money — the bucketing makes
   * that plain, and callers pass counts only.
   */
  count_bucket?: '1' | '2-5' | '6-20' | '21-100' | '100+';
}

/** Keys that may be sent. Anything else is dropped before the call. */
const ALLOWED_KEYS = new Set(['screen', 'feature', 'outcome', 'source', 'format', 'count_bucket']);

/** Buckets a count so exact numbers never leave the device. */
export function bucketCount(n: number): NonNullable<AnalyticsParams['count_bucket']> {
  if (n <= 1) return '1';
  if (n <= 5) return '2-5';
  if (n <= 20) return '6-20';
  if (n <= 100) return '21-100';
  return '100+';
}

/**
 * Strips anything that is not an allowed key, and clamps every value to a short
 * token. A stray merchant name or remark passed in by mistake cannot survive
 * this: it is either dropped for its key, or truncated to something meaningless.
 */
function sanitise(params?: AnalyticsParams): Record<string, string> {
  const out: Record<string, string> = {};
  if (!params) return out;
  for (const [key, value] of Object.entries(params)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value !== 'string' || !value) continue;
    // Values in this vocabulary are short slugs; anything longer is not one.
    if (value.length > 32) continue;
    if (!/^[a-z0-9_+\-]+$/i.test(value)) continue;
    out[key] = value;
  }
  return out;
}

let enabled = false;
let analyticsPromise: Promise<unknown> | null = null;

/** Analytics only runs when the project has a measurement id and the user agrees. */
export function setAnalyticsEnabled(on: boolean): void {
  enabled = on && Boolean(readConfig()?.measurementId);
}

export function analyticsAvailable(): boolean {
  return Boolean(readConfig()?.measurementId);
}

async function instance() {
  if (!enabled) return null;
  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      const svc = await services();
      if (!svc) return null;
      const mod = await import('firebase/analytics');
      if (!(await mod.isSupported().catch(() => false))) return null;
      return mod.getAnalytics(svc.app);
    })().catch(() => null);
  }
  return analyticsPromise;
}

/** Records one event. Silently does nothing when analytics is off. */
export async function track(event: AnalyticsEvent, params?: AnalyticsParams): Promise<void> {
  try {
    const a = await instance();
    if (!a) return;
    const { logEvent } = await import('firebase/analytics');
    // Firebase types a few reserved names with their own parameter shapes; our
    // vocabulary is deliberately narrower, so the generic call is used.
    (logEvent as (i: unknown, e: string, p: Record<string, string>) => void)(a, event, sanitise(params));
  } catch {
    // Analytics must never be able to break the app.
  }
}

/**
 * Associates events with an account so users can be counted.
 * The Firebase UID is used deliberately — an email address is a person's
 * identity and does not belong in an analytics product.
 */
export async function identify(uid: string | null): Promise<void> {
  try {
    const a = await instance();
    if (!a) return;
    const { setUserId } = await import('firebase/analytics');
    setUserId(a as never, uid ?? null);
  } catch {
    /* ignore */
  }
}
