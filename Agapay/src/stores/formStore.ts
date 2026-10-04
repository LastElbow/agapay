import { action, makeObservable, observable } from "mobx";

const STORAGE_KEY = "agapay_form_store_v1";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export class FormStore {
  name = "";
  rawDigits = "";
  address = "";
  latitude = "";
  longitude = "";
  locationDisplayName = "";
  barangayId: number | null = null;
  barangayName: string = "";

  private storage: StorageLike | null;

  constructor(storage?: StorageLike | null) {
    this.storage =
      storage ??
      (typeof window !== "undefined" && (window as any).localStorage
        ? ((window as any).localStorage as StorageLike)
        : null);

    makeObservable(this, {
      name: observable,
      rawDigits: observable,
      address: observable,
      latitude: observable,
      longitude: observable,
      locationDisplayName: observable,
      barangayId: observable,
      barangayName: observable,
      setName: action,
      setRawDigits: action,
      setAddress: action,
      setLatitude: action,
      setLongitude: action,
      setLocationDisplayName: action,
      setBarangayId: action,
      setBarangayName: action,
      reset: action,
      resetAll: action,
    });

    try {
      if (this.storage) {
        const raw = this.storage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed) {
            this.name = parsed.name || this.name;
            this.rawDigits = parsed.rawDigits || this.rawDigits;
            this.address = parsed.address || this.address;
            this.latitude = parsed.latitude || this.latitude;
            this.longitude = parsed.longitude || this.longitude;
            this.locationDisplayName =
              parsed.locationDisplayName || this.locationDisplayName;
            this.barangayId = parsed.barangayId ?? this.barangayId;
            this.barangayName = parsed.barangayName || this.barangayName;
          }
        }
      }
    } catch (e) {
      console.debug("formStore hydration failed:", e);
    }
  }

  reset() {
    this.name = "";
    this.rawDigits = "";
    this.address = "";
    this.latitude = "";
    this.longitude = "";
    this.locationDisplayName = "";
    this.barangayId = null;
    this.barangayName = "";
    try {
      if (this.storage) {
        this.storage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.debug("formStore reset failed:", e);
    }
  }

  setName(n: string) {
    this.name = n;
    this.flushToStorage();
  }

  setRawDigits(d: string) {
    this.rawDigits = d;
    this.flushToStorage();
  }

  setAddress(a: string) {
    this.address = a;
    this.flushToStorage();
  }

  setLatitude(lat: string) {
    this.latitude = lat;
    this.flushToStorage();
  }

  setLongitude(lng: string) {
    this.longitude = lng;
    this.flushToStorage();
  }

  setLocationDisplayName(displayName: string) {
    this.locationDisplayName = displayName;
    this.flushToStorage();
  }

  setBarangayId(id: number | null) {
    this.barangayId = id;
    this.flushToStorage();
  }

  setBarangayName(name: string) {
    this.barangayName = name;
    this.flushToStorage();
  }

  flushToStorage() {
    try {
      if (!this.storage) return;
      const snapshot = {
        name: this.name,
        rawDigits: this.rawDigits,
        address: this.address,
        latitude: this.latitude,
        longitude: this.longitude,
        locationDisplayName: this.locationDisplayName,
        barangayId: this.barangayId,
        barangayName: this.barangayName,
      };
      this.storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {
      console.debug("formStore flush failed:", e);
    }
  }

  resetAll() {
    this.name = "";
    this.rawDigits = "";
    this.address = "";
    this.latitude = "";
    this.longitude = "";
    this.locationDisplayName = "";
    this.barangayId = null;
    this.barangayName = "";
    try {
      if (this.storage) {
        this.storage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }

  getName() {
    return this.name;
  }

  getRawDigits() {
    return this.rawDigits;
  }

  getAddress() {
    return this.address;
  }

  getLatitude() {
    return this.latitude;
  }

  getLongitude() {
    return this.longitude;
  }

  getLocationDisplayName() {
    return this.locationDisplayName;
  }

  getBarangayId() {
    return this.barangayId;
  }

  getBarangayName() {
    return this.barangayName;
  }

  getAll() {
    return {
      name: this.name,
      rawDigits: this.rawDigits,
      address: this.address,
      latitude: this.latitude,
      longitude: this.longitude,
      locationDisplayName: this.locationDisplayName,
      barangayId: this.barangayId,
      barangayName: this.barangayName,
    };
  }
}

export const formStore = new FormStore();
