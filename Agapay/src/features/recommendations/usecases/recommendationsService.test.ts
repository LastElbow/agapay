import { createRecommendationsService } from '@/src/features/recommendations/usecases/recommendationsService';
import { FakeHttp } from '@/src/test/fakes/FakeHttp';
import { FakeStorage } from '@/src/test/fakes/FakeStorage';
import { FakeClock } from '@/src/test/fakes/FakeClock';

describe('createRecommendationsService', () => {
  it('serves from cache when fresh and preferences unchanged', async () => {
    const http = new FakeHttp();
    const storage = new FakeStorage();
    const clock = new FakeClock(1_000);

    http.on('GET', '/api/Preferences/me', () => ({ preferredSpecializations: ['a'] }));
    http.on('GET', '/api/Recommendation/me', () => ([{ therapistId: 1, therapistName: 't', profilePictureUrl: null, matchScore: 1, tier: 'Recommended', tierLabel: 'R', breakdown: null }]));

    const svc = createRecommendationsService({ http, storage, clock });

    const first = await svc.fetchRecommendations('u1');
    expect(first).toHaveLength(1);

    // Second call should hit prefs (hash check) but not recommendations endpoint.
    const second = await svc.fetchRecommendations('u1');
    expect(second).toHaveLength(1);

    const recCalls = http.calls.filter(c => c.url === '/api/Recommendation/me');
    expect(recCalls).toHaveLength(1);
  });

  it('invalidates cache when TTL expired', async () => {
    const http = new FakeHttp();
    const storage = new FakeStorage();
    const clock = new FakeClock(0);

    http.on('GET', '/api/Preferences/me', () => ({}));
    let recVersion = 1;
    http.on('GET', '/api/Recommendation/me', () => ([{ therapistId: recVersion++, therapistName: 't', profilePictureUrl: null, matchScore: 1, tier: 'Recommended', tierLabel: 'R', breakdown: null }]));

    const svc = createRecommendationsService({ http, storage, clock, ttlMs: 10 });

    const a = await svc.fetchRecommendations('u1');
    expect(a[0].therapistId).toBe(1);

    clock.advance(50);
    const b = await svc.fetchRecommendations('u1');
    expect(b[0].therapistId).toBe(2);
  });

  it('clears cache when preferences hash changes', async () => {
    const http = new FakeHttp();
    const storage = new FakeStorage();
    const clock = new FakeClock(0);

    let prefs = { preferredSpecializations: ['a'] };
    http.on('GET', '/api/Preferences/me', () => prefs);
    http.on('GET', '/api/Recommendation/me', () => ([{ therapistId: 1, therapistName: 't', profilePictureUrl: null, matchScore: 1, tier: 'Recommended', tierLabel: 'R', breakdown: null }]));

    const svc = createRecommendationsService({ http, storage, clock, ttlMs: 999999 });
    await svc.fetchRecommendations('u1');

    prefs = { preferredSpecializations: ['b'] };
    const cached = await svc.getCachedRecommendations('u1');
    expect(cached).toBeNull();
  });

  it('forceRefresh bypasses cache', async () => {
    const http = new FakeHttp();
    const storage = new FakeStorage();
    const clock = new FakeClock(0);

    http.on('GET', '/api/Preferences/me', () => ({}));
    let recVersion = 1;
    http.on('GET', '/api/Recommendation/me', () => ([{ therapistId: recVersion++, therapistName: 't', profilePictureUrl: null, matchScore: 1, tier: 'Recommended', tierLabel: 'R', breakdown: null }]));

    const svc = createRecommendationsService({ http, storage, clock, ttlMs: 999999 });

    const a = await svc.fetchRecommendations('u1');
    const b = await svc.fetchRecommendations('u1', { forceRefresh: true });

    expect(a[0].therapistId).toBe(1);
    expect(b[0].therapistId).toBe(2);
  });
});
