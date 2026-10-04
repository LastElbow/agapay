export type AvailabilityTimeBlock = {
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // "HH:MM:SS" or "HH:MM"
  endTime: string; // "HH:MM:SS" or "HH:MM"
};

export function hourToHhmmss(hour: number): string {
  if (!Number.isFinite(hour)) return '00:00:00';
  const h = Math.max(0, Math.min(24, Math.trunc(hour)));
  return `${String(h).padStart(2, '0')}:00:00`;
}

export function timeStringToHour(time: string): number | null {
  const raw = String(time ?? '').trim();
  if (!raw) return null;

  // Accept HH:MM:SS or HH:MM; ignore minutes/seconds for hour-block UI.
  const parts = raw.split(':');
  if (parts.length < 2) return null;

  const hour = Number(parts[0]);
  if (!Number.isFinite(hour)) return null;

  const h = Math.trunc(hour);
  if (h < 0 || h > 24) return null;
  return h;
}

export function hourStartsToAvailabilityBlocks(params: {
  hourStarts: Set<number> | number[];
  dayOfWeek: number;
}): AvailabilityTimeBlock[] {
  const starts = Array.isArray(params.hourStarts)
    ? params.hourStarts
    : Array.from(params.hourStarts ?? []);

  const sorted = Array.from(new Set(starts))
    .filter((h) => Number.isFinite(h))
    .map((h) => Math.trunc(h))
    .filter((h) => h >= 0 && h <= 23)
    .sort((a, b) => a - b);

  const blocks: AvailabilityTimeBlock[] = [];

  let blockStart: number | null = null;
  let blockEndExclusive: number | null = null;

  for (const hour of sorted) {
    if (blockStart === null) {
      blockStart = hour;
      blockEndExclusive = hour + 1;
      continue;
    }

    if (hour === blockEndExclusive) {
      blockEndExclusive = hour + 1;
      continue;
    }

    blocks.push({
      dayOfWeek: params.dayOfWeek,
      startTime: hourToHhmmss(blockStart),
      endTime: hourToHhmmss(blockEndExclusive!),
    });

    blockStart = hour;
    blockEndExclusive = hour + 1;
  }

  if (blockStart !== null && blockEndExclusive !== null) {
    blocks.push({
      dayOfWeek: params.dayOfWeek,
      startTime: hourToHhmmss(blockStart),
      endTime: hourToHhmmss(blockEndExclusive),
    });
  }

  return blocks;
}

export function availabilityBlocksToHourStarts(params: {
  blocks: AvailabilityTimeBlock[];
  dayOfWeek: number;
}): Set<number> {
  const out = new Set<number>();
  const blocks = Array.isArray(params.blocks) ? params.blocks : [];

  blocks
    .filter((b) => b && b.dayOfWeek === params.dayOfWeek)
    .forEach((block) => {
      const start = timeStringToHour(block.startTime);
      const end = timeStringToHour(block.endTime);
      if (start == null || end == null) return;
      if (end <= start) return;

      for (let h = start; h < end; h++) {
        // hour-start representation is always 0..23
        if (h >= 0 && h <= 23) out.add(h);
      }
    });

  return out;
}
