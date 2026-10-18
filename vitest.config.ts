import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}', 'test/unit/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['test/unit/setup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          include: ['test/db/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/db/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
