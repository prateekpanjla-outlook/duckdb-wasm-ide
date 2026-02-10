import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests/setup/vitest.setup.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'tests/',
                'js/mocks/',
                '**/*.spec.js',
                '**/*.test.js'
            ],
            thresholds: {
                statements: 80,
                branches: 75,
                functions: 80,
                lines: 80
            }
        },
        include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
        exclude: ['tests/e2e/**'],
        testTimeout: 10000,
        hookTimeout: 10000
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './js'),
            '@test': path.resolve(__dirname, './tests')
        }
    }
});
