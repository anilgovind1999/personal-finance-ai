import { useState } from 'react';
import type { Route } from './Shell';
import { Button, Modal } from './ui/Primitives';
import {
  IconCamera, IconChart, IconCheck, IconDownload, IconInbox, IconMessage, IconShield, IconWallet,
} from './Icons';

/**
 * The first-run tutorial.
 *
 * FinSight asks something unusual of a new user: that they approve every entry
 * before it counts. Without a word of explanation that reads as friction rather
 * than as the point, so this runs once, before the empty dashboard, and says
 * what the app expects of them and what it does in return.
 *
 * It is seven short cards, skippable at any step, and can be replayed from
 * Settings. It never appears again on its own. The last one covers putting the
 * app on the home screen, which is the step people otherwise never find.
 */

interface Step {
  icon: React.ReactNode;
  title: string;
  body: string;
  /** Where "Show me" takes them, when there is somewhere useful to go. */
  route?: Route;
  cta?: string;
}

/**
 * How this particular device adds an app to its home screen.
 *
 * Every platform hides it somewhere different, and generic advice to "install
 * the app" is what makes people give up. iOS has no install API at all, so the
 * only honest thing there is to name the two taps.
 */
function installHowTo(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua);
  const android = /android/i.test(ua);

  if (ios) {
    return 'On iPhone and iPad, open FinSight in Safari, tap the Share button at the bottom — the square with an arrow — scroll down and tap “Add to Home Screen”, then Add. It has to be Safari; Chrome on iOS cannot do it.';
  }
  if (android) {
    return 'On Android, tap the three-dot menu in Chrome and choose “Install app” or “Add to Home screen”, then Install. FinSight will also offer you a button when it is ready.';
  }
  return 'On a computer, look for the install icon at the right-hand end of Chrome or Edge’s address bar, or use the three-dot menu and choose “Install FinSight”. It then opens in its own window, without browser tabs.';
}

const STEPS: Step[] = [
  {
    icon: <IconWallet width={26} height={26} />,
    title: 'Your money, on your device',
    body:
      'FinSight tracks what you spend and earn, in rupees by default. Everything is stored on your own device first, so it opens instantly and works with no signal. If you have signed in, a copy syncs privately to your account so your phone and laptop agree.',
  },
  {
    icon: <IconMessage width={26} height={26} />,
    title: 'Paste a bank message, skip the typing',
    body:
      'Copy the SMS your bank sends when you spend, and paste it into Capture. The app reads the amount, the date, the merchant, the card and — usually — what kind of expense it was. UPI messages and payment emails work the same way.',
    route: 'capture',
    cta: 'Show me capture',
  },
  {
    icon: <IconCamera width={26} height={26} />,
    title: 'Or photograph the receipt',
    body:
      'Point the scanner at a printed bill and it reads the total, the date, the GST and the shop. The reading happens on your device — no photograph is ever uploaded anywhere.',
  },
  {
    icon: <IconInbox width={26} height={26} />,
    title: 'Nothing counts until you say so',
    body:
      'Everything the app reads waits in Pending Approval. You open each one, check what it guessed — the category is the part it most often gets wrong — and approve, correct, or reject it. This is deliberate: a wrong number that slips in unnoticed is worse than a minute of review.',
    route: 'approvals',
    cta: 'Show me the queue',
  },
  {
    icon: <IconChart width={26} height={26} />,
    title: 'Then the app has something to say',
    body:
      'Once entries are approved you get monthly trends, category breakdowns, budgets that warn you before you overspend, forecasts and savings goals. Reports export to Excel, PDF or CSV whenever you need them.',
  },
  {
    icon: <IconShield width={26} height={26} />,
    title: 'Mistakes are recoverable',
    body:
      'Deleting asks first, every change is written to a history you can read, and anything you remove sits in the recycle bin for 30 days. You can also export a full backup at any time from Settings.',
  },
  {
    icon: <IconDownload width={26} height={26} />,
    title: 'Put it on your home screen',
    body: `${installHowTo()} It then opens like any other app — its own icon, no address bar, and it still works with no signal.`,
  },
];

export function Tour({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (r: Route) => void;
}) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const finish = () => {
    setI(0);
    onClose();
  };

  const goTo = (route: Route) => {
    finish();
    onNavigate(route);
  };

  return (
    <Modal open={open} onClose={finish} title={`Getting started · ${i + 1} of ${STEPS.length}`}>
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/12 text-accent">
          {step.icon}
        </div>
        <h3 className="text-base font-bold text-ink">{step.title}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{step.body}</p>

        {step.route && step.cta && (
          <button
            type="button"
            onClick={() => goTo(step.route!)}
            className="mt-3 text-xs font-semibold text-accent hover:underline"
          >
            {step.cta} →
          </button>
        )}
      </div>

      <div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden="true">
        {STEPS.map((s, n) => (
          <span
            key={s.title}
            className={
              n === i ? 'h-1.5 w-5 rounded-full bg-accent' : 'h-1.5 w-1.5 rounded-full bg-line'
            }
          />
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <button type="button" onClick={finish} className="text-xs font-semibold text-subtle hover:text-muted">
          Skip
        </button>
        <div className="flex gap-2">
          {i > 0 && <Button onClick={() => setI((n) => n - 1)}>Back</Button>}
          {last ? (
            <Button variant="primary" onClick={finish}>
              <IconCheck width={15} height={15} /> Start using FinSight
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setI((n) => n + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
