import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages配信時はワークフローが CHIKA_BASE=/chika/ を与える。
  base: process.env.CHIKA_BASE ?? '/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
