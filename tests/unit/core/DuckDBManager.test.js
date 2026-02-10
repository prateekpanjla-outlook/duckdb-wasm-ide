/**
 * Unit Tests for DuckDBManager
 * Tests database operations with mocked DuckDB WASM
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DuckDBManager, DuckDBError } from '../../../js/core/DuckDBManager.js';
import { MockAsyncDuckDB, MockDuckDBConnection } from '../../../js/mocks/MockDuckDB.js';

describe('DuckDBManager', () => {
    let dbManager;
    let mockDuckDB;
    let mockLogger;

    beforeEach(() => {
        // Create mock DuckDB
        mockDuckDB = new MockAsyncDuckDB();

        // Create mock logger
        mockLogger = {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn()
        };

        // Create manager with injected dependencies
        dbManager = new DuckDBManager({
            duckdbModule: mockDuckDB,
            logger: mockLogger,
            config: {
                jsDelivrBundle: 'https://cdn.example.com/',
                logLevel: 'WARNING'
            }
        });
    });

    describe('initialization', () => {
        it('should initialize successfully with valid module', async () => {
            const result = await dbManager.initialize();

            expect(result).toBe(true);
            expect(dbManager.connection).toBeDefined();
            expect(mockLogger.log).toHaveBeenCalled();
        });

        it('should initialize with correct parameter order (logger, worker)', async () => {
            // This test validates the fix for: AsyncDuckDB(logger, worker) not (worker, logger)
            // Reference: test-duckdb-init.html - working initialization pattern
            const result = await dbManager.initialize();

            expect(result).toBe(true);
            // Verify that the database was instantiated with pthreadWorker
            expect(mockDuckDB.instantiate).toHaveBeenCalled();
        });

        it('should handle initialization errors gracefully', async () => {
            const failingManager = new DuckDBManager({
                duckdbModule: null,
                logger: mockLogger
            });

            // Mock failed import
            const testImport = vi.fn().mockRejectedValue(new Error('Network error'));
            global.import = testImport;

            const result = await failingManager.initialize();

            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should use default configuration when not provided', async () => {
            const defaultManager = new DuckDBManager({
                duckdbModule: mockDuckDB,
                logger: mockLogger
            });

            expect(defaultManager.config).toEqual({
                jsDelivrBundle: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.1/dist/',
                logLevel: 'WARNING'
            });
        });
    });

    describe('query execution', () => {
        beforeEach(async () => {
            await dbManager.initialize();
        });

        it('should execute SELECT query successfully', async () => {
            const result = await dbManager.executeQuery('SELECT * FROM test');

            expect(result).toHaveProperty('columns');
            expect(result).toHaveProperty('rows');
            expect(Array.isArray(result.columns)).toBe(true);
            expect(Array.isArray(result.rows)).toBe(true);
        });

        it('should throw DuckDBError when not connected', async () => {
            const disconnectedManager = new DuckDBManager({
                duckdbModule: mockDuckDB,
                logger: mockLogger
            });

            await expect(
                disconnectedManager.executeQuery('SELECT 1')
            ).rejects.toThrow(DuckDBError);
            await expect(
                disconnectedManager.executeQuery('SELECT 1')
            ).rejects.toThrow('Database not connected');
        });

        it('should format DuckDB result correctly', () => {
            const mockResult = {
                schema: {
                    fields: [
                        { name: 'id' },
                        { name: 'name' }
                    ]
                },
                data: [
                    [1, 2, 3],
                    ['Alice', 'Bob', 'Charlie']
                ],
                numRows: 3
            };

            const formatted = dbManager.formatResult(mockResult);

            expect(formatted.columns).toEqual(['id', 'name']);
            expect(formatted.rows).toHaveLength(3);
            expect(formatted.rows[0]).toEqual({ id: 1, name: 'Alice' });
            expect(formatted.rows[1]).toEqual({ id: 2, name: 'Bob' });
            expect(formatted.rows[2]).toEqual({ id: 3, name: 'Charlie' });
        });

        it('should handle empty result', () => {
            const mockResult = {
                schema: {
                    fields: []
                },
                data: [],
                numRows: 0
            };

            const formatted = dbManager.formatResult(mockResult);

            expect(formatted.columns).toEqual([]);
            expect(formatted.rows).toEqual([]);
        });

        it('should handle result with null schema', () => {
            const formatted = dbManager.formatResult(null);

            expect(formatted.columns).toEqual([]);
            expect(formatted.rows).toEqual([]);
        });

        it('should throw DuckDBError for failed queries', async () => {
            // Create a mock connection that throws errors
            const errorConnection = new MockDuckDBConnection();
            errorConnection.query = vi.fn().mockRejectedValue(
                new Error('Table does not exist')
            );

            const errorManager = new DuckDBManager({
                duckdbModule: mockDuckDB,
                logger: mockLogger
            });
            errorManager.connection = errorConnection;

            await expect(
                errorManager.executeQuery('SELECT * FROM nonexistent')
            ).rejects.toThrow(DuckDBError);
            await expect(
                errorManager.executeQuery('SELECT * FROM nonexistent')
            ).rejects.toThrow('Query failed');
        });
    });

    describe('file operations', () => {
        beforeEach(async () => {
            await dbManager.initialize();
        });

        it('should register CSV file successfully', async () => {
            const mockFile = new File(['id,name\n1,Alice'], 'test.csv', {
                type: 'text/csv'
            });

            const result = await dbManager.registerFile('test.csv', mockFile);

            expect(result).toBe(true);
        });

        it('should throw error when registering file without database', async () => {
            const noDbManager = new DuckDBManager({
                duckdbModule: null,
                logger: mockLogger
            });

            const mockFile = new File([''], 'test.csv');

            await expect(
                noDbManager.registerFile('test.csv', mockFile)
            ).rejects.toThrow(DuckDBError);
        });

        it('should insert CSV from path', async () => {
            const result = await dbManager.insertCSVFromPath('test.csv', 'test_table');

            expect(result).toBe(true);
        });

        it('should throw error when inserting CSV without connection', async () => {
            const newManager = new DuckDBManager({
                duckdbModule: mockDuckDB,
                logger: mockLogger
            });

            await expect(
                newManager.insertCSVFromPath('test.csv', 'test_table')
            ).rejects.toThrow(DuckDBError);
        });

        it('should insert JSON from path', async () => {
            const result = await dbManager.insertJSONFromPath('test.json', 'test_table');

            expect(result).toBe(true);
        });

        it('should create table from Parquet file', async () => {
            const result = await dbManager.createTableFromParquet(
                'test.parquet',
                'test_table'
            );

            expect(result).toBe(true);
        });
    });

    describe('table operations', () => {
        beforeEach(async () => {
            await dbManager.initialize();
        });

        it('should retrieve list of tables', async () => {
            // Add a mock table first
            dbManager.connection.mockData.tables['test'] = {
                type: 'csv',
                rows: 100
            };

            const result = await dbManager.getTables();

            expect(result).toHaveProperty('columns');
            expect(result.columns).toContain('name');
        });

        it('should return empty tables list when no tables exist', async () => {
            const result = await dbManager.getTables();

            expect(result.rows).toHaveLength(0);
        });

        it('should throw error when getting tables without connection', async () => {
            const newManager = new DuckDBManager({
                duckdbModule: mockDuckDB,
                logger: mockLogger
            });

            await expect(newManager.getTables()).rejects.toThrow(DuckDBError);
        });
    });

    describe('cleanup', () => {
        it('should close connection properly', async () => {
            await dbManager.initialize();

            expect(dbManager.connection).toBeDefined();

            await dbManager.close();

            expect(dbManager.connection).toBeNull();
            expect(dbManager.db).toBeNull();
        });

        it('should handle closing when already closed', async () => {
            await dbManager.initialize();
            await dbManager.close();

            // Should not throw error when closing again
            await expect(dbManager.close()).resolves.not.toThrow();
        });
    });

    describe('error handling', () => {
        it('should create DuckDBError with message and code', () => {
            const error = new DuckDBError('Test error', 'TEST_CODE');

            expect(error.message).toBe('Test error');
            expect(error.code).toBe('TEST_CODE');
            expect(error.name).toBe('DuckDBError');
        });

        it('should use default error code', () => {
            const error = new DuckDBError('Test error');

            expect(error.code).toBe('DUCKDB_ERROR');
        });
    });

    describe('edge cases', () => {
        it('should handle result with missing data', () => {
            const mockResult = {
                schema: {
                    fields: [{ name: 'id' }]
                }
            };

            const formatted = dbManager.formatResult(mockResult);

            expect(formatted.columns).toEqual(['id']);
            expect(formatted.rows).toEqual([]);
        });

        it('should handle result with zero rows', () => {
            const mockResult = {
                schema: {
                    fields: [{ name: 'id' }]
                },
                data: [[]],
                numRows: 0
            };

            const formatted = dbManager.formatResult(mockResult);

            expect(formatted.rows).toEqual([]);
        });

        it('should handle columns with null values', () => {
            const mockResult = {
                schema: {
                    fields: [{ name: 'id' }, { name: 'name' }]
                },
                data: [
                    [1, 2],
                    ['Alice', null]
                ],
                numRows: 2
            };

            const formatted = dbManager.formatResult(mockResult);

            expect(formatted.rows[0]).toEqual({ id: 1, name: 'Alice' });
            expect(formatted.rows[1]).toEqual({ id: 2, name: null });
        });
    });
});
