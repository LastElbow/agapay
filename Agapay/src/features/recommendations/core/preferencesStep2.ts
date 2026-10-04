export type ServiceCategory<TService = { id: string; name: string }> = {
  id: string;
  category: string;
  services: TService[];
};

type Incoming = Record<string, any>;

type PatientProfileLike = {
  barangay?: unknown;
  Barangay?: unknown;
} | null | undefined;

export function safeParseIncomingPreferencesData(raw: unknown): Incoming {
  if (typeof raw !== 'string' || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Incoming) : {};
  } catch {
    return {};
  }
}

export function getPreferredSpecializationsFromIncoming(incoming: Incoming): string[] {
  const specs = incoming?.preferredSpecializations;
  if (Array.isArray(specs) && specs.length > 0) {
    return specs.map((x) => String(x)).filter((x) => x.trim().length > 0);
  }
  const single = incoming?.preferredSpecialization;
  if (typeof single === 'string' && single.trim().length > 0) return [single];
  return [];
}

export function mapSpecializationsToCategoryIds(
  specializationNames: string[],
  map: Record<string, string>,
): string[] {
  const out: string[] = [];
  for (const name of specializationNames ?? []) {
    const id = map[name];
    if (id) out.push(id);
  }
  return out;
}

export function reorderCategoriesBySelectedIds<T extends { id: string }>(
  categories: T[],
  selectedIds: string[],
): T[] {
  if (!Array.isArray(categories) || categories.length === 0) return [];
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) return categories;

  const matching: T[] = [];
  const others: T[] = [];

  for (const cat of categories) {
    if (selectedIds.includes(cat.id)) matching.push(cat);
    else others.push(cat);
  }

  matching.sort((a, b) => selectedIds.indexOf(a.id) - selectedIds.indexOf(b.id));
  return [...matching, ...others];
}

export function filterCategoriesByServiceQuery<T extends { id: string; services?: { name?: unknown }[] }>(
  categories: T[],
  query: unknown,
): T[] {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return categories;

  return categories
    .map((cat) => ({
      ...cat,
      services: (cat.services ?? []).filter((s) =>
        String((s as any)?.name ?? '').toLowerCase().includes(q),
      ),
    }))
    .filter((cat) => Array.isArray((cat as any).services) && (cat as any).services.length > 0);
}

export function getMatchedCategoryIdsByServiceQuery<T extends { id: string; services?: { name?: unknown }[] }>(
  categories: T[],
  query: unknown,
): string[] {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];

  const matched: string[] = [];
  for (const cat of categories ?? []) {
    const hasAny = (cat.services ?? []).some((s) =>
      String((s as any)?.name ?? '').toLowerCase().includes(q),
    );
    if (hasAny) matched.push(cat.id);
  }
  return matched;
}

export function buildPreferencesSubmitPayload(args: {
  incoming: Incoming;
  desiredServices: string[];
  patientProfile: PatientProfileLike;
}): Incoming {
  const barangay =
    (args.patientProfile as any)?.barangay ?? (args.patientProfile as any)?.Barangay ?? null;

  return {
    ...args.incoming,
    desiredServices: args.desiredServices,
    PreferredBarangay: barangay,
  };
}
