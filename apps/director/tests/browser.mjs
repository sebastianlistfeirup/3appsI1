import { existsSync } from "node:fs";
export const chromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export const directorUrl =
  process.env.DIRECTOR_TEST_URL || "http://localhost:3002";
