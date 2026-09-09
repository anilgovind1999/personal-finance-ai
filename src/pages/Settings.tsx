import { useRef, useState } from 'react';
import type { AppState } from '@/types';
import type { Route } from '@/components/Shell';
import { useStore } from '@/store/AppStore';
import { NAV } from '@/components/Shell';
import { Badge, Button, Card, Modal, Select, Toggle, cx } from '@/components/ui/Primitives';
import { CURRENCIES } from '@/data/currencies';
import { fetchRates, ratesAreStale } from '@/engine/currency';
import { analyticsAvailable } from '@/sync/analytics';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { IconChevron, IconDownload, IconImport, IconShield, IconTrash } from '@/components/Icons';
import { migrate } from '@/store/reducer';
import { buildDemoState, DEMO_MESSAGES } from '@/store/demoData';
import { isOwner } from '@/sync/admin';
import { downloadBlob, monthKey, todayISO } from '@/lib/utils';

export function Settings({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const { state, dispatch, captureText, resetAll, cloud, toast } = useStore();
  const confirm = useConfirm();
  const owner = isOwner(cloud.account, cloud.configured);
  const [confirmReset, setConfirmReset] = useState(false);
  const [thresholds, setThresholds] = useState(state.settings.alertThresholds.join(', '));
  const [retention, setRetention] = useState(String(state.settings.retentionDays));
  const [fetchingRates, setFetchingRates] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const customCategories = state.categories.filter((c) => c.custom);
  const secondaryRoutes = NAV.filter((n) => !n.primary && n.route !== 'settings');

  const refreshRates = async () => {
    setFetchingRates(true);
    const { table, error } = await fetchRates(state.settings.currency);
    setFetchingRates(false);
    if (table) {
      dispatch({ type: 'settings/update', settings: { rateTable: table } });
      toast(`Rates updated — ${Object.keys(table.rates).length} currencies`);
    } else {
      toast(error ?? 'Could not fetch rates', 'error');
    }
  };

  const exportBackup = async () => {
    try {
      await downloadBlob(
        new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
        `finsight-backup-${todayISO()}.json`,
      );
      toast('Backup downloaded');
    } catch (err) {
      toast(`Backup failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    }
  };

  const importBackup = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const next = migrate(parsed) as AppState;
      if (!next.transactions && !next.accounts) throw new Error('Not a FinSight backup');
      dispatch({ type: 'replaceAll', state: next });
      toast(`Restored ${next.transactions.length} transactions`);
    } catch (err) {
      toast(`Could not read that backup: ${err instanceof Error ? err.message : 'invalid file'}`, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const loadDemo = () => {
    dispatch({ type: 'replaceAll', state: buildDemoState(todayISO()) });
    const m = monthKey(todayISO());
    setTimeout(() => {
      for (const msg of DEMO_MESSAGES) {
        captureText(msg.text.replace('{d1}', `${m}-05`).replace('{d2}', `${m}-06`), msg.source);
      }
      toast('Sample data loaded');
    }, 60);
  };

  const saveThresholds = () => {
    const parsed = thresholds
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 200)
      .sort((a, b) => a - b);
    if (!parsed.length) {
      toast('Enter at least one threshold between 1 and 200', 'error');
      return;
    }
    dispatch({ type: 'settings/update', settings: { alertThresholds: parsed } });
    setThresholds(parsed.join(', '));
    toast('Alert thresholds updated');
  };

  return (
    <div className="space-y-4">
      {/* On mobile these screens have no tab of their own. */}
      <Card title="More" className="lg:hidden" dense>
        <ul className="divide-y divide-line">
          {secondaryRoutes.map((n) => (
            <li key={n.route}>
              <button
                type="button"
                onClick={() => onNavigate(n.route)}
                className="flex w-full items-center gap-3 py-3 text-left text-sm font-medium text-ink"
              >
                <n.icon width={18} height={18} className="text-subtle" />
                {n.label}
                <IconChevron width={16} height={16} className="ml-auto text-subtle" />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Account & sync" subtitle={cloud.configured ? 'Your data follows this account across devices' : 'This build stores everything on this device only'}>
        {cloud.configured && cloud.account ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/12 text-sm font-bold text-accent">
                {(cloud.account.displayName || cloud.account.email || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{cloud.account.displayName || 'Signed in'}</p>
                <p className="truncate text-xs text-muted">{cloud.account.email}</p>
              </div>
              <Badge
                tone={cloud.phase === 'synced' ? 'good' : cloud.phase === 'error' ? 'critical' : 'warning'}
              >
                {cloud.phase === 'synced' ? 'Synced'
                  : cloud.phase === 'saving' ? 'Saving…'
                  : cloud.phase === 'error' ? 'Sync problem'
                  : 'Connecting…'}
              </Badge>
            </div>

            {cloud.lastSyncedAt && (
              <p className="mt-2 text-xs text-muted">
                Last synced {new Date(cloud.lastSyncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.
                Changes on another device appear here within a few seconds.
              </p>
            )}
            {cloud.error && <p className="mt-2 text-xs text-critical">{cloud.error}</p>}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
              <Button onClick={() => { cloud.pushNow(); toast('Pushing your latest changes'); }}>Sync now</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Sign out?',
                    message: 'You will need to sign in again to see your ledger on this device.',
                    reassurance: 'Your data stays in your account and on your other devices. The copy cached in this browser is left in place.',
                    confirmLabel: 'Sign out',
                  });
                  if (!ok) return;
                  await cloud.signOut();
                }}
              >
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-muted">
            No cloud project is configured in this build, so your ledger lives only in this browser and does
            not sync to your other devices. Set the Firebase environment variables at build time to turn on
            accounts and sync — the steps are in the README.
          </p>
        )}
      </Card>

      <Card title="Currency" subtitle="What your totals, budgets and reports are counted in">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Home currency</span>
            <Select
              value={state.settings.currency}
              onChange={(e) => {
                dispatch({ type: 'settings/update', settings: { currency: e.target.value } });
                toast(`Totals now shown in ${e.target.value}`);
              }}
              options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
            />
          </label>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-muted">
          Each transaction can be entered in whatever currency you actually paid in. It is converted once,
          at entry, and stored in {state.settings.currency} along with the original amount and the rate
          used — so a rate that moves next week never rewrites what last month cost.
        </p>

        <div className="mt-4 flex items-start justify-between gap-4 border-t border-line pt-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Fetch conversion rates automatically</p>
            <p className="text-xs leading-relaxed text-muted">
              Off by default. With it off, the app makes no internet requests at all and you type the rate
              yourself. Turning it on lets it fetch daily rates from open.er-api.com; only currency codes
              are sent, never anything about your spending.
            </p>
          </div>
          <Toggle
            checked={state.settings.liveRates}
            label="Fetch conversion rates"
            onChange={(v) => {
              dispatch({ type: 'settings/update', settings: { liveRates: v } });
              if (v) void refreshRates();
            }}
          />
        </div>

        {state.settings.liveRates && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={() => void refreshRates()} disabled={fetchingRates}>
              {fetchingRates ? 'Fetching…' : 'Update rates now'}
            </Button>
            {state.settings.rateTable ? (
              <span className="text-xs text-muted">
                {Object.keys(state.settings.rateTable.rates).length} rates from{' '}
                {state.settings.rateTable.source}, fetched{' '}
                {new Date(state.settings.rateTable.fetchedAt).toLocaleString('en-IN', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
                {ratesAreStale(state.settings.rateTable) && ' · worth refreshing'}
              </span>
            ) : (
              <span className="text-xs text-muted">No rates stored yet.</span>
            )}
          </div>
        )}
      </Card>

      <Card title="Appearance">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Dark mode</p>
            <p className="text-xs text-muted">Follows whichever you pick, on every device you use this browser on.</p>
          </div>
          <Toggle
            checked={state.settings.theme === 'dark'}
            label="Dark mode"
            onChange={(v) => dispatch({ type: 'settings/update', settings: { theme: v ? 'dark' : 'light' } })}
          />
        </div>
      </Card>

      <Card title="Budget alerts" subtitle="Percentages at which you want to be warned">
        <div className="flex flex-wrap gap-2">
          <input
            className="input max-w-xs"
            value={thresholds}
            onChange={(e) => setThresholds(e.target.value)}
            placeholder="80, 90, 100"
          />
          <Button variant="primary" onClick={saveThresholds}>Save</Button>
        </div>
        <p className="mt-2 flex flex-wrap gap-1.5">
          {state.settings.alertThresholds.map((t) => (
            <Badge key={t} tone={t >= 100 ? 'critical' : t >= 90 ? 'serious' : 'warning'}>{t}%</Badge>
          ))}
        </p>
      </Card>

      <Card title="Deleted items" subtitle="How long the recycle bin holds on to what you delete">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label">Keep for (days)</span>
            <input
              className="input tnum max-w-[8rem]"
              type="number"
              min="1"
              max="365"
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
            />
          </label>
          <Button
            variant="primary"
            onClick={() => {
              const days = Number(retention);
              if (!Number.isFinite(days) || days < 1 || days > 365) {
                toast('Choose between 1 and 365 days', 'error');
                return;
              }
              dispatch({ type: 'settings/update', settings: { retentionDays: Math.round(days) } });
              toast(`Deleted items now kept for ${Math.round(days)} days`);
            }}
          >
            Save
          </Button>
          <Button onClick={() => onNavigate('activity')}>Open the recycle bin</Button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-3">
          <div>
            <p className="text-sm font-semibold">Ask before deleting</p>
            <p className="text-xs text-muted">
              Confirm rejections and deletions before they happen. Leaving this on is recommended.
            </p>
          </div>
          <Toggle
            checked={state.settings.confirmDestructive}
            label="Ask before deleting"
            onChange={(v) => dispatch({ type: 'settings/update', settings: { confirmDestructive: v } })}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          {state.recycleBin.length
            ? `${state.recycleBin.length} item${state.recycleBin.length === 1 ? '' : 's'} currently in the recycle bin.`
            : 'The recycle bin is empty.'}
        </p>
      </Card>

      <Card title="Categories" subtitle={`${state.categories.length} in use · ${customCategories.length} of your own`}>
        {customCategories.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {customCategories.map((c) => (
              <li key={c.name}>
                <span className="chip">
                  {c.name}
                  <button
                    type="button"
                    aria-label={`Remove ${c.name}`}
                    onClick={async () => {
                      const used = state.transactions.filter((t) => t.category === c.name).length;
                      const ok = await confirm({
                        title: `Remove "${c.name}"?`,
                        message: `The category will no longer be offered when you record a transaction.`,
                        reassurance:
                          used > 0
                            ? `${used} existing transaction${used === 1 ? '' : 's'} keep this category and are not changed.`
                            : 'No transactions use it.',
                        confirmLabel: 'Remove category',
                      });
                      if (!ok) return;
                      dispatch({ type: 'category/remove', name: c.name });
                      toast(`Removed "${c.name}"`, 'info');
                    }}
                    className="text-subtle hover:text-critical"
                  >
                    <IconTrash width={12} height={12} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">
            No custom categories yet. Add one from the amount entry form when a transaction does not fit
            the built-in list.
          </p>
        )}
      </Card>

      <Card title="Usage statistics" subtitle="Counting how the app is used, never what you spend">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Share anonymous usage</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Sends which screens and features get opened, so the app's author can see what people
              actually use. <strong className="text-ink">No financial information is ever sent</strong> —
              not amounts, merchants, categories, accounts, receipts, messages or OCR text. Events carry
              short fixed labels like "dashboard" or "receipt_scan" and nothing else, and you are counted
              by an anonymous account id rather than your email address.
            </p>
          </div>
          <Toggle
            checked={state.settings.usageAnalytics}
            label="Share anonymous usage"
            onChange={(v) => {
              dispatch({ type: 'settings/update', settings: { usageAnalytics: v } });
              toast(v ? 'Anonymous usage sharing on' : 'Usage sharing off', 'info');
            }}
          />
        </div>
        {!analyticsAvailable() && (
          <p className="mt-3 text-xs text-subtle">
            This build has no analytics configured, so nothing is sent either way.
          </p>
        )}
      </Card>

      <Card title="Your data" subtitle="Everything lives in this browser and never leaves it">
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-line bg-plane px-3 py-2.5">
          <IconShield width={16} height={16} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted">
            Transactions, receipts and account details are stored locally in IndexedDB. Nothing is uploaded,
            no account is required, and only the last 4 digits of any card or account are ever kept.
            Clearing site data erases it, so take a backup before you do.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => onNavigate('import')}>
            <IconImport width={16} height={16} /> Import from another app or bank
          </Button>
          <Button onClick={() => void exportBackup()}><IconDownload width={16} height={16} /> Export backup (JSON)</Button>
          <label className="btn-ghost cursor-pointer">
            Restore from backup
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && void importBackup(e.target.files[0])}
            />
          </label>
          {owner &&
            (state.settings.demoLoadedAt ? (
              <Button
                onClick={() => {
                  dispatch({ type: 'data/clearSample' });
                  toast('Sample data cleared — your settings were kept');
                }}
              >
                Clear sample data
              </Button>
            ) : (
              <Button onClick={loadDemo}>Load sample data</Button>
            ))}
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            <IconTrash width={16} height={16} /> Erase everything
          </Button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-4">
          {[
            ['Transactions', state.transactions.length],
            ['Awaiting approval', state.pending.filter((p) => p.status === 'pending').length],
            ['Accounts', state.accounts.length],
            ['Goals', state.goals.length],
            ['History entries', state.audit.length],
            ['In recycle bin', state.recycleBin.length],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg bg-plane px-2.5 py-2">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-subtle">{label}</dt>
              <dd className="text-sm font-bold tnum">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="About">
        <p className="text-xs leading-relaxed text-muted">
          <strong className="text-ink">FinSight</strong> is an offline-first personal finance and expense
          intelligence app. Messages and receipts are read by an on-device engine that extracts the amount,
          date, merchant, category, payment mode and bank, scores its own confidence, and routes every
          result to a mandatory approval queue. Only what you approve reaches the ledger, dashboard,
          budgets, forecasts and reports.
        </p>
        <div className="mt-4 border-t border-line pt-3">
          <Button onClick={() => dispatch({ type: 'settings/update', settings: { onboarded: false } })}>
            Show the tutorial again
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/12 text-xs font-bold text-accent">
            G
          </span>
          <p className="text-xs font-semibold text-ink">
            Created by Govind
          </p>
          <p className={cx('ml-auto text-[11px] text-subtle')}>Version 1.1.0 · All amounts in INR</p>
        </div>
      </Card>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Erase everything?"
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                void resetAll();
                setConfirmReset(false);
                toast('All data erased', 'info');
              }}
            >
              Erase all data
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          This permanently deletes {state.transactions.length} transactions, {state.accounts.length} accounts,
          every budget, goal and stored receipt. It cannot be undone — export a backup first if you might
          want any of it back.
        </p>
      </Modal>
    </div>
  );
}
