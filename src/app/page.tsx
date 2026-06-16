import { SimulationView } from '@/components/SimulationView';

/**
 * Phase 4 — refined two-column layout, deterministic Simple Mode, and the
 * background Monte-Carlo analytics worker.
 *
 * The aircraft canvas is never covered: controls and analytics live in a
 * dedicated sidebar. The Monte-Carlo dashboard offloads 1000 headless runs to a
 * Web Worker and reports the mean (μ) and variance (σ²) for the selected
 * strategy — letting you contrast a strategy's "textbook" determinism (Simple)
 * against its real-world spread (Realism).
 */
export default function Home() {
  return (
    <main className="shell">
      <p className="eyebrow">AeroQueue · Phase 4</p>
      <h1>Aircraft Boarding Simulation Lab</h1>
      <p className="lede">
        A client-side discrete-event simulation rendered with PixiJS, with a background Monte-Carlo
        engine for statistical analysis. Pick a strategy, toggle Realism / Simple mode, and run 1000
        headless simulations off the main thread to measure expected boarding time and its variance.
      </p>

      <SimulationView />

      <p className="note">
        <strong>Realism</strong> draws walking speeds and luggage-stow times from probability
        distributions (high variance); <strong>Simple</strong> mode bypasses them for deterministic
        &ldquo;textbook&rdquo; passengers, isolating the algorithm&rsquo;s structure. Run the
        Monte-Carlo batch on <code>Random</code> versus <code>Steffen (Perfect)</code> to see the
        variance gap that makes an algorithm operationally robust.
      </p>
    </main>
  );
}
