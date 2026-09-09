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
    // Keeps the session across reloads and lets Firestore serve from cache
    // while offline, so the app still opens on a train.
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
    'auth/invalid-credential': 'Email or password is not right.',
    'auth/wrong-password': 'Email or password is not right.',
    'auth/user-not-found': 'No account for that email — create one instead.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'Could not reach the server. Check your connection.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and retry.',
    'auth/operation-not-allowed': 'That sign-in method is not enabled on the Firebase project.',
    'auth/unauthorized-domain': 'This site is not in the Firebase project’s authorised domains.',
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

export async function registerWithPassword(email: string, password: string, name?: string): Promise<void> {
  const svc = await services();
  if (!svc) throw new Error('Cloud sync is not configured in this build.');
  const { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } = await import('firebase/auth');
  const cred = await createUserWithEmailAndPassword(svc.auth, email.trim(), password);
  if (name?.trim()) await updateProfile(cred.user, { displayName: name.trim() }).catch(() => undefined);
  // Registration is open, but the address still has to be proven: the security
  // rules refuse to read or write anything until email_verified is true.
  await sendEmailVerification(cred.user).catch(() => undefined);
}

/** Sends the verification email again, for someone who lost the first one. */
export async function resendVerification(): Promise<void> {
  const svc = await services();
  if (!svc?.auth.currentUser) throw new Error('Not signed in.');
  const { sendEmailVerification } = await import('firebase/auth');
  await sendEmailVerification(svc.auth.currentUser);
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
