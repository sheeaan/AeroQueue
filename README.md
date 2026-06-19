# AeroQueue

**A high-performance, client-side discrete-event simulation platform for evaluating commercial-aircraft boarding heuristics.**

AeroQueue models the cabin as a **one-dimensional cellular automaton** and uses **Monte Carlo** methods to estimate the expected boarding time of competing strategies under realistic, stochastic passenger behaviour. It benchmarks the policies airlines actually use — Back-to-Front, Front-to-Back, and outside-in variants — against the mathematically optimal **Steffen sequence**, originally derived through Markov Chain Monte Carlo (MCMC) optimization. A built-in **genetic algorithm** then attempts to rediscover optimal sequences from scratch, and the whole simulation is rendered live in WebGL.

Six heuristics ship by default: **Random**, **Back-to-Front**, **Front-to-Back**, **WilMA** (Window–Middle–Aisle / outside-in), **Reverse Pyramid**, and **Steffen (Perfect)**.

---

## Mathematical Formulation & Interference Modeling

### Objective

Boarding is a makespan-minimization problem. For a boarding order $\pi$, the total boarding time $T(\pi)$ is the moment the last passenger is seated, and the goal is to minimize its expectation over the stochastic passenger population:

$$\min_{\pi}\; E\!\left[T(\pi)\right], \qquad T(\pi) = \max_{i}\, t_i^{\text{seated}}$$

Because $T$ has no closed form, AeroQueue estimates $E(T)$ by Monte Carlo — the sample mean over $N$ independent, seeded runs:

$$\widehat{E(T)} = \frac{1}{N}\sum_{n=1}^{N} T_n, \qquad \widehat{\sigma}^2 = \frac{1}{N-1}\sum_{n=1}^{N}\left(T_n - \widehat{E(T)}\right)^2$$

reported alongside its 95% confidence interval $\widehat{E(T)} \pm 1.96\,\widehat{\sigma}/\sqrt{N}$.

### Aisle interference — stochastic luggage stowage

Stowage time is the binding constraint on boarding, and it is **not** a constant. It is modelled as a right-skewed random variable: a fixed overhead plus a **Gamma**-distributed component whose shape scales with the passenger's carry-on count $B$:

$$t_{\text{stow}} = t_0 + \Gamma\!\left(B\beta,\; \theta\right), \qquad \mathbb{E}\!\left[t_{\text{stow}}\right] = t_0 + B\beta\theta, \quad \mathrm{Var} = B\beta\theta^2$$

Most passengers stow quickly; a heavy-bagged minority produce the long tail that throttles the aisle. Carry-on counts are themselves drawn from a categorical distribution $P(B{=}0,1,2) = (0.2,\,0.5,\,0.3)$, and the Gamma variates are generated with the **Marsaglia–Tsang** method. A stowing passenger occupies their aisle cell, so every agent behind them becomes *blocked*, and the block cascades rearward — congestion is an emergent property of the local rules, not a scripted event.

### Seat interference — the over-climb penalty

When a passenger must pass $k$ already-seated neighbours to reach a window or middle seat in the same half-row, those neighbours must stand and clear the row. This incurs an additive **over-climb penalty**:

$$T_{\text{seat}} = k\,\bigl(t_{\text{clear}} + t_{\text{sit}}\bigr)$$

where $k$ is the number of occupied inner seats between the aisle and the assignment. Outside-in orders (WilMA, Steffen) drive $k \to 0$ by construction, which is precisely why they outperform front-/back-clustered policies.

---

## Simulation Architecture (Discrete-Event Engine)

The core in [`src/simulation/`](src/simulation/) is **not** a wasteful frame-by-frame loop. It is a true **agent-based discrete-event simulation (DES)** driven by a **binary min-heap priority queue** keyed on event time (with a monotonic id as a deterministic tie-breaker). The engine repeatedly pops the next chronological event, jumps the clock to it, and dispatches it — never advancing time it doesn't need to.

The aisle is a dense 1-D array indexed by row, so the cellular-automaton transition rules ("is the cell ahead free?") are $O(1)$ lookups rather than scans over all agents. Each passenger emits only a *bounded* chain of events — `Board → Walk → Advance × rows → FinishStow → Seated` — so the engine processes $\Theta(N)$ events, each costing $O(\log N)$ for a heap push/pop. End-to-end, the simulation runs in:

$$O(N \log N)$$

The engine is fully **headless and deterministic**: it touches neither React nor the DOM, and a seeded PRNG (`mulberry32`, with Box–Muller and inverse-transform samplers) makes every run exactly reproducible — the property that makes Monte Carlo batches and GA fitness evaluation trustworthy.

