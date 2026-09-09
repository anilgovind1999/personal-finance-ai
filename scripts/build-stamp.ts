import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Stamps each build with the commit it came from.
 *
 * Without this, "is the deployed site running the code I just pushed?" is
 * guesswork, and guessing wrong costs a debugging session: a stale deploy looks
 * exactly like a broken fix. The id goes into a <meta> tag so it can be read
 * with `curl` alone, no JavaScript, and into the app so Settings can show it.
 *
 * It also names the service worker's cache, so a new build cannot serve the
 * previous build's cached files.
 */
export function buildId(): string {
  // Vercel and Netlify both expose the commit; git is the fallback for local builds.
  const fromCI = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.COMMIT_REF ?? '';
  if (fromCI) return fromCI.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

export function buildStamp(): Plugin {
  const id = buildId();
  const at = new Date().toISOString();

  return {
    name: 'finsight-build-stamp',

    config() {
      return {
        define: {
          __BUILD_ID__: JSON.stringify(id),
          __BUILD_TIME__: JSON.stringify(at),
        },
      };
    },

    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `  <meta name="build-id" content="${id}" />\n    <meta name="build-time" content="${at}" />\n  </head>`,
      );
    },

    closeBundle() {
      // The service worker is copied verbatim from public/, so its cache name is
      // rewritten here rather than in the file itself.
      for (const dir of ['dist', 'dist-artifact']) {
        const sw = path.resolve(process.cwd(), dir, 'sw.js');
        if (!fs.existsSync(sw)) continue;
        const text = fs.readFileSync(sw, 'utf8').replace('__BUILD_ID__', id);
        fs.writeFileSync(sw, text);
      }
    },
  };
}
