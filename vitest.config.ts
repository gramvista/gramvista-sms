import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
    // PGlite tests hold a database in memory; avoid parallel worker processes.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
