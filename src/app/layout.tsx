import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

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
