import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { SyncDocName, SyncDocs } from './model';
import { SYNC_DOCS } from './model';

/**
 * Firebase wiring, loaded on demand.
 *
 * The app is fully usable with no Firebase project configured — everything here
 * is inert in that case and the ledger stays in local IndexedDB. Configuration
 * arrives through build-time environment variables, so no keys are committed.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export function readConfig(): FirebaseConfig | null {
  const env = import.meta.env;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
}

/** True when this build has a project to talk to. */
export function cloudConfigured(): boolean {
  return readConfig() !== null;
}

interface Services {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let servicesPromise: Promise<Services | null> | null = null;

/** Loads the SDK on first use, so a local-only build never pays for it. */
export function services(): Promise<Services | null> {
  if (servicesPromise) return servicesPromise;
  const config = readConfig();
  if (!config) {
    servicesPromise = Promise.resolve(null);
    return servicesPromise;
  }

  servicesPromise = (async () => {
    const [{ initializeApp, getApps }, authMod, storeMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ]);
    const app = getApps()[0] ?? initializeApp(config);
    const auth = authMod.getAuth(app);
    // Stays signed in across reloads by default, and lets Firestore serve from
    // cache while offline, so the app still opens on a train. The sign-in screen
    // can narrow this to the tab before someone signs in.
    await authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(() => undefined);
    let db: Firestore;
    try {
      db = storeMod.initializeFirestore(app, {
        localCache: storeMod.persistentLocalCache({
          tabManager: storeMod.persistentMultipleTabManager(),
        }),
      });
    } catch {
      // Already initialised (hot reload), or persistence unavailable.
      db = storeMod.getFirestore(app);
    }
    return { app, auth, db };
  })();

  return servicesPromise;
}

import {
  clearState, isPermanent, loadState, recordFailure, recordSent, remainingCooldownMs,
  saveState, shouldSend, type VerificationState,
} from './verification';

export interface AccountInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  /** Google sign-in is verified by definition; email/password is not. */
  emailVerified: boolean;
}

function toAccount(user: User): AccountInfo {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
  };
}

/** Calls back with the signed-in account, or null. Returns an unsubscribe. */
export async function watchAccount(fn: (a: AccountInfo | null) => void): Promise<() => void> {
  const svc = await services();
  if (!svc) {
    fn(null);
    return () => undefined;
  }
  const { onAuthStateChanged } = await import('firebase/auth');
  return onAuthStateChanged(svc.auth, (user) => fn(user ? toAccount(user) : null));
}

/** Turns Firebase's error codes into something worth reading. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'That does not look like an email address.',
    'auth/missing-password': 'Enter your password.',
    'auth/weak-password': 'Choose a password of at least 6 characters.',
    'auth/email-already-in-use': 'An account already exists for that email — sign in instead.',
    'auth/invalid-credential':
      'Email or password is not right. If you created this account with Google, use “Continue with Google” — or send yourself a reset link to set a password.',
    'auth/wrong-password': 'That password is not right for this address.',
    'auth/user-not-found': 'No account for that email — create one instead.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'Could not reach the server. Check your connection.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and retry.',
    'auth/operation-not-allowed': 'That sign-in method is not enabled on the Firebase project.',
    'auth/unauthorized-domain': 'This site is not in the Firebase project’s authorised domains.',
    'auth/unauthorized-continue-uri': 'This site is not in the Firebase project’s authorised domains, so the confirmation link cannot point back here.',
    'auth/invalid-continue-uri': 'The link the email should return to is not a valid address.',
    'auth/missing-continue-uri': 'The link the email should return to is missing.',
    'auth/invalid-recipient-email': 'That address was rejected as a recipient.',
    'auth/invalid-action-code': 'That confirmation link has already been used, or it is not valid. Send a fresh one.',
    'auth/expired-action-code': 'That confirmation link has expired. Send a fresh one.',
    'auth/user-token-expired': 'Your session expired. Sign in again.',
    'auth/quota-exceeded': 'The project has sent all the emails it is allowed to today. Try again tomorrow.',
  };
  if (map[code]) return map[code];
  const message = (err as { message?: string } | null)?.message;
  return message ? message.replace(/^Firebase:\s*/, '') : 'Sign-in failed.';
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const svc = await services();
  if (!svc) throw new Error('Cloud sync is not configured in this build.');
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  await signInWithEmailAndPassword(svc.auth, email.trim(), password);
}

