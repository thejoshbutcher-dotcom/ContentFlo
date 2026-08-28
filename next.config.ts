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
  env: {
    BUILD_COMMIT: gitSha(),
    BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
