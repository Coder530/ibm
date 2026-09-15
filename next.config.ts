import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 otherwise auto-appends an "agent rules" block to CLAUDE.md on
  // every `next dev`/`next build`. This repo's CLAUDE.md is hand-maintained
  // project instruction content, not a build artifact.
  agentRules: false,
};

export default nextConfig;
