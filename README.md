# AeroQueue — Aircraft Boarding Simulator

A small browser app that simulates how long it takes to board a plane under
different boarding strategies (Random, Back-to-Front, Front-to-Back, WilMA,
Reverse Pyramid, and Steffen). It runs a discrete-event simulation of the cabin —
passengers walking down the aisle, stowing their bags, and climbing over seated
neighbours — and draws it with PixiJS.

There's also a Monte-Carlo mode that runs each strategy many times to compare the
average boarding time, and a little genetic algorithm that tries to evolve a
faster boarding order.

This is just a fun project! I'll upload the math I worked through later.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

## How it's put together

- `src/simulation/` — the simulation itself, plain TypeScript with no React/DOM
  (so it can also run inside a Web Worker).
  - `engine/` — the discrete-event engine (a min-heap event queue + a clock).
  - `domain/` — the data models (passengers, seats, the cabin grid, events).
  - `strategies/` — the boarding strategies.
  - `rng/` — a seeded random generator and the distribution samplers.
  - `config/` — the cabin layout and simulation settings.
  - `analysis/` — the Monte-Carlo summary stats.
  - `optimization/` — the genetic algorithm.
- `src/visualization/` — the PixiJS renderer (grid, agents, congestion heatmap).
- `src/components/`, `src/hooks/`, `src/state/`, `src/runtime/` — the React UI, the
  playback loop, and the Zustand store that holds the coarse UI state.
- `src/workers/monteCarlo.worker.ts` — runs the Monte-Carlo batches and the GA off
  the main thread.

The engine never touches React or the DOM. The controller owns the animation loop
and hands a snapshot to the renderer each frame, while only coarse state (status,
time, counts) goes through React.
