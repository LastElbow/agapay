export type SignupStep1Input = {
  firstName: string;
  lastName: string;
  dobDate: Date | null;
  gender: string | null;
  now?: Date;
};

export type SignupStep1Ok = {
  ok: true;
  params: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
  };
};

export type SignupStep1Error = {
  ok: false;
  title: string;
  message: string;
};

export type SignupStep1Result = SignupStep1Ok | SignupStep1Error;

export function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatMissingFieldsList(fields: string[]): string {
  if (fields.length === 0) return '';
  if (fields.length === 1) return fields[0];
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`;
  return `${fields.slice(0, -1).join(', ')}, and ${fields[fields.length - 1]}`;
}

export function validateSignupStep1(input: SignupStep1Input): SignupStep1Result {
  const missingFields: string[] = [];
  if (!input.firstName) missingFields.push('First Name');
  if (!input.lastName) missingFields.push('Last Name');
  if (!input.dobDate) missingFields.push('Date of Birth');
  if (!input.gender) missingFields.push('Gender');

  if (missingFields.length > 0) {
    const fieldsList = formatMissingFieldsList(missingFields);
    return {
      ok: false,
      title: 'Missing Information',
      message: `Please fill in ${fieldsList}.`,
    };
  }

  const now = input.now ?? new Date();
  const currentYear = now.getFullYear();
  const birthYear = input.dobDate!.getFullYear();

  if (birthYear > currentYear) {
    return {
      ok: false,
      title: 'Invalid Date of Birth',
      message: 'Date of birth cannot be in the future.',
    };
  }

  if (birthYear < currentYear - 120) {
    return {
      ok: false,
      title: 'Invalid Date of Birth',
      message: 'Please enter a valid year of birth.',
    };
  }

  const minYear = currentYear - 13;
  if (birthYear > minYear) {
    return {
      ok: false,
      title: 'Invalid Date of Birth',
      message: 'You must be at least 13 years old to create an account.',
    };
  }

  return {
    ok: true,
    params: {
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: formatDate(input.dobDate!),
      gender: input.gender ?? '',
    },
  };
}
