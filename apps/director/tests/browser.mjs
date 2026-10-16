// Use the package-pinned browser by default. An OS browser requires an explicit override.
export const chromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
export const directorUrl =
  process.env.DIRECTOR_TEST_URL || "http://localhost:3002";
