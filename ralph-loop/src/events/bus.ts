import { EventEmitter } from 'events';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EventLevel = 'info' | 'success' | 'warn' | 'error';

export type EventType =
  | 'cycle-start'
  | 'cycle-end'
  | 'crawl'
  | 'crawl-result'
  | 'distill-start'
  | 'distill-item'
  | 'distill-end'
  | 'keywords'
  | 'keyword-result'
  | 'generate-start'
  | 'proposal-new'
  | 'generate-end'
  | 'rerank-start'
  | 'rerank-end'
  | 'checkpoint'
  | 'resume'
  | 'info'
  | 'warn'
  | 'error';

export interface ProgressEvent {
  id: number;
  type: EventType;
  message: string;
  level: EventLevel;
  timestamp: string;
  cycleId?: number;
}

// ─── Bus ──────────────────────────────────────────────────────────────────────

const HISTORY_SIZE = 200;

class RalphEventBus extends EventEmitter {
  private history: ProgressEvent[] = [];
  private counter = 0;

  push(event: Omit<ProgressEvent, 'id' | 'timestamp'>): void {
    const full: ProgressEvent = {
      ...event,
      id: ++this.counter,
      timestamp: new Date().toISOString(),
    };
    this.history.push(full);
    if (this.history.length > HISTORY_SIZE) this.history.shift();
    this.emit('event', full);
  }

  /** Returns the last N events for replaying to new SSE connections */
  getHistory(n = 100): ProgressEvent[] {
    return this.history.slice(-n);
  }
}

export const bus = new RalphEventBus();

/** Convenience shorthand — import this everywhere */
export function emit(event: Omit<ProgressEvent, 'id' | 'timestamp'>): void {
  bus.push(event);
}
