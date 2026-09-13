import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          include: ['packages/*/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      // Bun installs workspaces in isolated mode, so the web project keeps its own config next to its dependencies.
      'apps/web',
    ],
  },
})
