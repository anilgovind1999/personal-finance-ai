import { useEffect, useState } from 'react';
import { Button, cx } from '@/components/ui/Primitives';
import { IconDownload, IconX } from '@/components/Icons';

/** The event Chromium fires when the app qualifies for installation. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pfa.installDismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Offers to install the app to the home screen or desktop.
 *
 * Chromium hands us an event we can trigger from a button. Safari has no such
 * API, so on iOS the only honest thing is to describe the two taps it takes.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      /* storage blocked — show it anyway */
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // Safari never fires that event, so offer the manual route instead.
    if (isIos() && window.location.protocol.startsWith('http')) {
      setShowIosHelp(true);
      setHidden(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* nothing to remember it with; it will offer again next time */
    }
  };

  if (hidden) return null;

  return (
    <div className={cx('fixed inset-x-3 bottom-24 z-40 mx-auto max-w-md rounded-card border border-line',
      'bg-raised p-3.5 shadow-pop animate-fade-up lg:bottom-8 lg:left-auto lg:right-8 lg:mx-0')}>
      <div className="flex items-start gap-3">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={36} height={36} className="shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Add FinSight to your home screen</p>
          {showIosHelp ? (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Tap the <strong>Share</strong> button in Safari, then <strong>Add to Home Screen</strong>. It
              opens like an app, full screen, and works offline.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Opens full screen like an app and works offline. No app store, nothing to download.
            </p>
          )}
          {!showIosHelp && event && (
            <Button
              variant="primary"
              className="mt-2.5"
              onClick={async () => {
                await event.prompt();
                await event.userChoice.catch(() => undefined);
                setHidden(true);
              }}
            >
              <IconDownload width={15} height={15} /> Install
            </Button>
          )}
        </div>
        <button type="button" onClick={dismiss} aria-label="Not now" className="shrink-0 rounded-lg p-1 text-subtle hover:bg-plane hover:text-ink">
          <IconX width={15} height={15} />
        </button>
      </div>
    </div>
  );
}
