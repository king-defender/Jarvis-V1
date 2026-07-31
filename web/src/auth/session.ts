const TOKEN_KEY = 'commandos.auth.token';
const AUTH_EVENT = 'commandos:auth-changed';

export type AuthSnapshot = {
  token: string | null;
  reason?: string;
};

type AuthListener = (snapshot: AuthSnapshot) => void;

let logoutInFlight = false;

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  logoutInFlight = false;
  notify({ token });
}

/**
 * Single-flight logout. Prevents redirect loops where:
 * logout → home → auth check → logout → home …
 */
export function clearSession(reason = 'logout'): void {
  if (logoutInFlight) return;
  logoutInFlight = true;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    notify({ token: null, reason });
  } finally {
    queueMicrotask(() => {
      logoutInFlight = false;
    });
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

export function subscribeAuth(listener: AuthListener): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AuthSnapshot>).detail;
    listener(detail);
  };
  window.addEventListener(AUTH_EVENT, handler as EventListener);
  return () => window.removeEventListener(AUTH_EVENT, handler as EventListener);
}

function notify(snapshot: AuthSnapshot): void {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: snapshot }));
}