```
src/simulation/
├── engine/        # min-heap priority queue, event clock, the DES core
├── domain/        # passengers, seats, the cabin grid, event types
├── strategies/    # the six boarding heuristics (pure cabin → order functions)
├── rng/           # seeded PRNG + Gamma / Normal / Exponential samplers
├── config/        # cabin layout and simulation parameters
├── analysis/      # Monte-Carlo summary statistics
└── optimization/  # the genetic algorithm
```

---

## Genetic Algorithm Optimizer

Beyond the hand-designed heuristics, AeroQueue includes a custom **metaheuristic optimizer** ([`src/simulation/optimization/geneticAlgorithm.ts`](src/simulation/optimization/geneticAlgorithm.ts)) that evolves boarding sequences from scratch:

- **Encoding.** A chromosome is a full permutation of the cabin's seat ids — i.e. one complete boarding order.
- **Fitness.** Each chromosome is scored by running it through the engine; fitness *is* the simulated boarding time $E(T)$ (lower is better), evaluated in deterministic Simple Mode so the search optimizes pure order structure.
- **Operators.** The population evolves via **tournament selection**, **Order Crossover (OX1)** — which preserves relative ordering while producing valid permutations — and **swap mutation**, with per-generation fitness caching.

Given enough generations, the GA independently converges toward the highly parallelized, two-row-gap structure of the Steffen optimum — recovering by search what was originally derived analytically.

---

## Empirical Results

Mean boarding time over **1000 seeded Monte-Carlo runs per strategy**, full stochastic mode (Gamma stowage + over-climb penalties), reproducible via `npm run benchmark`:

| Strategy | Mean E(T) | Std. Dev. | Min | Max | vs. fastest |
| --- | ---: | ---: | ---: | ---: | ---: |
| Steffen (Perfect) | 1029.4 | 48.7 | 887.4 | 1181.1 | — |
| WilMA (Outside-In) | 1179.5 | 52.9 | 1024.1 | 1378.6 | +14.6% |
| Reverse Pyramid | 1255.3 | 54.2 | 1097.0 | 1421.5 | +22.0% |
| Random | 1349.9 | 56.9 | 1194.4 | 1545.6 | +31.1% |
| Back-to-Front | 1530.1 | 69.7 | 1338.1 | 1786.6 | +48.6% |
| Front-to-Back | 1733.0 | 71.8 | 1529.7 | 1993.3 | +68.4% |

_Boarding time in simulation ticks._ The headline result reproduces the well-known operations-research paradox: the **Back-to-Front and Front-to-Back policies airlines actually use are *worse than boarding at random***, because they cluster passengers into the same rows and maximize both aisle and seat interference. Steffen's interference-free sequence boards **~33% faster than Back-to-Front** (which, equivalently, takes ~49% longer).

---

## Tech Stack & Performance

A simulation this heavy can't run on the UI thread, and a cabin of agents can't be redrawn through React. AeroQueue is built around two decouplings:

- **Web Workers.** The 1000-iteration Monte-Carlo batches and the genetic algorithm run inside [`src/workers/monteCarlo.worker.ts`](src/workers/monteCarlo.worker.ts), entirely off the main thread, streaming progress back via `postMessage` so the UI stays responsive under load.
- **PixiJS (WebGL), decoupled from React.** The renderer is fed an imperative per-frame snapshot stream that **bypasses React reconciliation** entirely; only coarse, low-frequency state (status, clock, seated counts) lives in the Zustand store. This keeps the live cabin, agent interpolation, and congestion heatmap at a smooth **60 FPS**.

**Stack:** TypeScript · Next.js 15 / React 19 · PixiJS 8 (WebGL) · Zustand · KaTeX · Web Workers.

### Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run benchmark  # reproduce the results table above
npm run typecheck
npm run build
```

### How it's put together

- [`src/simulation/`](src/simulation/) — the engine, in plain TypeScript with no React/DOM, so it runs identically on the main thread or inside a Web Worker (see the breakdown above).
- [`src/visualization/`](src/visualization/) — the PixiJS renderer (cabin grid, agents, congestion heatmap, WebGL shader).
- `src/components/`, `src/hooks/`, `src/state/`, `src/runtime/` — the React UI, the `requestAnimationFrame` playback controller, and the Zustand store holding coarse UI state.
- [`src/workers/monteCarlo.worker.ts`](src/workers/monteCarlo.worker.ts) — runs the Monte-Carlo batches and the GA off the main thread.

The engine never touches React or the DOM. The controller owns the animation loop and hands a snapshot to the renderer each frame, while only coarse state passes through React.

---

## About

AeroQueue is a solo research-and-engineering project exploring discrete-event simulation, operations research, and high-performance browser visualization. The full mathematical derivations behind the interference models live in the in-app **"my math"** notebook (rendered with KaTeX).
