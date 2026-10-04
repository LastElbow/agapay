import type { ClockPort } from '@/src/shared/ports/clock';

export class FakeClock implements ClockPort {
  constructor(public nowMs: number) {}
  now(): number {
    return this.nowMs;
  }

  advance(ms: number) {
    this.nowMs += ms;
  }
}
