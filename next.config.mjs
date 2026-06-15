/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The simulation engine, PixiJS canvas and Monte-Carlo workers are *strictly*
  // client-side (see README "Rendering Paradigm"). We keep the Next.js shell thin;
  // every interactive surface is a Client Component to avoid network-tethered ticks.
};

export default nextConfig;
