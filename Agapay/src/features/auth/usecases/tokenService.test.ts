import { createAuthTokenService } from '@/src/features/auth/usecases/tokenService';
import { FakeHttp } from '@/src/test/fakes/FakeHttp';
import { FakeStorage } from '@/src/test/fakes/FakeStorage';
import { FakeClock } from '@/src/test/fakes/FakeClock';
import { FakeScheduler } from '@/src/test/fakes/FakeScheduler';
import { FakeSessionBus } from '@/src/test/fakes/FakeSessionBus';

function base64Url(json: any): string {
  const base64 = Buffer.from(JSON.stringify(json), 'utf8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function makeJwt(payload: any): string {
  const header = base64Url({ alg: 'none', typ: 'JWT' });
  const body = base64Url(payload);
  return `${header}.${body}.sig`;
}

describe('AuthTokenService', () => {
  it('dedupes concurrent refresh calls', async () => {
    const http = new FakeHttp();
    const storage = new FakeStorage();
    const session = new FakeSessionBus();
    const clock = new FakeClock(0);
    const scheduler = new FakeScheduler(() => clock.now());

    await storage.setItem('refreshToken', 'r1');
    await storage.setItem('accessToken', 'a1');

    let release!: () => void;
    const pending = new Promise<void>((r) => {
      release = () => r();
    });

    http.on('POST', '/api/Auth/refresh', async () => {
      await pending;
      return { accessToken: 'a2', refreshToken: 'r2' };
    });

    const svc = createAuthTokenService({ http, storage, session, clock, scheduler });

    const p1 = svc.refreshAccessToken();
    const p2 = svc.refreshAccessToken();

    release();

    const [t1, t2] = await Promise.all([p1, p2]);
    expect(t1).toBe('a2');
    expect(t2).toBe('a2');

    expect(http.calls.filter(c => c.method === 'POST' && c.url === '/api/Auth/refresh')).toHaveLength(1);
  });

  it('clears tokens on refresh failure', async () => {
    const http = new FakeHttp();
    const storage = new FakeStorage();
    const session = new FakeSessionBus();
    const clock = new FakeClock(0);
    const scheduler = new FakeScheduler(() => clock.now());

    await storage.setItem('refreshToken', 'r1');
    await storage.setItem('accessToken', 'a1');

    http.on('POST', '/api/Auth/refresh', async () => {
      throw new Error('fail');
    });

    let applied: string | null | undefined;
    const svc = createAuthTokenService({
      http,
      storage,
      session,
      clock,
      scheduler,
      applyAccessToken: (t) => { applied = t; },
    });

    const res = await svc.refreshAccessToken();
    expect(res).toBeNull();
    expect(applied).toBeNull();
    expect(await storage.getItem('accessToken')).toBeNull();
    expect(await storage.getItem('refreshToken')).toBeNull();
    expect(session.setCalls.at(-1)?.accessToken).toBeNull();
    expect(session.setCalls.at(-1)?.refreshToken).toBeNull();
  });

  it('persists with local scope when rememberMe true', async () => {
    const http = new FakeHttp();
    const storage = new FakeStorage();
    const session = new FakeSessionBus();
    const clock = new FakeClock(0);
    const scheduler = new FakeScheduler(() => clock.now());

    await storage.setItem('rememberMe', 'true');

    const svc = createAuthTokenService({ http, storage, session, clock, scheduler });
    await svc.persistTokens('a', 'r');

    const setCalls = storage.setCalls;
    expect(setCalls.find(c => c.key === 'accessToken')?.options?.scope).toBe('local');
    expect(setCalls.find(c => c.key === 'refreshToken')?.options?.scope).toBe('local');
  });

  it('schedules a preemptive refresh (does not reschedule for same exp)', () => {
    const http = new FakeHttp();
    const storage = new FakeStorage();
    const session = new FakeSessionBus();
    const clock = new FakeClock(1_000_000);
    const scheduler = new FakeScheduler(() => clock.now());

    const expSeconds = Math.floor((clock.now() + 120_000) / 1000);
    const token = makeJwt({ exp: expSeconds });

    const svc = createAuthTokenService({ http, storage, session, clock, scheduler });

    svc.schedulePreemptiveRefresh(token);
    const pending1 = scheduler.pending();

    svc.schedulePreemptiveRefresh(token);
    const pending2 = scheduler.pending();

    expect(pending1).toBe(1);
    expect(pending2).toBe(1);
  });
});
