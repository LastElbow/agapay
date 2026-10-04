export interface ClockPort {
  now(): number; // epoch ms
}

export const systemClock: ClockPort = {
  now: () => Date.now(),
};
