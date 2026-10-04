type Step3Input = {
  conditionIds: number[] | null | undefined;
  otherConditions: (string | null | undefined)[] | null | undefined;
};

type Step3Ok = {
  ok: true;
  conditionIds: number[];
  otherConditions: string[];
};

type Step3Err = {
  ok: false;
  error: string;
  conditionIds: number[];
  otherConditions: string[];
};

function uniqueNumbers(ids: number[]): number[] {
  const out: number[] = [];
  for (const id of ids) {
    if (typeof id === 'number' && Number.isFinite(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function normalizeOtherConditionsList(list: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of list || []) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }

  return out;
}

export function validateTherapistConditionsStep(input: Step3Input): Step3Ok | Step3Err {
  const conditionIds = uniqueNumbers(input.conditionIds ?? []);
  const otherConditions = normalizeOtherConditionsList(input.otherConditions ?? []);

  if (conditionIds.length === 0 && otherConditions.length === 0) {
    return {
      ok: false,
      error: 'Please select or enter at least one condition.',
      conditionIds,
      otherConditions,
    };
  }

  return { ok: true, conditionIds, otherConditions };
}
