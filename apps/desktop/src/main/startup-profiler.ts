import { performance } from "node:perf_hooks";

export interface StartupTimingMark {
  name: string;
  atMs: number;
  detail?: Record<string, string | number | boolean | null>;
}

const startedAt = performance.now();
const marks: StartupTimingMark[] = [];

export const startupProfiler = {
  mark(name: string, detail?: Record<string, string | number | boolean | null>): void {
    const mark: StartupTimingMark = {
      name,
      atMs: Math.round(performance.now() - startedAt),
    };
    if (detail) {
      mark.detail = detail;
    }
    marks.push(mark);
  },

  getMarks(): StartupTimingMark[] {
    return [...marks];
  },

  getTotalMs(): number {
    return Math.round(performance.now() - startedAt);
  },
};

startupProfiler.mark("process_start");
startupProfiler.mark("app_start");
