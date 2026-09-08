import { useEffect, useState } from 'react';
import { Button, cx } from '@/components/ui/Primitives';
import { IconDownload, IconX } from '@/components/Icons';

/**
 * Tells the user when a newer version has been deployed, and reloads into it.
 *
 * The service worker fetches the new build in the background; without this, the
 * app would keep running the old one until every tab happened to close. Nothing
 * reloads on its own — an unsaved entry form should not vanish under someone —
 * so the choice stays with the user.
 */
export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || cancelled) return;

      // A build that arrived while the app was closed is already waiting.
      if (reg.waiting) setWaiting(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          // 'installed' with a controller means this replaces a running copy.
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            setWaiting(next);
            setDismissed(false);
          }
        });
      });

      // Check on load and hourly, so a long-lived tab still notices a deploy.
      void reg.update().catch(() => undefined);
      const handle = setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
      return () => clearInterval(handle);
    });

    // The new worker takes over only after skipWaiting; reload once it does.
    let reloading = false;
    const onChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
    };
  }, []);

  if (!waiting || dismissed) return null;

  return (
    <div
      role="status"
      className={cx('fixed inset-x-3 bottom-24 z-40 mx-auto max-w-md rounded-card border border-accent/40',
        'bg-raised p-3.5 shadow-pop animate-fade-up lg:bottom-8 lg:left-auto lg:right-8 lg:mx-0')}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-accent"><IconDownload width={18} height={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">A new version is ready</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Reload to use it. Your data is untouched either way.
          </p>
          <Button
            variant="primary"
            className="mt-2.5"
            onClick={() => {
              // Ask the waiting worker to take over; controllerchange reloads us.
              waiting.postMessage({ type: 'SKIP_WAITING' });
            }}
          >
            Reload now
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Later"
          className="shrink-0 rounded-lg p-1 text-subtle hover:bg-plane hover:text-ink"
        >
          <IconX width={15} height={15} />
        </button>
      </div>
    </div>
  );
}
