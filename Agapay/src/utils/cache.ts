export interface Cache<T> {
  data: T | null;
  timestamp: number | null;
  hasData: () => boolean;
  isStale: (ttl: number) => boolean;
  get: () => T | null;
  set: (data: T) => void;
  invalidate: () => void;
}

export function createCache<T>(): Cache<T> {
  return {
    data: null,
    timestamp: null,
    hasData() {
      return this.data !== null;
    },
    isStale(ttl: number) {
      if (!this.timestamp) return true;
      return Date.now() - this.timestamp > ttl;
    },
    get() {
      return this.data;
    },
    set(data: T) {
      this.data = data;
      this.timestamp = Date.now();
    },
    invalidate() {
      this.data = null;
      this.timestamp = null;
    },
  };
}
