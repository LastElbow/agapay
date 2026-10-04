import type { StoragePort, StorageSetOptions } from '@/src/shared/ports/storage';
import { getItem, setItem, deleteItem } from '@/src/utils/safeSecureStore';

export const safeSecureStorePort: StoragePort = {
  getItem: (key) => getItem(key),
  setItem: (key, value, options?: StorageSetOptions) => setItem(key, value, options),
  deleteItem: (key) => deleteItem(key),
};
