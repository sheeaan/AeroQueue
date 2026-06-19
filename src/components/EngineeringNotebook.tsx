'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// KaTeX-heavy content is fetched lazily, only when the notebook is first opened.
const NotebookContent = dynamic(
  () => import('@/components/NotebookContent').then((module) => module.NotebookContent),
  { ssr: false, loading: () => <div className="notebook-body">Loading…</div> },
);

/**
 * The Engineering Notebook — a modal documenting the rigorous math behind the
 * simulation (event-queue complexity, the seat-interference penalty, the Gamma
 * stowage model, the global objective, and the GA fitness). The math body and
 * its KaTeX dependency are code-split so they never weigh down the initial load.
 */
export function EngineeringNotebook() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button className="notebook-button secondary" onClick={() => setOpen(true)}>
        📓 my math
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="my math"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>my math</h2>
              <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </header>
            <NotebookContent />
          </div>
        </div>
      )}
    </>
  );
}
