/**
 * Stand-in for the heavy export/OCR libraries in the hosted preview build.
 *
 * The preview runs inside a sandbox that blocks page-initiated downloads and
 * cannot serve the 10 MB OCR runtime, so those features are switched off in the
 * UI. Aliasing the libraries to this module keeps roughly 1.5 MB of dead code
 * out of a bundle that has to be inlined into a single file.
 */
function unavailable(): never {
  throw new Error('This feature is disabled in the hosted preview. Run the app locally or deploy it for the full version.');
}

export default new Proxy({}, { get: unavailable, apply: unavailable });
