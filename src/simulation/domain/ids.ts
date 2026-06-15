import type { Brand } from '@/lib/brand';

/**
 * Strongly-typed entity identifiers.
 *
 * Each alias pairs a *type* (the branded primitive) with a *value* (a smart
 * constructor of the same name) via TypeScript declaration merging. This makes
 * id creation explicit and self-documenting — `PassengerId(3)` rather than a
 * bare `3` that could be mistaken for a row index.
 */

/** Index `k` of a passenger within the flight manifest `P`. */
export type PassengerId = Brand<number, 'PassengerId'>;
export const PassengerId = (value: number): PassengerId => value as PassengerId;

/** Stable seat key, e.g. `"12A"` (row 12, column A). */
export type SeatId = Brand<string, 'SeatId'>;
export const SeatId = (value: string): SeatId => value as SeatId;

/** Identifier linking passengers travelling as a family / cohesion group (`F_k`). */
export type FamilyGroupId = Brand<number, 'FamilyGroupId'>;
export const FamilyGroupId = (value: number): FamilyGroupId => value as FamilyGroupId;
