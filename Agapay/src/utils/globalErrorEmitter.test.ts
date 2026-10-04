import { emitGlobalError, subscribeToGlobalErrors } from '@/src/utils/globalErrorEmitter';

describe('globalErrorEmitter', () => {
  it('delivers the payload to the current subscriber', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToGlobalErrors(listener);

    emitGlobalError({ title: 'Oops', message: 'Something happened', variant: 'error' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      title: 'Oops',
      message: 'Something happened',
      variant: 'error',
    });

    unsubscribe();
  });

  it('stops delivering after unsubscribe', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const listener = jest.fn();
    const unsubscribe = subscribeToGlobalErrors(listener);
    unsubscribe();

    emitGlobalError({ title: 'Nope', message: 'Should not fire' });

    expect(listener).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not emit when silent=true', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToGlobalErrors(listener);

    emitGlobalError({ title: 'Hidden', message: 'Silent', silent: true });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('warns when no subscriber is registered', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    emitGlobalError({ title: 'No listener', message: 'Falls back to warn' });

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
