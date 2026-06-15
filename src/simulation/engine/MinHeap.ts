/** Ordering function: negative if `a` should come out before `b`. */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * Array-backed binary min-heap — the foundation of the discrete-event priority
 * queue.
 *
 * Complexity:
 *   - `push`  : O(log n)   (sift-up)
 *   - `pop`   : O(log n)   (sift-down)
 *   - `peek`  : O(1)
 *
 * Because each passenger generates only a bounded number of events, the heap
 * processes `Θ(N)` events at `O(log N)` each, giving the advertised `O(N log N)`
 * end-to-end run cost. The implementation is intentionally allocation-light:
 * a single backing array is reused and elements are swapped in place.
 */
export class MinHeap<T> {
  private readonly heap: T[] = [];

  constructor(private readonly compare: Comparator<T>) {}

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /** Smallest element without removing it, or `undefined` when empty. */
  peek(): T | undefined {
    return this.heap[0];
  }

  push(value: T): void {
    this.heap.push(value);
    this.siftUp(this.heap.length - 1);
  }

  /** Remove and return the smallest element, or `undefined` when empty. */
  pop(): T | undefined {
    const size = this.heap.length;
    if (size === 0) return undefined;

    const top = this.heap[0];
    const last = this.heap.pop() as T;
    if (size > 1) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  clear(): void {
    this.heap.length = 0;
  }

  private siftUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(this.heap[index], this.heap[parent]) >= 0) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  private siftDown(index: number): void {
    const size = this.heap.length;
    for (;;) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      if (left < size && this.compare(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < size && this.compare(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest === index) break;
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const tmp = this.heap[a];
    this.heap[a] = this.heap[b];
    this.heap[b] = tmp;
  }
}
