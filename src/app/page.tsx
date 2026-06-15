import { SimulationView } from '@/components/SimulationView';

/**
 * Phase 3 — the PixiJS WebGL visualisation.
 *
 * The cabin is rendered top-down on a hardware-accelerated canvas; agents are
 * colour-coded circles that glide between cells, pulse while stowing, and flash
 * while blocked. A two-pass additive-blend + custom-shader heatmap overlays the
 * aisle to expose bottlenecks. All of it is driven by the decoupled engine
 * through the imperative frame channel — React never re-renders per frame.
 */
export default function Home() {
  return (
    <main className="shell">
      <p className="eyebrow">AeroQueue · Phase 3</p>
      <h1>Aircraft Boarding Simulation Lab</h1>
      <p className="lede">
        A client-side discrete-event simulation rendered with PixiJS. Pick a boarding strategy and
        press Play: watch the cellular-automata kinematics unfold as colour-coded passengers walk
        the aisle, stow luggage, and bottleneck. Toggle the WebGL congestion heatmap to see exactly
        where each strategy fails.
      </p>

      <SimulationView />

      <p className="note">
        Window passengers render blue, middle green, aisle red. A pulsing ring is a passenger
        stowing luggage (the arc is the stow countdown); a flashing agent is blocked in the aisle.
        Compare <code>Back-to-Front</code> (a glowing rear bottleneck) against{' '}
        <code>Steffen (Perfect)</code> (a clean parallel wave).
      </p>
    </main>
  );
}
