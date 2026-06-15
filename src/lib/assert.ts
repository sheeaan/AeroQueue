/**
 * Runtime invariant guard with a compile-time assertion signature.
 *
 * Using `asserts condition` lets the type-checker narrow the surrounding scope
 * after a successful call (e.g. `invariant(seat, ...)` removes `undefined` from
 * `seat`'s type), which keeps the simulation engine free of defensive `!`
 * non-null assertions while still failing loudly on a broken pre-condition.
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[AeroQueue] Invariant violated: ${message}`);
  }
}