/**
 * Sends the confirmation email, and says what happened.
 *
 * It deliberately does not throw. The account exists either way, and a thrown
 * error here would read as "registration failed" and send someone round to
 * create it a second time — which is one of the ways Firebase's rate limiter
 * gets tripped in the first place. The outcome is returned instead, and the
 * screen that asks the user to check their inbox says what actually happened.
 */
export async function sendVerification(force = false): Promise<VerificationState> {
  const svc = await services();
  const user = svc?.auth.currentUser;
  if (!user) return { error: 'You are not signed in.', triedAt: Date.now() };
  if (user.emailVerified) {
    clearState(user.uid);
    return { alreadyVerified: true };
  }

  const state = loadState(user.uid);
  if (!shouldSend(state, Date.now(), force)) return state;

  const { sendEmailVerification } = await import('firebase/auth');

  // Bring the reader back to the app rather than to Firebase's own page. The
  // continue URL has to be an authorised domain, so a project that has not had
  // this one added would otherwise fail to send at all — hence the retry below.
  const settings =
    typeof window !== 'undefined' ? { url: `${window.location.origin}/`, handleCodeInApp: false } : undefined;

  try {
    await sendEmailVerification(user, settings);
    const sent = recordSent();
    saveState(user.uid, sent);
    return sent;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (settings && (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri')) {
      // The link cannot come back here, but the email itself still matters.
      try {
        await sendEmailVerification(user);
        const sent = recordSent();
        saveState(user.uid, sent);
        return sent;
      } catch (plain) {
        const failed = recordFailure(
          (plain as { code?: string } | null)?.code,
          authErrorMessage(plain),
          state,
          Date.now(),
          !force,
        );
        saveState(user.uid, failed);
        return failed;
      }
    }
    const failed = recordFailure(code, authErrorMessage(err), state, Date.now(), !force);
    saveState(user.uid, failed);
    return failed;
  }
}

export async function registerWithPassword(
  email: string,
  password: string,
  name?: string,
): Promise<VerificationState> {
  const svc = await services();
  if (!svc) throw new Error('Cloud sync is not configured in this build.');
  const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
  const cred = await createUserWithEmailAndPassword(svc.auth, email.trim(), password);
  if (name?.trim()) await updateProfile(cred.user, { displayName: name.trim() }).catch(() => undefined);
  // Registration is open, but the address still has to be proven: the security
  // rules refuse to read or write anything until email_verified is true.
  return sendVerification();
}

/** Sends it again, for someone who never received the first one. */
export async function resendVerification(): Promise<VerificationState> {
  return sendVerification(true);
}

/** What the last attempt for this account did, for the screen to report. */
export function verificationState(uid: string): VerificationState {
  return loadState(uid);
}

export function verificationCooldownMs(uid: string): number {
  return remainingCooldownMs(loadState(uid));
}

export function verificationIsPermanent(uid: string): boolean {
  return isPermanent(loadState(uid).code);
}

/** Re-reads the account from Firebase, to pick up a verification done elsewhere. */
export async function refreshAccount(): Promise<AccountInfo | null> {
  const svc = await services();
  const user = svc?.auth.currentUser;
  if (!user) return null;
  await user.reload();
  await user.getIdToken(true);
  return toAccount(user);
}

/**
 * Whether the session survives closing the browser.
 *
 * Must be set before signing in — Firebase applies persistence to the sign-in
 * that follows, not retroactively. Someone on a shared machine can turn it off
 * and be signed out when the tab closes.
 */
export async function setStaySignedIn(stay: boolean): Promise<void> {
  const svc = await services();
  if (!svc) return;
  const { setPersistence, browserLocalPersistence, browserSessionPersistence } = await import('firebase/auth');
  await setPersistence(svc.auth, stay ? browserLocalPersistence : browserSessionPersistence).catch(
    () => undefined,
  );
}

export interface LinkResult {
  verified: boolean;
  error?: string;
}

/**
 * Proves the address by attaching the Google account that owns it.
 *
 * Google has already checked that this person can read this mailbox, which is
 * the same thing the confirmation email is for. So when the email never
 * arrives — a full daily quota, a spam filter, a mistyped address — this is a
 * way through that gives up nothing: the security rules still demand a verified
 * address, and the address is genuinely verified.
 *
 * Only the same address will do. A Google account under a different email links
 * a second identity to the login without proving the first one, so Firebase
 * refuses it and so does this.
 */
export async function verifyWithGoogle(): Promise<LinkResult> {
  const svc = await services();
  const user = svc?.auth.currentUser;
  if (!user) return { verified: false, error: 'You are not signed in.' };

  const { GoogleAuthProvider, linkWithPopup, reload } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  if (user.email) provider.setCustomParameters({ login_hint: user.email });

  try {
    await linkWithPopup(user, provider);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    // Already attached: nothing to do but re-read, which is the next step anyway.
    if (code !== 'auth/provider-already-linked') {
      if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        return {
          verified: false,
          error:
            'That Google account is already a separate FinSight account. Sign out and use “Continue with Google” instead.',
        };
      }
      return { verified: false, error: authErrorMessage(err) };
    }
  }

  // Linking a provider that vouches for the same address is what marks it
  // verified; re-read rather than assume, and say so plainly if it did not.
  await reload(user);
  await user.getIdToken(true);
  if (user.emailVerified) return { verified: true };
  return {
    verified: false,
    error:
      'Google signed in, but the address is still not marked confirmed. Use the emailed link instead.',
  };
}

