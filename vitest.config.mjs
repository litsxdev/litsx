import { defineConfig } from 'vitest/config';
import TransformReporter from './test/helpers/reporter/vitest-transform-reporter.js';
import { LOG_TRANSFORM_MARKER } from './test/helpers/reporter/log-transform.js';

const TRANSFORM_REPORTER_ENABLED = process.env.LITSX_VITEST_TRANSFORMS === '1';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    globals: true,
    setupFiles: TRANSFORM_REPORTER_ENABLED
      ? ['./test/helpers/reporter/setup-auto-log-transforms.js']
      : [],
    reporters: TRANSFORM_REPORTER_ENABLED
      ? [new TransformReporter()]
      : ['default'],
    coverage: {
      reporter: ['text', 'html', 'json-summary', 'json'],
      include: ['packages/*/src/**', 'packages/react/*/src/**', 'packages/shared/*/src/**'],
      exclude: [
        '**/node_modules/**',
        '**/test/**',
        '**/dist/**',
        'test/fixtures/dx-smoke-app/src/**',
        'packages/vitepress/src/**',
        'packages/litsx-playground/src/LitsxPlayground.tsx',
        'packages/litsx-playground/src/index.js',
        'packages/litsx-playground/src/playground-runtime.js',
        'packages/litsx-playground/src/preview-runtime/**',
      ],
    },
    onConsoleLog(log) {
      if (
        TRANSFORM_REPORTER_ENABLED &&
        typeof log === 'string' &&
        log.trim().startsWith(LOG_TRANSFORM_MARKER)
      ) {
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
