type Step2Input = {
  specializationIds: number[] | null | undefined;
  feeText: string;
};

type Step2Ok = {
  ok: true;
  specializationIds: number[];
  feePerSession: number;
};

type Step2Err = {
  ok: false;
  error: string;
};

function uniqueNumbers(ids: number[]): number[] {
  const out: number[] = [];
  for (const id of ids) {
    if (typeof id === 'number' && Number.isFinite(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function validateTherapistProfessionalDetailsStep(input: Step2Input): Step2Ok | Step2Err {
  const specializationIds = uniqueNumbers(input.specializationIds ?? []);

  if (specializationIds.length === 0) {
    return { ok: false, error: 'Please select at least one specialization.' };
  }

  const feeText = input.feeText ?? '';
  if (!feeText || feeText.trim() === '') {
    return { ok: false, error: 'Please enter your professional fee per session.' };
  }

  const feeNum = parseFloat(feeText);
  if (Number.isNaN(feeNum) || feeNum <= 0) {
    return { ok: false, error: 'Please enter a valid fee greater than 0.' };
  }

  return { ok: true, specializationIds, feePerSession: feeNum };
}
