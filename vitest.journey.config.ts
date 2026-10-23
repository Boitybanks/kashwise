import { defineConfig } from 'vitest/config'

// Live end-to-end journey against the real Supabase project (see tests/journey/journey.e2e.ts).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/journey/**/*.e2e.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    sequence: { concurrent: false },
    fileParallelism: false,
  },
})
