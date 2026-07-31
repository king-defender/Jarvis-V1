/**
 * Browser history / bfcache guards for auth UIs.
 *
 * Problems these prevent:
 * 1) Back button returns a logged-in user to a cached Login page
 * 2) Back/forward restores a logged-out shell while a token still exists
 * 3) bfcache (pageshow.persisted) rehydrates a stale auth screen
 *
 * Use history.replaceState (never push) when switching login ↔ app.
 */

export type AuthView = 'login' | 'app';

export type NavigationGuardOptions = {
  getView: () => AuthView;
  /** Called when history would show login but session is authenticated */
  onRequireApp: () => void;
  /** Called when history would show app but session is gone */
  onRequireLogin: () => void;
  isAuthenticated: () => boolean;
};

type HistoryAuthState = {
  commandosAuthView?: AuthView;
};

export function replaceAuthHistory(view: AuthView): void {
  const next: HistoryAuthState = { commandosAuthView: view };
  window.history.replaceState(next, '', window.location.href);
}

export function installAuthNavigationGuards(options: NavigationGuardOptions): () => void {
  const syncFromHistory = () => {
    const state = window.history.state as HistoryAuthState | null;
    const marked = state?.commandosAuthView;
    const authed = options.isAuthenticated();

    if (authed) {
      // Never allow a guest/login history entry while logged in.
      if (marked === 'login' || options.getView() === 'login') {
        replaceAuthHistory('app');
        options.onRequireApp();
      }
      return;
    }

    // Not authenticated: never allow an app history entry to stick.
    if (marked === 'app' || options.getView() === 'app') {
      replaceAuthHistory('login');
      options.onRequireLogin();
    }
  };

  const onPopState = () => {
    syncFromHistory();
  };

  const onPageShow = (event: PageTransitionEvent) => {
    // bfcache restore — re-assert auth view from live session, not cached DOM.
    if (event.persisted) {
      syncFromHistory();
    }
  };

  window.addEventListener('popstate', onPopState);
  window.addEventListener('pageshow', onPageShow as EventListener);

  // Seed current entry so Back has a known auth marker.
  replaceAuthHistory(options.isAuthenticated() ? 'app' : 'login');

  return () => {
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('pageshow', onPageShow as EventListener);
  };
}
