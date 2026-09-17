import { execSync } from "node:child_process";
import type { NextConfig } from "next";

// Stamped at build time so /api/version can report exactly which commit is
// serving. Hostinger builds from a git checkout, so rev-parse works there;
// if git is ever unavailable the endpoint still reports the build time.
function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  // Turns the /_next/image optimizer OFF. It has a critical advisory
  // (GHSA-2xp9-vwfh-vxw4, AVIF decoding) fixed only in Next 16.3.3+, which
  // Hostinger's GLIBC can't build. We serve a handful of small brand PNGs and
  // hotlinked YouTube thumbnails, so there's nothing for it to optimize —
  // remove the attack surface rather than carry it.
  images: { unoptimized: true },
  env: {
    BUILD_COMMIT: gitSha(),
    BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
