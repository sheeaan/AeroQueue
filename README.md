# AeroQueue — Aircraft Boarding Simulation & Optimization Platform

A client-side **discrete-event simulation (DES)** engine and operations-research lab
for evaluating aircraft boarding strategies (Back-to-Front, WilMA, Random, Reverse
Pyramid, and the mathematically optimal **Steffen Method**). It models passenger
kinematics, aisle interference, luggage-stowage bottlenecks, and seat-interference
(over-climb) penalties — entirely in the browser, with zero network latency per tick.

> **Status: Phase 1 — Core Architecture & Data Models.**
> The structural foundation, simulation data models, the `O(N log N)` discrete-event
> engine (priority queue + clock + lifecycle), the seedable RNG, distribution samplers,
> Monte-Carlo statistics, and the decoupled state/subscription bridge are implemented.
> The boarding *algorithms* and the *PixiJS rendering* are intentionally **not** yet
> implemented — only their seams exist.

---

## Architectural pillars

| Concern | Decision | Why |
| --- | --- | --- |
| Rendering | **Strictly client-side** (CSR). The Next.js shell is thin; every interactive surface is a Client Component. | SSR / API ticks would inject network latency and kill the real-time loop and Monte-Carlo throughput. |
| Engine | **Pure TypeScript**, no DOM / React / Pixi. | Runs identically on the main thread, in a Web Worker, or under a unit test. |
| Time | **Event-driven**, not frame-driven. The clock jumps to the next event. | Skips "dead time"; a full run is `O(N log N)` instead of `O(ticks · N)`. |
| State ↔ View | **Two-channel decoupling.** High-frequency agent snapshots flow imperatively to the renderer (`onFrame`); low-frequency coarse state flows to a Zustand store. | Pushing hundreds of agents through React every frame would cause a reconciliation storm. |
| Heavy compute | **Web Workers** for Monte-Carlo batches. | Keeps the UI responsive while `M ∈ {10…10000}` runs execute off-thread. |

### Data-flow at a glance

```
                    pull (per rAF frame)             push (lifecycle)
  ┌────────────────┐   getSnapshot()   ┌───────────────────┐   coarse state   ┌──────────────┐
  │ SimulationEngine│◄─────────────────│ SimulationController│─────────────────►│ Zustand store│
  │  (pure TS, DES) │   advanceTo(t)    │  (owns rAF loop)    │                  └──────┬───────┘
  └────────────────┘──────────────────►└─────────┬───────────┘                         │ selectors
        ▲                                         │ onFrame(snapshot)                    ▼
        │ run() × M                               ▼                              React UI / dashboards
  ┌─────┴─────────┐                    PixiJS renderer (Phase 2)
  │ MC Web Worker │
  └───────────────┘
```

---

## Directory structure

