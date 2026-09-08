import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from '@/types';
import { migrate } from '@/store/reducer';
import { deviceId, mergeDocs, mergeStates, oversizedDocs, splitState, type SyncDocs } from './model';
import {
  cloudConfigured, fetchDocs, isInvited, refreshAccount, signOutOfCloud, watchAccount, watchDocs,
  writeDocs, type AccountInfo,
} from './firebase';

export type SyncPhase = 'off' | 'signed-out' | 'connecting' | 'synced' | 'saving' | 'error';

export interface CloudSync {
  /** Whether this build has a Firebase project at all. */
  configured: boolean;
  account: AccountInfo | null;
  phase: SyncPhase;
  lastSyncedAt: string | null;
  error: string | null;
  /** Set while the account is being resolved, so the UI does not flash. */
  initialising: boolean;
  /** null while unknown; false when the owner has not invited this address. */
  invited: boolean | null;
  /** Re-reads the account and its invite status, after verifying or being added. */
  recheckAccess: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Pushes now rather than waiting for the debounce. */
  pushNow: () => void;
}

const SAVE_DEBOUNCE_MS = 1200;

/**
 * Keeps the local ledger and the signed-in user's cloud copy in step.
 *
 * The local IndexedDB copy stays the source the UI reads from, so the app works
 * offline and opens instantly; the cloud copy is a mirror that other devices
 * read. On sign-in the two are merged rather than one overwriting the other —
 * see mergeStates for the rules, which are what stop a second device from
 * wiping work done on the first.
 */
export function useCloudSync(
  state: AppState,
  ready: boolean,
  applyRemote: (next: AppState, notes: string[]) => void,
): CloudSync {
  const configured = cloudConfigured();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [initialising, setInitialising] = useState(configured);
  const [phase, setPhase] = useState<SyncPhase>(configured ? 'connecting' : 'off');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<boolean | null>(null);

  const device = useRef(deviceId());
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Set while a merge is being applied, so it is not echoed straight back. */
  const applying = useRef(false);
  const firstSyncDone = useRef(false);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    watchAccount((next) => {
      if (cancelled) return;
      setAccount(next);
      setPhase(next ? 'connecting' : 'signed-out');
      if (!next) {
        firstSyncDone.current = false;
        setInvited(null);
        setInitialising(false);
        return;
      }
      // An unverified address cannot be on the list as far as the rules are
      // concerned, so do not spend a read asking.
      if (!next.emailVerified) {
        setInvited(false);
        setInitialising(false);
        return;
      }
      void isInvited(next.email).then((ok) => {
        setInvited(ok);
        setInitialising(false);
      });
    }).then((un) => {
      if (cancelled) un();
      else unsubscribe = un;
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [configured]);

  // First sync after sign-in: pull, merge with what is on this device, push back.
  useEffect(() => {
    if (!configured || !account || !ready || firstSyncDone.current) return;
    if (!account.emailVerified || invited !== true) return;
    let cancelled = false;

    (async () => {
      try {
        setPhase('connecting');
        const remoteDocs = await fetchDocs(account.uid);
        if (cancelled) return;

        const hasRemote = Object.keys(remoteDocs).length > 0;
        if (hasRemote) {
          const remote = migrate(mergeDocs(remoteDocs, stateRef.current));
          const { state: merged, notes } = mergeStates(stateRef.current, remote);
          applying.current = true;
          applyRemote(merged, notes);
          // Let the reducer settle before the push effect reads it back.
          setTimeout(() => {
            applying.current = false;
          }, 0);
        }
        firstSyncDone.current = true;
        setError(null);
        setPhase('synced');
        setLastSyncedAt(new Date().toISOString());
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not reach the cloud copy.');
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, account, ready, applyRemote, invited]);

  // Live updates from the user's other devices.
  useEffect(() => {
    if (!configured || !account || !firstSyncDone.current) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    watchDocs(account.uid, device.current, (docs) => {
      if (cancelled) return;
      const remote = migrate(mergeDocs(docs, stateRef.current));
      const { state: merged, notes } = mergeStates(stateRef.current, remote);
      applying.current = true;
      applyRemote(merged, notes);
      setTimeout(() => {
        applying.current = false;
      }, 0);
      setLastSyncedAt(new Date().toISOString());
    }).then((un) => {
      if (cancelled) un();
      else unsubscribe = un;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [configured, account, applyRemote, phase]);

  const push = useCallback(
    async (next: AppState) => {
      if (!configured || !account) return;
      try {
        setPhase('saving');
        const docs: SyncDocs = splitState(next, {
          updatedAt: new Date().toISOString(),
          deviceId: device.current,
        });
        const oversized = oversizedDocs(docs);
        if (oversized.length) {
          // Better to say so than to have Firestore reject the write silently.
          setError(
            `Your ${oversized[0].name} data is close to the per-document limit. Export a backup and tell the developer — it needs splitting.`,
          );
        }
        await writeDocs(account.uid, docs);
        setError((prev) => (oversized.length ? prev : null));
        setPhase('synced');
        setLastSyncedAt(new Date().toISOString());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save to the cloud.');
        setPhase('error');
      }
    },
    [configured, account],
  );

  // Debounced push on every local change.
  useEffect(() => {
    if (!configured || !account || !ready || !firstSyncDone.current) return;
    if (applying.current) return;
    const handle = setTimeout(() => void push(state), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [configured, account, ready, state, push]);

  const recheckAccess = useCallback(async () => {
    const fresh = await refreshAccount();
    if (!fresh) return;
    setAccount(fresh);
    setInvited(fresh.emailVerified ? await isInvited(fresh.email) : false);
  }, []);

  const signOut = useCallback(async () => {
    await signOutOfCloud();
    firstSyncDone.current = false;
    setInvited(null);
    setPhase('signed-out');
    setLastSyncedAt(null);
  }, []);

  return {
    configured,
    account,
    phase,
    lastSyncedAt,
    error,
    initialising,
    invited,
    recheckAccess,
    signOut,
    pushNow: () => void push(stateRef.current),
  };
}
