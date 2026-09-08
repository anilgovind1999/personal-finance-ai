/**
 * Wraps the inlined page into a complete standalone document.
 *
 * scripts/build-artifact.mjs emits page *content* only, because the artifact
 * host supplies the surrounding skeleton. A file someone double-clicks has no
 * host, so it needs its own doctype, head and viewport.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const source = process.argv[2] ?? path.resolve('dist-artifact', 'finsight-preview.html');
const target = process.argv[3] ?? path.resolve('dist-artifact', 'finsight.html');
const body = readFileSync(source, 'utf8');

const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1a1a19">
<meta name="description" content="FinSight — personal finance and expense intelligence">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%92%B0%3C/text%3E%3C/svg%3E">
<style>html,body{margin:0;height:100%}body{font:14px system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
${body}
</body>
</html>
`;

writeFileSync(target, doc);
console.log(`wrap-standalone: wrote ${target} (${(Buffer.byteLength(doc) / 1048576).toFixed(2)} MB)`);
