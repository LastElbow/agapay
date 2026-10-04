export type TimeoutHandle = ReturnType<typeof setTimeout>;

export interface SchedulerPort {
  setTimeout(cb: () => void, ms: number): TimeoutHandle;
  clearTimeout(handle: TimeoutHandle): void;
}

export const systemScheduler: SchedulerPort = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h),
};
