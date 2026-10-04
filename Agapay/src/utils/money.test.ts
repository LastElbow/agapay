import { formatNumberWithDecimals, formatPeso, parseMoneyString } from '@/src/utils/money';

describe('money utils', () => {
  it('formatNumberWithDecimals returns undefined for null/undefined/non-finite', () => {
    expect(formatNumberWithDecimals(null)).toBeUndefined();
    expect(formatNumberWithDecimals(undefined)).toBeUndefined();
    expect(formatNumberWithDecimals(Number.NaN)).toBeUndefined();
    expect(formatNumberWithDecimals(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('formatNumberWithDecimals delegates to toLocaleString with the provided decimals', () => {
    const spy = jest.spyOn(Number.prototype, 'toLocaleString').mockReturnValue('FORMATTED');

    const out = formatNumberWithDecimals(1234.5, 3);

    expect(out).toBe('FORMATTED');
    expect(spy).toHaveBeenCalledTimes(1);

    const [, options] = spy.mock.calls[0] as any;
    expect(options).toMatchObject({
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });

    spy.mockRestore();
  });

  it('formatPeso prefixes with peso sign and space', () => {
    const spy = jest.spyOn(Number.prototype, 'toLocaleString').mockReturnValue('1,234.50');

    expect(formatPeso(1234.5)).toBe('₱ 1,234.50');

    spy.mockRestore();
  });

  it('parseMoneyString parses common formatted strings', () => {
    expect(parseMoneyString('₱ 1,234.50')).toBeCloseTo(1234.5);
    expect(parseMoneyString('-500')).toBe(-500);
    expect(parseMoneyString('abc')).toBe(0);
    expect(parseMoneyString(undefined)).toBe(0);
  });
});
