import type { AccountInfo } from './firebase';

/**
 * Whether the person using the app is its owner.
 *
 * This gates housekeeping that would only confuse someone tracking real money —
 * loading nine months of invented history, chiefly. It is a tidiness measure and
 * nothing more: it hides controls, it does not protect anything. The real
 * boundary is `firestore.rules`, which lets every account reach only its own
 * data, the owner's included. Sample data would in any case only ever be written
 * to the ledger of whoever asked for it.
 *
 * A build with no Firebase project has no accounts at all, so the only person
 * who can be using it is whoever set it up.
 */
export function isOwner(account: AccountInfo | null, cloudConfigured: boolean): boolean {
  if (!cloudConfigured) return true;
  const owner = (import.meta.env.VITE_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!owner) return false;
  return (account?.email ?? '').trim().toLowerCase() === owner;
}
