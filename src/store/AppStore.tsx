import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  Account, AppState, Budget, CaptureSource, ExtractionResult, Goal, PendingItem, Settings, Transaction,
} from '@/types';
import { loadState, saveState, clearState, putAttachment, deleteAttachment } from '@/db/idb';
import { draftFromExtraction, emptyState, migrate, reducer, type Action } from './reducer';
import { parseMessage } from '@/engine/parser';
import { useCloudSync, type CloudSync } from '@/sync/useCloudSync';
import { uid } from '@/lib/utils';

interface StoreValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  ready: boolean;
  /** Runs text through the AI engine and queues the result for approval. */
  captureText: (text: string, source: CaptureSource, attachmentIds?: string[]) => PendingItem;
  captureExtraction: (extraction: ExtractionResult, rawText: string, source: CaptureSource, attachmentIds?: string[]) => PendingItem;
  storeAttachment: (file: File) => Promise<string>;
  removeAttachment: (id: string) => Promise<void>;
  resetAll: () => Promise<void>;
  /** Cloud account and sync status; inert when no Firebase project is configured. */
  cloud: CloudSync;
  toast: (message: string, tone?: ToastTone) => void;
  toasts: Toast[];
  dismissToast: (id: string) => void;
}

export type ToastTone = 'success' | 'error' | 'info';
export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

const StoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, emptyState);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadState<AppState>().then((stored) => {
      if (cancelled) return;
      if (stored) {
        dispatch({ type: 'hydrate', state: migrate(stored) });
        // Anything past its retention window goes now, not whenever the user
        // next happens to open the recycle bin.
        dispatch({ type: 'recycle/purgeExpired' });
        // Anything recurring that fell due while the app was closed goes to the
        // approval queue now, not silently into the ledger.
        dispatch({ type: 'recurring/runDue' });
      }
      hydrated.current = true;
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist after hydration only, so an empty initial state never overwrites saved data.
  useEffect(() => {
    if (!hydrated.current) return;
    const handle = setTimeout(() => void saveState(state), 250);
    return () => clearTimeout(handle);
  }, [state]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.settings.theme === 'dark');
    try {
      localStorage.setItem('pfa.theme', state.settings.theme);
    } catch {
      /* storage may be blocked; the class above is what matters */
    }
  }, [state.settings.theme]);

  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = uid('toast');
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const captureExtraction = useCallback<StoreValue['captureExtraction']>(
    (extraction, rawText, source, attachmentIds = []) => {
      const item: PendingItem = {
        id: uid('pend'),
        rawText,
        source,
        receivedAt: new Date().toISOString(),
        extraction,
        draft: draftFromExtraction(extraction, state.accounts),
        status: 'pending',
        attachmentIds,
      };
      dispatch({ type: 'pending/add', items: [item] });
      return item;
    },
    [state.accounts],
  );

  const captureText = useCallback<StoreValue['captureText']>(
    (text, source, attachmentIds = []) => {
      const extraction = parseMessage(text, {
        extraCategories: state.categories.filter((c) => c.custom).map((c) => c.name),
      });
      return captureExtraction(extraction, text, source, attachmentIds);
    },
    [captureExtraction, state.categories],
  );

  const storeAttachment = useCallback(async (file: File) => {
    const id = uid('att');
    await putAttachment(id, file);
    return id;
  }, []);

  const removeAttachment = useCallback(async (id: string) => {
    await deleteAttachment(id);
  }, []);

  const resetAll = useCallback(async () => {
    await clearState();
    dispatch({ type: 'reset' });
  }, []);

  // Applies a merged copy from another device without echoing it straight back.
  const applyRemote = useCallback(
    (next: AppState, notes: string[]) => {
      dispatch({ type: 'hydrate', state: next });
      if (notes.length) toast(notes.join(' · '), 'info');
    },
    [toast],
  );

  const cloud = useCloudSync(state, ready, applyRemote);

  const value = useMemo<StoreValue>(
    () => ({
      state, dispatch, ready, captureText, captureExtraction, storeAttachment,
      removeAttachment, resetAll, cloud, toast, toasts, dismissToast,
    }),
    [state, ready, captureText, captureExtraction, storeAttachment, removeAttachment, resetAll, cloud, toast, toasts, dismissToast],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside AppStoreProvider');
  return ctx;
}

/** Convenience selectors used across screens. */
export function useAppState(): AppState {
  return useStore().state;
}

export function useTransactions(): Transaction[] {
  return useStore().state.transactions;
}

export function useAccounts(): Account[] {
  return useStore().state.accounts;
}

export function usePendingQueue(): PendingItem[] {
  return useStore().state.pending.filter((p) => p.status === 'pending');
}

export function useBudgets(): Budget[] {
  return useStore().state.budgets;
}

export function useGoals(): Goal[] {
  return useStore().state.goals;
}

export function useSettings(): Settings {
  return useStore().state.settings;
}
