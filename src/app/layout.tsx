import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
// KaTeX styles are loaded globally (not inside the lazy Engineering-Notebook
// chunk): a CSS import inside a `dynamic(..., { ssr:false })` module can resolve
// to a missing webpack module factory and crash the notebook on open.
import 'katex/dist/katex.min.css';

export const metadata: Metadata = {
  title: 'AeroQueue — Aircraft Boarding Simulation Lab',
  description:
    'A client-side discrete-event simulation and operations-research lab for evaluating aircraft boarding strategies.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
