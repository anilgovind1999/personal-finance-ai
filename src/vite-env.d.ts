/// <reference types="vite/client" />

/** Firebase configuration, supplied at build time. Absent means local-only. */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_SINGLE_FILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Commit this bundle was built from, stamped in by scripts/build-stamp.ts. */
declare const __BUILD_ID__: string;
/** When it was built, ISO 8601. */
declare const __BUILD_TIME__: string;
