import { getTokens, setTokens, subscribe } from '@/src/auth/session';

describe('auth/session', () => {
  beforeEach(() => {
    // Reset global singleton state between tests
    setTokens(null, null, 'auth');
  });

  it('starts with null tokens', () => {
    expect(getTokens()).toEqual({ accessToken: null, refreshToken: null });
  });

  it('notifies subscribers when tokens change', () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);

    setTokens('a', 'r', 'auth');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ accessToken: 'a', refreshToken: 'r' }, 'auth');

    unsubscribe();
  });

  it('does not notify when setting the same tokens', () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);

    setTokens('a', 'r', 'auth');
    setTokens('a', 'r', 'auth');

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('unsubscribe stops notifications', () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);

    setTokens('a', null, 'auth');
    unsubscribe();
    setTokens('b', null, 'auth');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports multiple subscribers', () => {
    const a = jest.fn();
    const b = jest.fn();
    const ua = subscribe(a);
    const ub = subscribe(b);

    setTokens('t', 'r', 'auth');

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    ua();
    ub();
  });
});
