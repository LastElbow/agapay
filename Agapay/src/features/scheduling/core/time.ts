export const parseTimeToMinutes = (value: string): number | null => {
  const [hours, minutes] = value.split(':');
  const h = Number.parseInt(hours ?? '', 10);
  const m = Number.parseInt(minutes ?? '', 10);

  const isInvalidBase =
    Number.isNaN(h) || Number.isNaN(m) || h < 0 || m < 0 || value.length !== 5;

  if (isInvalidBase) {
    return null;
  }

  if (h === 24) {
    if (m === 0) return 24 * 60;
    return null;
  }

  if (h > 23 || m > 59) return null;

  return h * 60 + m;
};

// Looser parser used by booking/reschedule pickers (accepts HH:MM prefix)
export const hhmmToMinutes = (value: string): number | null => {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  if (hours < 0 || minutes < 0) return null;
  if (hours === 24) {
    if (minutes === 0) return 24 * 60;
    return null;
  }
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
};

export const minutesToHHmm = (value: number): string => {
  if (!Number.isFinite(value)) return '';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}`;
};

export const toHHmm = (time: string): string => {
  if (!time) return '';
  const parts = time.split(':');
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  return time;
};

export const toHHmmss = (time: string): string => {
  if (!time) return time;
  if (time === '24:00') return '23:59:59';
  return time.length === 5 ? `${time}:00` : time;
};

export const toFriendlyTime = (time: string): string => {
  if (!time) return '';
  const [rawHour, rawMinute] = time.split(':');
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
  const normalizedHour = ((hour % 24) + 24) % 24;
  const displayHour = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
  const suffix = normalizedHour >= 12 ? 'PM' : 'AM';
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${suffix}`;
};

export const hhmmTo12 = (hhmm: string): string => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const mer = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${mer}`;
};
