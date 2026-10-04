export const formatNumberWithDecimals = (
  value: number | null | undefined,
  decimals = 2
): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (!Number.isFinite(Number(value))) return undefined;
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const formatPeso = (
  value: number | null | undefined,
  decimals = 2
): string | undefined => {
  const formatted = formatNumberWithDecimals(value, decimals);
  if (formatted == null) return undefined;
  // Use the peso sign with a non-breaking space for consistency
  return `₱ ${formatted}`;
};

export const parseMoneyString = (v?: string): number => {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export default {
  formatNumberWithDecimals,
  formatPeso,
  parseMoneyString,
};
