/** Restore only when the OS shows this app. Never requests foreground ownership. */
export function watchLifecycle(document: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>, window: Pick<Window, 'addEventListener' | 'removeEventListener'>, resume: () => void, suspend = () => {}) {
  const visibility = () => { if (document.hidden) suspend(); else resume(); };
  const shown = () => { if (!document.hidden) resume(); };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pageshow', shown); window.addEventListener('pagehide', suspend);
  return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pageshow', shown); window.removeEventListener('pagehide', suspend); };
}