```
src/
├── app/                         # Next.js App Router shell (thin, client-rendered)
│   ├── layout.tsx               #   root layout + metadata
│   ├── page.tsx                 #   Phase-1 demo wired to the engine (no canvas yet)
│   └── globals.css
│
├── simulation/                  # ── PURE OR / DES CORE ── (no React, DOM, or Pixi)
│   ├── domain/                  #   immutable data models & FSM vocabulary
│   │   ├── geometry.ts          #     GridCoord, CabinSide, SeatColumnType, CellKind
│   │   ├── ids.ts               #     branded PassengerId / SeatId / FamilyGroupId
│   │   ├── state.ts             #     PassengerState + SimulationStatus enums (FSM)
│   │   ├── Seat.ts              #     Seat (immutable geometry, over-climb distance)
│   │   ├── Grid.ts              #     CabinLayout + CabinGrid (O(1) aisle occupancy)
│   │   ├── Passenger.ts         #     Passenger agent vector p_k + metric accumulators
│   │   └── events.ts            #     SimulationEvent + SimulationEventType
│   ├── engine/
│   │   ├── MinHeap.ts           #     generic O(log n) binary min-heap
│   │   ├── EventQueue.ts        #     DES priority queue (time, tie-break id)
│   │   └── SimulationEngine.ts  #     the orchestrator: clock, dispatch, snapshots
│   ├── rng/
│   │   ├── Random.ts            #     seedable mulberry32 PRNG (reproducible runs)
│   │   └── distributions.ts     #     Gamma (Marsaglia–Tsang), stow/walk/bag samplers
│   ├── config/
│   │   ├── cabin.ts             #     narrow-body 3-3 (A320/737) layout factory
│   │   └── simulation.ts        #     SimulationConfig + defaults
│   ├── strategies/
│   │   └── BoardingStrategy.ts  #     strategy interface + registry (impls in Phase 2)
│   ├── analysis/
│   │   └── statistics.ts        #     mean / variance / 95% CI (Monte-Carlo summary)
│   └── index.ts                 #   public barrel for the pure package
│
├── runtime/
│   └── SimulationController.ts  # browser glue: owns the rAF loop, bridges engine↔store
│
├── state/
│   └── simulationStore.ts       # Zustand store (coarse, low-frequency UI state)
│
├── components/
│   └── SimulationProvider.tsx   # React context owning one controller per subtree
│
├── hooks/
│   └── useSimulation.ts         # useSimulation() controls + useSimulationFrames()
│
├── workers/
│   └── monteCarlo.worker.ts     # headless Monte-Carlo shard runner (typed protocol)
│
└── lib/
    ├── brand.ts                 # nominal-typing helper
    └── assert.ts                # invariant() with assertion signature
```

> The pure core lives under `src/simulation/` (mapping to the brief's
> `/simulation_engine`). The dependency arrow points strictly **inward**:
> `app → hooks/components → state/runtime → simulation`. Nothing in `simulation/`
> imports React, the DOM, or anything browser-specific.

---

## Core data models

- **`Passenger`** — the agent vector `p_k = ⟨S_k, G_k, v_k, B_k, t_stow,k, F_k⟩`. Immutable
  sampled attributes (`assignedSeat`, `walkingSpeed`, `bagCount`, `stowTime`, `familyGroup`)
  are separated by `readonly` from the mutable FSM state (`state`, `position`,
  `stowTimeRemaining`, `boardingGroup`) and metric accumulators that decompose the
  objective `E = max_k (t_walk + t_stow + Σ T_aisle + Σ T_seat)`.
- **`Seat` / `CabinLayout` / `CabinGrid`** — the cabin as a 2-D cellular-automata matrix
  `C` of `R × S`. `CabinGrid` keeps a dense 1-D aisle-occupancy array for `O(1)` forward
  collision detection (the spatial-hash optimisation).
- **`SimulationEvent`** — a `(time, type, passenger)` record with a monotonic `id`
  tie-breaker, ordered by the `EventQueue` min-heap.

## Complexity

- Manifest generation / sorting: `O(N log N)`.
- Forward collision detection per step: `O(1)` via the aisle array.
- Priority-queue `push`/`pop`: `O(log N)`; with `Θ(N)` events ⟹ **`O(N log N)`** per run.

---

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
```

The demo page lets you Play / Pause / Reset / change speed. With the Phase-1 stub
handlers, agents transition `Queued → Walking` as `Board` events drain from the queue,
proving the event pipeline and the engine ↔ controller ↔ store ↔ React wiring.

## Roadmap

- **Phase 2** — cellular-automata kinematics, aisle/seat interference, the FinishStow /
  SeatShuffle / Seated transitions, and the concrete boarding strategies.
- **Phase 3** — the PixiJS WebGL canvas (colour-coded agents, stow-countdown arcs,
  congestion heatmap) subscribing via `useSimulationFrames`.
- **Phase 4** — Monte-Carlo dashboards (variance / CI / violin plots), the Genetic-Algorithm
  optimiser, the custom-strategy sandbox, and the Engineering Notebook.
