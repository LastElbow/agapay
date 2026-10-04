export type StorageScope = 'auto' | 'session' | 'local';

export type StorageSetOptions = {
  scope?: StorageScope;
};

export interface StoragePort {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string | null, options?: StorageSetOptions): Promise<void>;
  deleteItem(key: string): Promise<void>;
}
