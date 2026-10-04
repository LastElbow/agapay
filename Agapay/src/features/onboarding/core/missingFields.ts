export function formatMissingFieldsList(fields: string[]): string {
  const cleaned = (fields || []).map((f) => String(f || '').trim()).filter(Boolean);

  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;

  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
}
