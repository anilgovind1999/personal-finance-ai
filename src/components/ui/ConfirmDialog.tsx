import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Button, Modal } from './Primitives';

export interface ConfirmRequest {
  title: string;
  /** What is about to happen, in the user's terms. */
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /** Shown under the message — where the item goes and for how long. */
  reassurance?: string;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = createContext<((r: ConfirmRequest) => Promise<boolean>) | null>(null);

/**
 * Confirmation for anything destructive.
 *
 * A promise-based API keeps call sites readable — `if (await confirm({...}))` —
 * instead of every screen carrying its own dialog state.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((r: ConfirmRequest) => {
    setRequest(r);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setRequest(null);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={request !== null}
        onClose={() => settle(false)}
        title={request?.title ?? ''}
        footer={
          <>
            <Button variant="quiet" onClick={() => settle(false)}>
              {request?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={request?.tone === 'primary' ? 'primary' : 'danger'}
              onClick={() => settle(true)}
              autoFocus
            >
              {request?.confirmLabel ?? 'Delete'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-sm leading-relaxed text-ink">{request?.message}</div>
          {request?.reassurance && (
            <p className="rounded-xl bg-plane px-3 py-2.5 text-xs leading-relaxed text-muted">
              {request.reassurance}
            </p>
          )}
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** Returns a function that asks the user, resolving true only if they accept. */
export function useConfirm(): (r: ConfirmRequest) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
