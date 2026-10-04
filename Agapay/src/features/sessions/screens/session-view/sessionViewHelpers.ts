export const SLOT_DURATION_MINUTES = 60;

export const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function dowToDayLabel(dow: number): string | null {
  switch (dow) {
    case 0:
      return "Sunday";
    case 1:
      return "Monday";
    case 2:
      return "Tuesday";
    case 3:
      return "Wednesday";
    case 4:
      return "Thursday";
    case 5:
      return "Friday";
    case 6:
      return "Saturday";
    default:
      return null;
  }
}

export function toHHmm(time: string) {
  if (!time) return "";
  const parts = time.split(":");
  if (parts.length >= 2)
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  return time;
}

export function hhmmTo12(hhmm: string) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const mer = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${mer}`;
}

export function hhmmToMinutes(value: string): number | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function minutesToHHmm(value: number): string {
  if (!Number.isFinite(value)) return "";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}`;
}

export function normalizeDayOfWeek(value: number | string): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) return numeric;
    const lower = trimmed.toLowerCase();
    const normalized = lower.includes(".")
      ? lower.substring(lower.lastIndexOf(".") + 1)
      : lower;
    return DAY_NAME_TO_INDEX[normalized] ?? null;
  }
  return null;
}

export function formatDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const f = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return f.format(d);
}

export function formatTimeRange(startIso?: string, endIso?: string) {
  if (!startIso || !endIso) return "";
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
  const f = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${f.format(s)} - ${f.format(e)}`;
}
