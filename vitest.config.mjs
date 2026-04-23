import { defineConfig } from 'vitest/config';
import babel from 'vite-plugin-babel';
import TransformReporter from './test/helpers/reporter/vitest-transform-reporter.js';
import { LOG_TRANSFORM_MARKER } from './test/helpers/reporter/log-transform.js';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    globals: true,
    setupFiles: ['./test/helpers/reporter/setup-auto-log-transforms.js'],
    reporters: [new TransformReporter()],
    coverage: {
      reporter: ['text', 'html'],
      include: ['packages/*/src/**', 'packages/react/*/src/**', 'packages/shared/*/src/**'],
      exclude: [
        '**/node_modules/**',
        '**/test/**',
        '**/dist/**',
        'packages/litsx-playground/src/LitsxPlayground.tsx',
        'packages/litsx-playground/src/index.js',
        'packages/litsx-playground/src/playground-runtime.js',
        'packages/litsx-playground/src/preview-runtime/**',
      ],
    },
    onConsoleLog(log) {
      if (typeof log === 'string' && log.trim().startsWith(LOG_TRANSFORM_MARKER)) {
        return false;
      }
    },
  },
  plugins: [
    // babel({
    //   babelHelpers: 'bundled',
    //   extensions: ['.js', '.mjs'],
    //   include: ['packages/*/src/**'],
    //   babelConfig: {
    //     presets: [],
    //     plugins: [
    //       ['@babel/plugin-syntax-jsx'],
    //     ],
    //   },
    // }),
  ],
});
