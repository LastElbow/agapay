type Tokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

type SessionSource = 'auth' | 'interceptor';

let tokens: Tokens = { accessToken: null, refreshToken: null };
type Listener = (t: Tokens, source: SessionSource) => void;
const listeners = new Set<Listener>();

export function getTokens(): Tokens {
  return { ...tokens };
}

export function setTokens(accessToken: string | null, refreshToken: string | null, source: SessionSource) {
  const changed = tokens.accessToken !== accessToken || tokens.refreshToken !== refreshToken;
  tokens = { accessToken, refreshToken };
  if (changed) {
    listeners.forEach((l) => {
      try { l(getTokens(), source); } catch {}
    });
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type { Tokens as SessionTokens, SessionSource };

