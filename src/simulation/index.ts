/**
 * Public surface of the pure simulation package.
 *
 * Everything re-exported here is framework-agnostic TypeScript with no
 * dependency on React, the DOM, or PixiJS — it can be imported by the main
 * thread, a Web Worker, or a test runner without modification.
 */
export * from './domain';
export * from './engine/MinHeap';
export * from './engine/EventQueue';
export * from './engine/SimulationEngine';
export * from './rng/Random';
export * from './rng/distributions';
export * from './config/cabin';
export * from './config/simulation';
export * from './strategies';
export * from './analysis/statistics';
