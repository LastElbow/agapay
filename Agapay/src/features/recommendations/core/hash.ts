export type PreferencesSnapshot = {
  specializations?: any;
  budget?: any;
  gender?: any;
  services?: any;
  availabilities?: any;
  barangay?: any;
};

function stableStringify(obj: any): string {
  // Minimal stable stringify for predictable hashes.
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function simpleDeterministicHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

export function hashPreferences(userId: string, prefs: PreferencesSnapshot): string {
  const payload = stableStringify(prefs);
  return `${userId}-${simpleDeterministicHash(payload)}`;
}
