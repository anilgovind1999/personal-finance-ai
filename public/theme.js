/**
 * Applies the saved theme before first paint, so a dark-mode user never sees a
 * white flash. Kept in its own file rather than inline so the app can ship a
 * Content-Security-Policy with no 'unsafe-inline' for scripts.
 */
(function () {
  try {
    var t = localStorage.getItem('pfa.theme') || 'dark';
    document.documentElement.classList.toggle('dark', t === 'dark');
  } catch (e) {
    /* private mode: fall back to the class already on <html> */
  }
})();
