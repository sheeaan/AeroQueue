'use client';

// Note: the KaTeX stylesheet is imported globally in `app/layout.tsx`, NOT here —
// importing CSS inside this lazily-loaded (`ssr:false`) chunk can crash on open.
import katex from 'katex';

/** Render a LaTeX string to HTML via KaTeX (SSR-safe — returns a string). */
function Tex({ children, block = false }: { children: string; block?: boolean }) {
  const html = katex.renderToString(children, { throwOnError: false, displayMode: block });
  return (
    <span
      className={block ? 'tex-block' : 'tex-inline'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * The math content of the Engineering Notebook. Split into its own module and
 * dynamically imported so that KaTeX (a sizeable dependency) is only fetched
 * when the user actually opens the notebook — keeping the initial bundle lean.
 */
export function NotebookContent() {
  return (
    <div className="notebook-body">
      <section>
        <h3>1 · Discrete-Event Engine Complexity</h3>
        <p>
          The simulation is event-driven: the clock jumps to the timestamp of the next event in a
          binary min-heap rather than advancing frame-by-frame. Each passenger generates a bounded
          number of events (board → advance → stow → seat), so the total event count{' '}
          <Tex>{`E = \\Theta(N)`}</Tex> for <Tex>{`N`}</Tex> passengers. Each <code>push</code>/
          <code>pop</code> is <Tex>{`O(\\log E)`}</Tex>, giving
        </p>
        <Tex block>{`T_{\\text{total}} \\;=\\; \\sum_{i=1}^{E} O(\\log E) \\;=\\; O(E \\log E) \\;=\\; O(N \\log N).`}</Tex>
        <p>
          This is what lets a full 180-passenger boarding resolve in microseconds — and what makes
          1000-run Monte-Carlo batches and the GA&rsquo;s thousands of evaluations feasible.
        </p>
      </section>

      <section>
        <h3>2 · Seat-Interference (Over-Climb) Penalty</h3>
        <p>
          When a passenger reaches a window/middle seat past already-seated neighbours, those
          neighbours must stand and re-sit. With <Tex>{`k`}</Tex> occupied inner seats and{' '}
          <Tex>{`\\Delta_m = t_{\\text{clear},m} + t_{\\text{sit},m}`}</Tex> the cost of clearing
          neighbour <Tex>{`m`}</Tex>, the penalty added to the{' '}
          <Tex>{`\\textsf{Stowing} \\to \\textsf{Seated}`}</Tex> transition is
        </p>
        <Tex block>{`T_{\\text{interference}} \\;=\\; \\sum_{m=1}^{k} \\Delta_m \\;=\\; \\sum_{m=1}^{k}\\bigl(t_{\\text{clear},m} + t_{\\text{sit},m}\\bigr).`}</Tex>
        <p>
          Outside-in strategies (WilMA, Steffen) fill inner seats first, so <Tex>{`k = 0`}</Tex> and{' '}
          <Tex>{`T_{\\text{interference}} = 0`}</Tex> — they eliminate this penalty entirely.
        </p>
      </section>

      <section>
        <h3>3 · Stochastic Luggage Stowage (Gamma)</h3>
        <p>
          Stow time is heavily right-skewed: most passengers are quick, a few wrestle the overhead
          bin. We model it (in Realism Mode) as a Gamma variate whose shape scales with carry-on
          count <Tex>{`B`}</Tex>:
        </p>
        <Tex block>{`t_{\\text{stow}} \\sim \\Gamma(k,\\theta), \\qquad f(x) = \\frac{x^{\\,k-1} e^{-x/\\theta}}{\\theta^{k}\\,\\Gamma(k)}, \\qquad k \\propto B.`}</Tex>
        <p>
          Mean <Tex>{`\\mathbb{E}[t_{\\text{stow}}] = k\\theta`}</Tex> and variance{' '}
          <Tex>{`\\operatorname{Var}[t_{\\text{stow}}] = k\\theta^{2}`}</Tex>. Simple Mode bypasses
          this with a deterministic <Tex>{`t_{\\text{stow}} = B \\cdot \\tau`}</Tex>{' '}
          (<Tex>{`\\tau = 20`}</Tex> ticks/bag).
        </p>
      </section>

      <section>
        <h3>4 · Global Objective</h3>
        <p>Total boarding time is the makespan over all passengers — the last person seated:</p>
        <Tex block>{`E(T) \\;=\\; \\max_{k \\in P}\\Bigl( t_{\\text{walk},k} + t_{\\text{stow},k} + \\textstyle\\sum T_{\\text{aisle},k} + \\sum T_{\\text{seat},k}\\Bigr).`}</Tex>
      </section>

      <section>
        <h3>5 · Genetic-Algorithm Optimizer</h3>
        <p>
          The optimizer searches the space of boarding permutations <Tex>{`\\pi \\in S_N`}</Tex> to
          minimise the objective, using Order Crossover (OX1) and swap mutation under tournament
          selection:
        </p>
        <Tex block>{`\\pi^{\\star} \\;=\\; \\arg\\min_{\\pi \\in S_N}\\; E(T \\mid \\pi).`}</Tex>
        <p>
          Fitness is evaluated in Simple Mode so each chromosome maps to a single, cacheable
          boarding time — isolating the structure of the order from human noise.
        </p>
      </section>
    </div>
  );
}