export async function signInWithGoogle(): Promise<void> {
  const svc = await services();
  if (!svc) throw new Error('Cloud sync is not configured in this build.');
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  await signInWithPopup(svc.auth, new GoogleAuthProvider());
}

export async function sendReset(email: string): Promise<void> {
  const svc = await services();
  if (!svc) throw new Error('Cloud sync is not configured in this build.');
  const { sendPasswordResetEmail } = await import('firebase/auth');
  await sendPasswordResetEmail(svc.auth, email.trim());
}

export async function signOutOfCloud(): Promise<void> {
  const svc = await services();
  if (!svc) return;
  const { signOut } = await import('firebase/auth');
  await signOut(svc.auth);
}

/**
 * Every document lives under the signing-in user's UID, which is what isolates
 * one person's ledger from another's. The rules verify this same UID.
 */
function docPath(uid: string, name: SyncDocName): [string, string, string, string] {
  return ['users', uid, 'state', name];
}

export async function fetchDocs(uid: string): Promise<Partial<SyncDocs>> {
  const svc = await services();
  if (!svc) return {};
  const { doc, getDoc } = await import('firebase/firestore');
  const out: Partial<SyncDocs> = {};
  await Promise.all(
    SYNC_DOCS.map(async (name) => {
      const snap = await getDoc(doc(svc.db, ...docPath(uid, name)));
      if (snap.exists()) {
        (out as Record<string, unknown>)[name] = snap.data();
      }
    }),
  );
  return out;
}

export async function writeDocs(uid: string, docs: SyncDocs): Promise<void> {
  const svc = await services();
  if (!svc) return;
  const { doc, writeBatch } = await import('firebase/firestore');
  const batch = writeBatch(svc.db);
  for (const name of SYNC_DOCS) {
    batch.set(doc(svc.db, ...docPath(uid, name)), docs[name] as unknown as Record<string, unknown>);
  }
  await batch.commit();
}

/**
 * Watches the user's documents. `fn` fires whenever another device writes;
 * writes made by `selfDeviceId` are filtered out so a device does not react to
 * its own echo.
 */
export async function watchDocs(
  uid: string,
  selfDeviceId: string,
  fn: (docs: Partial<SyncDocs>) => void,
): Promise<() => void> {
  const svc = await services();
  if (!svc) return () => undefined;
  const { collection, onSnapshot } = await import('firebase/firestore');

  return onSnapshot(collection(svc.db, 'users', uid, 'state'), (snap) => {
    // Local echoes still have pending writes attached; wait for the server copy.
    if (snap.metadata.hasPendingWrites) return;
    const docs: Partial<SyncDocs> = {};
    let fromOther = false;
    snap.forEach((d) => {
      const data = d.data() as { deviceId?: string };
      if (data?.deviceId && data.deviceId !== selfDeviceId) fromOther = true;
      (docs as Record<string, unknown>)[d.id] = data;
    });
    if (fromOther) fn(docs);
  });
}
