import type { SimulationEvent } from '../domain/events';
import { MinHeap } from './MinHeap';

/**
 * The global discrete-event priority queue.
 *
 * Wraps a {@link MinHeap} with the canonical event comparator — order by
 * timestamp, breaking ties by a monotonically increasing sequence id so that
 * simultaneous events resolve deterministically (FIFO). The queue owns the
 * sequence counter, so callers `schedule` partial events and receive the fully
 * materialised event back.
 */
export class EventQueue {
  private readonly heap = new MinHeap<SimulationEvent>(
    (a, b) => a.time - b.time || a.id - b.id,
  );
  private sequence = 0;

  get size(): number {
    return this.heap.size;
  }

  get isEmpty(): boolean {
    return this.heap.isEmpty;
  }

  /** Insert an event (the `id` tie-breaker is assigned here). O(log n). */
  schedule(event: Omit<SimulationEvent, 'id'>): SimulationEvent {
    const materialised: SimulationEvent = { id: this.sequence++, ...event };
    this.heap.push(materialised);
    return materialised;
  }

  /** Next event without removing it. O(1). */
  peek(): SimulationEvent | undefined {
    return this.heap.peek();
  }

  /** Remove and return the chronologically-next event. O(log n). */
  next(): SimulationEvent | undefined {
    return this.heap.pop();
  }

  clear(): void {
    this.heap.clear();
    this.sequence = 0;
  }
}
