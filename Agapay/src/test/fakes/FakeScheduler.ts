import type { SchedulerPort, TimeoutHandle } from '@/src/shared/ports/scheduler';

type Task = { id: number; atMs: number; cb: () => void; cleared: boolean };

export class FakeScheduler implements SchedulerPort {
  private nextId = 1;
  private tasks: Task[] = [];
  constructor(private now: () => number) {}

  setTimeout(cb: () => void, ms: number): TimeoutHandle {
    const id = this.nextId++;
    this.tasks.push({ id, atMs: this.now() + ms, cb, cleared: false });
    return id as any;
  }

  clearTimeout(handle: TimeoutHandle): void {
    const id = Number(handle as any);
    this.tasks.forEach((t) => {
      if (t.id === id) t.cleared = true;
    });
  }

  runDue(): number {
    const nowMs = this.now();
    const due = this.tasks.filter((t) => !t.cleared && t.atMs <= nowMs);
    due.forEach((t) => {
      t.cleared = true;
      t.cb();
    });
    return due.length;
  }

  pending(): number {
    return this.tasks.filter((t) => !t.cleared).length;
  }
}
