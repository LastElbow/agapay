jest.mock("@/api/client", () => {
  const api = {
    defaults: { baseURL: "https://example.test/api", headers: { common: {} } },
  };
  return { __esModule: true, default: api };
});

jest.mock("@/src/auth/session", () => {
  return { __esModule: true, getTokens: jest.fn(() => ({ accessToken: "current-token" })) };
});

jest.mock("@microsoft/signalr", () => {
  const HubConnectionState = {
    Disconnected: "Disconnected",
    Connected: "Connected",
  };

  const HttpTransportType = { WebSockets: "WebSockets" };
  const LogLevel = { Warning: "Warning" };

  let lastWithUrl = null;
  const createdConnections = [];

  class HubConnectionBuilder {
    withUrl(url, options) {
      lastWithUrl = { url, options };
      return this;
    }

    withAutomaticReconnect() {
      return this;
    }

    configureLogging() {
      return this;
    }

    build() {
      const handlers = new Map();
      const connection = {
        state: HubConnectionState.Disconnected,
        start: jest.fn(async () => {
          connection.state = HubConnectionState.Connected;
        }),
        stop: jest.fn(async () => {
          connection.state = HubConnectionState.Disconnected;
        }),
        on: jest.fn((eventName, cb) => {
          handlers.set(eventName, cb);
        }),
        __handlers: handlers,
      };
      createdConnections.push(connection);
      return connection;
    }
  }

  return {
    __esModule: true,
    HubConnectionBuilder,
    HubConnectionState,
    HttpTransportType,
    LogLevel,
    __mock: {
      createdConnections,
      getLastWithUrl: () => lastWithUrl,
      reset: () => {
        createdConnections.length = 0;
        lastWithUrl = null;
      },
    },
  };
});

describe("src/services/signalrManager", () => {
  beforeEach(() => {
    jest.resetModules();

    const signalr = require("@microsoft/signalr");
    signalr.__mock.reset();

    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    (console.warn as jest.Mock).mockRestore?.();
    (console.error as jest.Mock).mockRestore?.();
  });

  it("builds hub URL from apiClient baseURL (strip /api)", async () => {
    const mgr = require("@/src/services/signalrManager");
    const signalr = require("@microsoft/signalr");

    await mgr.getSharedConnection("chat", "token");

    expect(signalr.__mock.getLastWithUrl().url).toBe("https://example.test/hubs/chat");
  });

  it("uses /locationhub for location hub", async () => {
    const mgr = require("@/src/services/signalrManager");
    const signalr = require("@microsoft/signalr");

    await mgr.getSharedConnection("location", "token");

    expect(signalr.__mock.getLastWithUrl().url).toBe("https://example.test/locationhub");
  });

  it("dedupes concurrent connection creation and only starts once", async () => {
    const mgr = require("@/src/services/signalrManager");
    const signalr = require("@microsoft/signalr");

    const [a, b] = await Promise.all([
      mgr.getSharedConnection("chat", "t1"),
      mgr.getSharedConnection("chat", "t1"),
    ]);

    expect(a).toBe(b);
    expect(signalr.__mock.createdConnections).toHaveLength(1);
    expect(signalr.__mock.createdConnections[0].start).toHaveBeenCalledTimes(1);

    // Release twice; second release should stop and clear
    mgr.releaseConnection("chat");
    mgr.releaseConnection("chat");

    expect(signalr.__mock.createdConnections[0].stop).toHaveBeenCalledTimes(1);
    expect(mgr.getConnectionState("chat")).toBeNull();
  });

  it("accessTokenFactory prefers current token from getTokens", async () => {
    const session = require("@/src/auth/session");
    session.getTokens.mockReturnValueOnce({ accessToken: "fresh" });

    const mgr = require("@/src/services/signalrManager");
    const signalr = require("@microsoft/signalr");

    await mgr.getSharedConnection("chat", "stale");

    const { options } = signalr.__mock.getLastWithUrl();
    expect(options.accessTokenFactory()).toBe("fresh");
  });

  it("accessTokenFactory falls back to passed token", async () => {
    const session = require("@/src/auth/session");
    session.getTokens.mockReturnValueOnce({ accessToken: "" });

    const mgr = require("@/src/services/signalrManager");
    const signalr = require("@microsoft/signalr");

    await mgr.getSharedConnection("chat", "passed");

    const { options } = signalr.__mock.getLastWithUrl();
    expect(options.accessTokenFactory()).toBe("passed");
  });

  it("subscribeToEvent registers master handler once and dispatches to all callbacks", async () => {
    const mgr = require("@/src/services/signalrManager");
    const signalr = require("@microsoft/signalr");

    const conn = await mgr.getSharedConnection("chat", "t");

    const cb1 = jest.fn();
    const cb2 = jest.fn(() => {
      throw new Error("boom");
    });
    const cb3 = jest.fn();

    const unsub1 = mgr.subscribeToEvent("chat", "Message", cb1);
    const unsub2 = mgr.subscribeToEvent("chat", "Message", cb2);
    mgr.subscribeToEvent("chat", "Message", cb3);

    // Master handler registered once
    expect(conn.on).toHaveBeenCalledTimes(1);
    expect(conn.on).toHaveBeenCalledWith("Message", expect.any(Function));

    const master = signalr.__mock.createdConnections[0].__handlers.get("Message");
    master({ x: 1 });

    expect(cb1).toHaveBeenCalledWith({ x: 1 });
    expect(cb2).toHaveBeenCalledWith({ x: 1 });
    expect(cb3).toHaveBeenCalledWith({ x: 1 });
    expect(console.error).toHaveBeenCalled();

    unsub1();
    unsub2();
    master({ x: 2 });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(2);
  });

  it("subscribeToEvent warns and returns noop if no connection", () => {
    const mgr = require("@/src/services/signalrManager");

    const unsub = mgr.subscribeToEvent("chat", "Message", jest.fn());
    expect(console.warn).toHaveBeenCalled();
    expect(() => unsub()).not.toThrow();
  });

  it("closeAllConnections stops and clears all", async () => {
    const mgr = require("@/src/services/signalrManager");
    const signalr = require("@microsoft/signalr");

    await mgr.getSharedConnection("chat", "t");
    await mgr.getSharedConnection("contracts", "t");

    await mgr.closeAllConnections();

    expect(signalr.__mock.createdConnections[0].stop).toHaveBeenCalledTimes(1);
    expect(signalr.__mock.createdConnections[1].stop).toHaveBeenCalledTimes(1);
    expect(mgr.isConnected("chat")).toBe(false);
    expect(mgr.getConnectionState("chat")).toBeNull();
    expect(mgr.getConnectionState("contracts")).toBeNull();
  });
});
