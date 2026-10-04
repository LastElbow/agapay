export type SessionTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

export type SessionSource = 'auth' | 'interceptor';

export class FakeSessionBus {
  private tokens: SessionTokens = { accessToken: null, refreshToken: null };
  public setCalls: { accessToken: string | null; refreshToken: string | null; source: SessionSource }[] = [];

  getTokens(): SessionTokens {
    return { ...this.tokens };
  }

  setTokens(accessToken: string | null, refreshToken: string | null, source: SessionSource) {
    this.tokens = { accessToken, refreshToken };
    this.setCalls.push({ accessToken, refreshToken, source });
  }
}
