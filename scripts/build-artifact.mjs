/**
 * Produces the single-file build for the hosted preview.
 *
 * The artifact host wraps the file in its own <!doctype>/<head>/<body>, so this
 * emits page *content* only: title, styles, the mount point and one inline
 * script carrying the whole app.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist-artifact');
const assets = path.join(dist, 'assets');
const files = readdirSync(assets);

const js = files.filter((f) => f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));
if (js.length !== 1) throw new Error(`expected one JS chunk, found ${js.length}: ${js.join(', ')}`);

const script = readFileSync(path.join(assets, js[0]), 'utf8');
const styles = css.map((f) => readFileSync(path.join(assets, f), 'utf8')).join('\n');

// Closing tags inside a string literal would end the inline script early.
// U+FFFD and lone surrogates are legitimate characters inside bundled string
// literals (a UTF-8 decoder's replacement char, XML character-class ranges),
// but the artifact host rejects them raw. Writing them as \u escapes is
// lossless — the minifier already escapes neighbouring codepoints the same way.
const esc = (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
const safeScript = script
  .replace(/<\/script>/gi, '<\\/script>')
  .replace(/\uFFFD/g, esc)
  .replace(/[\uD800-\uDFFF]/g, esc);

const out = `<title>FinSight</title>
<style>
/* The app owns its own light/dark palette and paints its background, so it
   holds up on either host ground. Its in-app toggle drives the .dark class. */
html, body { height: 100%; margin: 0; }
#root { min-height: 100%; }
${styles}
</style>

<div id="root"></div>

<script>
// Restore the saved theme before the app mounts, so a returning dark-mode
// viewer never sees a white flash.
(function () {
  try {
    var t = localStorage.getItem('pfa.theme') || 'dark';
    document.documentElement.classList.toggle('dark', t === 'dark');
  } catch (e) {}
})();
</script>

<script type="module">
${safeScript}
</script>
`;

const target = process.argv[2] ?? path.join(dist, 'finsight-preview.html');
writeFileSync(target, out);
console.log(`build-artifact: wrote ${target} (${(Buffer.byteLength(out) / 1048576).toFixed(2)} MB)`);
