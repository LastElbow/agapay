let mockGet: jest.Mock;

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockGet(...args),
  },
}));

function loadServerTimeModule() {
  jest.resetModules();
  // Jest (jest-expo) runs in CommonJS mode here; dynamic import() isn't enabled.
  // Using require() keeps module state resettable via jest.resetModules().
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/src/utils/serverTime');
  return mod?.default ?? mod;
}

describe('serverTime', () => {
  beforeEach(() => {
    mockGet = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('syncServerTime updates the computed server offset', async () => {
    mockGet.mockResolvedValue({ data: { serverTimeMs: 2000 } });

    let call = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      call += 1;
      if (call === 1) return 1000; // send
      if (call === 2) return 1200; // receive (RTT=200, oneWay=100)
      return 1300; // lastSyncTime + any subsequent calls
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { syncServerTime, getServerTimeOffset, isTimeSynced } = loadServerTimeModule();

    await syncServerTime();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/api/sessions/server-time');

    // estimatedServerTimeNow = 2000 + 100 = 2100
    // offset = 2100 - 1200 = 900
    expect(getServerTimeOffset()).toBe(900);
    expect(isTimeSynced()).toBe(true);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });

  it('dedupes concurrent sync calls (single request)', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    let resolveGet: (v: any) => void;
    mockGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGet = resolve;
        })
    );

    const { syncServerTime } = loadServerTimeModule();

    const p1 = syncServerTime();
    const p2 = syncServerTime();

    expect(mockGet).toHaveBeenCalledTimes(1);

    resolveGet!({ data: { serverTimeMs: 1000 } });
    await Promise.all([p1, p2]);
  });

  it('does not mark synced when server response is invalid', async () => {
    mockGet.mockResolvedValue({ data: { serverTimeMs: 'nope' } });
    jest.spyOn(Date, 'now').mockReturnValue(1000);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { syncServerTime, isTimeSynced, getServerTimeOffset } = loadServerTimeModule();

    await syncServerTime();

    expect(isTimeSynced()).toBe(false);
    expect(getServerTimeOffset()).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  });
});
