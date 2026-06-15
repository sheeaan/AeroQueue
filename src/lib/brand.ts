/**
 * Nominal ("branded") typing utility.
 *
 * TypeScript is structurally typed, so a raw `number` passenger id and a raw
 * `number` seat row are interchangeable to the compiler — a frequent source of
 * silent bugs in a simulation that juggles dozens of integer-keyed entities.
 *
 * `Brand<T, B>` attaches a phantom tag so that two aliases of the same
 * underlying primitive become mutually incompatible at compile time while
 * remaining zero-cost at runtime (the tag never exists in emitted JS).
 *
 * @example
 *   type PassengerId = Brand<number, 'PassengerId'>;
 *   const id = 5 as PassengerId;      // explicit construction only
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
