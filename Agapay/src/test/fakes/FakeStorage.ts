import type { StoragePort, StorageSetOptions } from '@/src/shared/ports/storage';

export class FakeStorage implements StoragePort {
  private store = new Map<string, string>();
  public setCalls: { key: string; value: string | null; options?: StorageSetOptions }[] = [];
  public deleteCalls: string[] = [];

  async getItem(key: string): Promise<string | null> {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  async setItem(key: string, value: string | null, _options?: StorageSetOptions): Promise<void> {
    this.setCalls.push({ key, value, options: _options });
    if (value === null) this.store.delete(key);
    else this.store.set(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    this.deleteCalls.push(key);
    this.store.delete(key);
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.store.entries());
  }
}
