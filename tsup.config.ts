import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli/index.ts' },
  format: ['esm'],
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
});
