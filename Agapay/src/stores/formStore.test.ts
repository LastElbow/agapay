import { FormStore } from '@/src/stores/formStore';

const STORAGE_KEY = 'agapay_form_store_v1';

type LocalStorageLike = {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
};

function createFakeLocalStorage(seed: Record<string, string> = {}): {
  localStorage: LocalStorageLike;
  data: Record<string, string>;
  setItemSpy: jest.Mock;
  removeItemSpy: jest.Mock;
} {
  const data: Record<string, string> = { ...seed };
  const setItemSpy = jest.fn((k: string, v: string) => {
    data[k] = v;
  });
  const removeItemSpy = jest.fn((k: string) => {
    delete data[k];
  });

  return {
    data,
    setItemSpy,
    removeItemSpy,
    localStorage: {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: setItemSpy,
      removeItem: removeItemSpy,
    },
  };
}

describe('formStore', () => {
  it('hydrates from localStorage on first load (web)', () => {
    const seed = {
      [STORAGE_KEY]: JSON.stringify({
        name: 'Jane',
        rawDigits: '0917',
        address: 'Somewhere',
        latitude: '1',
        longitude: '2',
        locationDisplayName: 'Loc',
        barangayId: 10,
        barangayName: 'Bgy',
      }),
    };
    const fake = createFakeLocalStorage(seed);

    const store = new FormStore(fake.localStorage);

    expect(store.getAll()).toEqual({
      name: 'Jane',
      rawDigits: '0917',
      address: 'Somewhere',
      latitude: '1',
      longitude: '2',
      locationDisplayName: 'Loc',
      barangayId: 10,
      barangayName: 'Bgy',
    });
  });

  it('flushes to localStorage when setters are called', () => {
    const fake = createFakeLocalStorage();
    const store = new FormStore(fake.localStorage);

    store.setName('A');
    store.setRawDigits('123');

    expect(fake.setItemSpy).toHaveBeenCalled();

    const raw = fake.data[STORAGE_KEY];
    expect(typeof raw).toBe('string');
    const parsed = JSON.parse(raw);
    expect(parsed).toMatchObject({
      name: 'A',
      rawDigits: '123',
    });
  });

  it('reset clears fields and removes storage key', () => {
    const fake = createFakeLocalStorage();
    const store = new FormStore(fake.localStorage);

    store.setName('A');
    store.reset();

    expect(store.getAll()).toEqual({
      name: '',
      rawDigits: '',
      address: '',
      latitude: '',
      longitude: '',
      locationDisplayName: '',
      barangayId: null,
      barangayName: '',
    });

    expect(fake.removeItemSpy).toHaveBeenCalledWith(STORAGE_KEY);
  });
});
