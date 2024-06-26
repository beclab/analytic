import { defineConfig } from 'tsup';

// const isProduction = process.env.NODE_ENV === "production";

export default defineConfig({
  clean: true,
  // dts: true,
  entry: ['./index.ts'],
  format: ['cjs'],
  minify: false,
  sourcemap: true,
});
