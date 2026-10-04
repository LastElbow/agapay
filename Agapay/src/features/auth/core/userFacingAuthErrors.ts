export type UserFacingError = {
  title: string;
  message: string;
};

const pickFirstValidationError = (err: any): string | null => {
  const errors = err?.response?.data?.errors;
  if (!errors || typeof errors !== 'object') return null;

  try {
    const values = Object.values(errors as Record<string, unknown>);
    const strings = values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
    return strings.length ? strings.join('\n') : null;
  } catch {
    return null;
  }
};

const pickServerMessage = (err: any): string | null => {
  const message = err?.response?.data?.message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
};

export function getUserFacingSignInError(err: any): UserFacingError {
  const status = err?.response?.status;

  if (status === 429) {
    return {
      title: 'Too Many Attempts',
      message: 'Please wait a moment and try again.',
    };
  }

  if (status === 401) {
    return {
      title: 'Login Failed',
      message: 'The email or password you entered is incorrect. Please try again.',
    };
  }

  if (status === 403) {
    return {
      title: 'Access Denied',
      message:
        pickServerMessage(err) ??
        'This account is not registered with the selected role.',
    };
  }

  if (status === 404) {
    return {
      title: 'Account Not Found',
      message:
        'No account exists with this email. Please check the email or sign up for a new account.',
    };
  }

  if (status === 400) {
    return {
      title: 'Invalid Input',
      message:
        pickServerMessage(err) ??
        pickFirstValidationError(err) ??
        'Please check your input and try again.',
    };
  }

  if (typeof status === 'number' && status >= 500) {
    return {
      title: 'Server Error',
      message: "We're experiencing technical difficulties. Please try again later.",
    };
  }

  if (!err?.response) {
    return {
      title: 'Network Error',
      message:
        'Unable to connect to the server. Please check your internet connection and try again.',
    };
  }

  return {
    title: 'Login Failed',
    message: 'Something went wrong. Please try again.',
  };
}

export function getUserFacingSignUpError(err: any): UserFacingError {
  const status = err?.response?.status;

  if (status === 429) {
    return {
      title: 'Too Many Attempts',
      message: 'Please wait a moment and try again.',
    };
  }

  if (status === 409) {
    return {
      title: 'Account Exists',
      message: 'An account with this email already exists. Try signing in instead.',
    };
  }

  if (status === 400) {
    return {
      title: 'Registration Failed',
      message:
        pickServerMessage(err) ??
        pickFirstValidationError(err) ??
        'Please check your details and try again.',
    };
  }

  if (typeof status === 'number' && status >= 500) {
    return {
      title: 'Server Error',
      message: 'Server error. Please try again later.',
    };
  }

  if (!err?.response) {
    return {
      title: 'Network Error',
      message: 'Network error. Please check your connection.',
    };
  }

  return {
    title: 'Registration Failed',
    message: 'Registration failed. Please try again.',
  };
}
