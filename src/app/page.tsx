import { EngineeringNotebook } from '@/components/EngineeringNotebook';
import { SimulationView } from '@/components/SimulationView';

/** Home page: a NASA-style header bar, then the boarding simulation, controls, and analytics. */
export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="#top">
            <span className="brand-name">
              <strong>AeroQueue</strong>
              <span>Boarding Research Lab</span>
            </span>
          </a>
          <nav className="site-nav">
            <a href="#simulation">Simulation</a>
            <a href="#analysis">Analytics</a>
            <EngineeringNotebook />
          </nav>
        </div>
      </header>

      <main className="shell" id="top">
        <p className="breadcrumb">
          <a href="#top">Home</a>
          <span className="sep">›</span>
          Aircraft Boarding Simulation
        </p>
        <h1>Aircraft Boarding Simulation Lab</h1>
        <p className="lede">
          A client-side discrete-event simulation rendered with PixiJS, with a background Monte-Carlo
          engine and a Genetic-Algorithm optimizer. Pick a strategy, toggle Realism / Simple mode, run
          1000 headless simulations to chart the boarding-time distribution, or evolve an optimal
          sequence and watch the AI-generated strategy play out.
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
    </>
  );
}
