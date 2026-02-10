/**
 * Unit Tests for FileService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    FileService,
    FileProcessingError,
    FileProcessingResult
} from '../../../js/services/FileService.js';
import { MockAsyncDuckDB } from '../../../js/mocks/MockDuckDB.js';

describe('FileService', () => {
    let fileService;
    let mockDBManager;
    let mockLogger;

    beforeEach(() => {
        // Create mock DuckDB
        const mockDuckDB = new MockAsyncDuckDB();

        // Create mock database manager
        mockDBManager = {
            registerFile: vi.fn().mockResolvedValue(true),
            insertCSVFromPath: vi.fn().mockResolvedValue(true),
            insertJSONFromPath: vi.fn().mockResolvedValue(true),
            createTableFromParquet: vi.fn().mockResolvedValue(true),
            executeQuery: vi.fn().mockResolvedValue({}),
            connection: {
                mockData: {
                    tables: {}
                }
            }
        };

        // Create mock logger
        mockLogger = {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn()
        };

        // Create FileService
        fileService = new FileService({
            dbManager: mockDBManager,
            logger: mockLogger
        });
    });

    describe('file validation', () => {
        it('should validate a valid CSV file', () => {
            const csvFile = new File(['id,name\n1,Alice'], 'test.csv', {
                type: 'text/csv'
            });

            const result = fileService.validateFile(csvFile);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should validate a valid JSON file', () => {
            const jsonFile = new File(['[{"id":1}]'], 'test.json', {
                type: 'application/json'
            });

            const result = fileService.validateFile(jsonFile);

            expect(result.valid).toBe(true);
        });

        it('should validate a valid Parquet file', () => {
            const parquetFile = new File(['parquet-data'], 'test.parquet', {
                type: 'application/octet-stream'
            });

            const result = fileService.validateFile(parquetFile);

            // Debug
            if (!result.valid) {
                console.log('Parquet file validation errors:', result.errors);
                console.log('File:', parquetFile.name, parquetFile.size, parquetFile.type);
            }

            expect(result.valid).toBe(true);
        });

        it('should validate a valid DuckDB file', () => {
            const duckdbFile = new File(['duckdb-data'], 'test.duckdb', {
                type: 'application/octet-stream'
            });

            const result = fileService.validateFile(duckdbFile);

            // Debug
            if (!result.valid) {
                console.log('DuckDB file validation errors:', result.errors);
                console.log('File:', duckdbFile.name, duckdbFile.size, duckdbFile.type);
            }

            expect(result.valid).toBe(true);
        });

        it('should reject unsupported file types', () => {
            const txtFile = new File(['test'], 'test.txt', {
                type: 'text/plain'
            });

            const result = fileService.validateFile(txtFile);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Invalid file type'))).toBe(true);
        });

        it('should reject empty files', () => {
            const emptyFile = new File([''], 'empty.csv', {
                type: 'text/csv'
            });

            const result = fileService.validateFile(emptyFile);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('File is empty');
        });

        it('should reject oversized files', () => {
            // Note: jsdom File has limitations with explicit size option
            // Testing the validation logic by directly checking size
            const mockFile = {
                name: 'large.csv',
                type: 'text/csv',
                size: 600 * 1024 * 1024, // 600MB
                lastModified: Date.now()
            };

            // Manually call the validator logic
            const MAX_SIZE = 500 * 1024 * 1024;
            const hasError = mockFile.size > MAX_SIZE;

            expect(hasError).toBe(true);

            // Now test through FileService
            // Create a real file but mock its size property
            const largeFile = new File(['x'], 'large.csv', {
                type: 'text/csv'
            });

            // Override size using getter
            Object.defineProperty(largeFile, 'size', {
                get() { return 600 * 1024 * 1024; },
                enumerable: true,
                configurable: true
            });

            const result = fileService.validateFile(largeFile);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
        });

        it('should reject null file', () => {
            const result = fileService.validateFile(null);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('No file provided');
        });

        it('should reject files with invalid characters in name', () => {
            const invalidFile = new File(['data'], 'test<file>.csv', {
                type: 'text/csv'
            });

            const result = fileService.validateFile(invalidFile);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('invalid characters'))).toBe(true);
        });
    });

    describe('table name generation', () => {
        it('should generate valid table name from filename', () => {
            const tableName = fileService.generateTableName('my-data-file.csv');

            expect(tableName).toBe('my_data_file');
        });

        it('should handle special characters', () => {
            const tableName = fileService.generateTableName('my @#$ file.csv');

            expect(tableName).toBe('my_____file');  // 5 underscores for space, @, #, $, space
        });

        it('should handle multiple dots', () => {
            const tableName = fileService.generateTableName('my.file.name.csv');

            expect(tableName).toBe('my_file_name');
        });

        it('should handle filenames starting with numbers', () => {
            const tableName = fileService.generateTableName('2024-data.csv');

            expect(tableName).toMatch(/^table_\d+/);
        });

        it('should handle empty filename', () => {
            const tableName = fileService.generateTableName('');

            expect(tableName).toMatch(/^table_\d+/);
        });

        it('should handle very long filenames', () => {
            const longName = 'a'.repeat(100) + '.csv';
            const tableName = fileService.generateTableName(longName);

            expect(tableName.length).toBeLessThanOrEqual(64);
        });
    });

    describe('file processing', () => {
        it('should process CSV file successfully', async () => {
            const csvFile = new File(['id,name\n1,Alice'], 'test.csv', {
                type: 'text/csv'
            });

            const result = await fileService.processFile(csvFile);

            expect(result).toBeInstanceOf(FileProcessingResult);
            expect(result.fileName).toBe('test.csv');
            expect(result.tableName).toBe('test');
            expect(result.fileType).toBe('csv');
            expect(result.formattedSize).toMatch(/\d+ B/);
        });

        it('should process JSON file successfully', async () => {
            const jsonFile = new File(['[{"id":1,"name":"Alice"}]'], 'test.json', {
                type: 'application/json'
            });

            const result = await fileService.processFile(jsonFile);

            expect(result.fileName).toBe('test.json');
            expect(result.tableName).toBe('test');
            expect(result.fileType).toBe('json');
        });

        it('should process Parquet file successfully', async () => {
            const parquetFile = new File(['parquet-data'], 'test.parquet', {
                type: 'application/octet-stream'
            });

            const result = await fileService.processFile(parquetFile);

            expect(result.fileName).toBe('test.parquet');
            expect(result.fileType).toBe('parquet');
        });

        it('should process DuckDB database file', async () => {
            const duckdbFile = new File(['duckdb-data'], 'mydb.duckdb', {
                type: 'application/octet-stream'
            });

            const result = await fileService.processFile(duckdbFile);

            expect(result.fileName).toBe('mydb.duckdb');
            expect(result.fileType).toBe('duckdb');
        });

        it('should use custom table name when provided', async () => {
            const csvFile = new File(['id,name\n1,Alice'], 'data.csv', {
                type: 'text/csv'
            });

            const result = await fileService.processFile(csvFile, {
                tableName: 'custom_table'
            });

            expect(result.tableName).toBe('custom_table');
        });

        it('should call appropriate loading method based on file type', async () => {
            const csvFile = new File(['data'], 'test.csv', {
                type: 'text/csv'
            });

            await fileService.processFile(csvFile);

            expect(mockDBManager.registerFile).toHaveBeenCalledWith('test.csv', csvFile);
            expect(mockDBManager.insertCSVFromPath).toHaveBeenCalledWith('test.csv', 'test');
        });

        it('should throw FileProcessingError for invalid file', async () => {
            const txtFile = new File(['test'], 'test.txt', {
                type: 'text/plain'
            });

            await expect(fileService.processFile(txtFile)).rejects.toThrow(FileProcessingError);
        });

        it('should throw FileProcessingError when dbManager not set', async () => {
            const noDBService = new FileService({
                dbManager: null,
                logger: mockLogger
            });

            const csvFile = new File(['data'], 'test.csv', {
                type: 'text/csv'
            });

            await expect(noDBService.processFile(csvFile)).rejects.toThrow(FileProcessingError);
        });

        it('should throw FileProcessingError when registration fails', async () => {
            mockDBManager.registerFile.mockRejectedValue(new Error('Registration failed'));

            const csvFile = new File(['data'], 'test.csv', {
                type: 'text/csv'
            });

            await expect(fileService.processFile(csvFile)).rejects.toThrow(FileProcessingError);
        });
    });

    describe('file type support', () => {
        it('should return list of supported file types', () => {
            const types = fileService.getSupportedFileTypes();

            expect(types).toEqual(['csv', 'json', 'parquet', 'duckdb']);
        });

        it('should check if file type is supported', () => {
            expect(fileService.isFileTypeSupported('csv')).toBe(true);
            expect(fileService.isFileTypeSupported('CSV')).toBe(true);
            expect(fileService.isFileTypeSupported('json')).toBe(true);
            expect(fileService.isFileTypeSupported('parquet')).toBe(true);
            expect(fileService.isFileTypeSupported('duckdb')).toBe(true);
            expect(fileService.isFileTypeSupported('txt')).toBe(false);
            expect(fileService.isFileTypeSupported('exe')).toBe(false);
        });

        it('should get file type from filename', () => {
            expect(fileService.getFileType('data.csv')).toBe('csv');
            expect(fileService.getFileType('data.json')).toBe('json');
            expect(fileService.getFileType('data.parquet')).toBe('parquet');
            expect(fileService.getFileType('db.duckdb')).toBe('duckdb');
            expect(fileService.getFileType('data.txt')).toBe('txt');
        });
    });

    describe('file size formatting', () => {
        it('should format file sizes correctly', () => {
            expect(fileService.formatFileSize(0)).toBe('0 Bytes');
            expect(fileService.formatFileSize(1024)).toBe('1 KB');
            expect(fileService.formatFileSize(1024 * 1024)).toBe('1 MB');
            expect(fileService.formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
        });
    });

    describe('batch processing', () => {
        it('should process multiple files successfully', async () => {
            const files = [
                new File(['data1'], 'file1.csv', { type: 'text/csv' }),
                new File(['data2'], 'file2.json', { type: 'application/json' })
            ];

            const results = await fileService.processBatch(files);

            expect(results).toHaveLength(2);
            expect(results[0].fileName).toBe('file1.csv');
            expect(results[1].fileName).toBe('file2.json');
        });

        it('should generate unique table names for batch', async () => {
            const files = [
                new File(['data1'], 'file1.csv', { type: 'text/csv' }),
                new File(['data2'], 'file2.csv', { type: 'text/csv' })
            ];

            const results = await fileService.processBatch(files, {
                tableName: 'batch_table'
            });

            expect(results[0].tableName).toBe('batch_table_1');
            expect(results[1].tableName).toBe('batch_table_2');
        });

        it('should handle partial failures in batch', async () => {
            const files = [
                new File(['valid'], 'file1.csv', { type: 'text/csv' }),
                new File(['invalid'], 'file2.txt', { type: 'text/plain' })
            ];

            // Should not throw by default
            const results = await fileService.processBatch(files, {
                continueOnError: true
            });

            expect(results).toHaveLength(1);
            expect(results[0].fileName).toBe('file1.csv');
        });

        it('should throw on batch failure when not continuing', async () => {
            const files = [
                new File(['valid'], 'file1.csv', { type: 'text/csv' }),
                new File(['invalid'], 'file2.txt', { type: 'text/plain' })
            ];

            await expect(
                fileService.processBatch(files, { continueOnError: false })
            ).rejects.toThrow(FileProcessingError);
        });
    });

    describe('summary creation', () => {
        it('should create summary of processed files', () => {
            const results = [
                new FileProcessingResult('file1.csv', 'table1', 1024, 'csv'),
                new FileProcessingResult('file2.json', 'table2', 2048, 'json'),
                new FileProcessingResult('file3.csv', 'table3', 512, 'csv')
            ];

            const summary = fileService.createSummary(results);

            expect(summary.totalFiles).toBe(3);
            expect(summary.totalSize).toBe(3584);
            expect(summary.formattedTotalSize).toMatch(/3\.5 KB/);
            expect(summary.filesByType.csv).toBe(2);
            expect(summary.filesByType.json).toBe(1);
            expect(summary.tableNames).toEqual(['table1', 'table2', 'table3']);
        });

        it('should handle empty results array', () => {
            const summary = fileService.createSummary([]);

            expect(summary.totalFiles).toBe(0);
            expect(summary.totalSize).toBe(0);
            expect(summary.filesByType).toEqual({});
            expect(summary.tableNames).toEqual([]);
        });
    });

    describe('FileProcessingResult', () => {
        it('should create result object with correct properties', () => {
            const result = new FileProcessingResult(
                'test.csv',
                'test_table',
                1024,
                'csv'
            );

            expect(result.fileName).toBe('test.csv');
            expect(result.tableName).toBe('test_table');
            expect(result.fileSize).toBe(1024);
            expect(result.fileType).toBe('csv');
            expect(result.formattedSize).toBe('1 KB');
            expect(result.timestamp).toBeDefined();
        });
    });

    describe('FileProcessingError', () => {
        it('should create error with message and code', () => {
            const error = new FileProcessingError('Test error', 'TEST_CODE');

            expect(error.message).toBe('Test error');
            expect(error.code).toBe('TEST_CODE');
            expect(error.name).toBe('FileProcessingError');
        });

        it('should use default error code', () => {
            const error = new FileProcessingError('Test error');

            expect(error.code).toBe('FILE_PROCESSING_ERROR');
        });
    });

    describe('edge cases', () => {
        it('should handle filename with only extension', async () => {
            const csvFile = new File(['data'], '.csv', {
                type: 'text/csv'
            });

            const result = await fileService.processFile(csvFile);

            expect(result.tableName).toMatch(/^table_\d+/);
        });

        it('should handle file with no extension', async () => {
            const file = new File(['data'], 'README', {
                type: 'text/plain'
            });

            const validation = fileService.validateFile(file);

            expect(validation.valid).toBe(false);
        });

        it('should handle very long table name', async () => {
            const longName = 'a'.repeat(200) + '.csv';
            const csvFile = new File(['data'], longName, {
                type: 'text/csv'
            });

            const result = await fileService.processFile(csvFile);

            expect(result.tableName.length).toBeLessThanOrEqual(64);
        });
    });
});
