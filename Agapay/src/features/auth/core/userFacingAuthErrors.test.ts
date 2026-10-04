import {
  getUserFacingSignInError,
  getUserFacingSignUpError,
} from '@/src/features/auth/core/userFacingAuthErrors';

describe('userFacingAuthErrors', () => {
  it('maps sign-in status codes to friendly messages', () => {
    const err429: any = { response: { status: 429 } };
    expect(getUserFacingSignInError(err429).title).toBe('Too Many Attempts');

    const err401: any = { response: { status: 401 } };
    expect(getUserFacingSignInError(err401).title).toBe('Login Failed');

    const err403: any = { response: { status: 403, data: { message: 'Role mismatch' } } };
    expect(getUserFacingSignInError(err403)).toEqual({
      title: 'Access Denied',
      message: 'Role mismatch',
    });

    const err404: any = { response: { status: 404 } };
    expect(getUserFacingSignInError(err404).title).toBe('Account Not Found');

    const err400Errors: any = {
      response: { status: 400, data: { errors: { Email: ['Invalid email'] } } },
    };
    expect(getUserFacingSignInError(err400Errors)).toEqual({
      title: 'Invalid Input',
      message: 'Invalid email',
    });

    const errNoResp: any = new Error('network');
    expect(getUserFacingSignInError(errNoResp).title).toBe('Network Error');
  });

  it('maps sign-up status codes to friendly messages', () => {
    const err429: any = { response: { status: 429 } };
    expect(getUserFacingSignUpError(err429).title).toBe('Too Many Attempts');

    const err409: any = { response: { status: 409 } };
    expect(getUserFacingSignUpError(err409).title).toBe('Account Exists');

    const err400: any = { response: { status: 400, data: { message: 'Bad input' } } };
    expect(getUserFacingSignUpError(err400)).toEqual({
      title: 'Registration Failed',
      message: 'Bad input',
    });

    const err400Errors: any = {
      response: {
        status: 400,
        data: { errors: { Password: ['Too weak'], ConfirmPassword: ['Mismatch'] } },
      },
    };
    expect(getUserFacingSignUpError(err400Errors)).toEqual({
      title: 'Registration Failed',
      message: 'Too weak\nMismatch',
    });
  });
});
