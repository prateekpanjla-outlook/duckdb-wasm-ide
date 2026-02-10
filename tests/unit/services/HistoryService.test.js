/**
 * Unit Tests for HistoryService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryService } from '../../../js/services/HistoryService.js';
import { MemoryStorageAdapter } from '../../../js/storage/MemoryStorageAdapter.js';

describe('HistoryService', () => {
    let historyService;
    let mockStorage;

    beforeEach(() => {
        mockStorage = new MemoryStorageAdapter();
        historyService = new HistoryService({
            storage: mockStorage,
            maxHistorySize: 50
        });
    });

    describe('adding to history', () => {
        it('should add query to empty history', async () => {
            const query = 'SELECT * FROM test';
            await historyService.addToHistory(query);

            const history = await historyService.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0]).toBe(query);
        });

        it('should not add empty queries', async () => {
            await historyService.addToHistory('');
            await historyService.addToHistory('   ');

            const history = await historyService.getHistory();
            expect(history).toHaveLength(0);
        });

        it('should not add duplicate queries', async () => {
            const query = 'SELECT * FROM test';

            await historyService.addToHistory(query);
            await historyService.addToHistory(query);

            const history = await historyService.getHistory();
            expect(history).toHaveLength(1);
        });

        it('should maintain max history size', async () => {
            const service = new HistoryService({
                storage: mockStorage,
                maxHistorySize: 3
            });

            await service.addToHistory('query1');
            await service.addToHistory('query2');
            await service.addToHistory('query3');
            await service.addToHistory('query4');

            const history = await service.getHistory();
            expect(history).toHaveLength(3);
            expect(history[0]).toBe('query4');
            expect(history).not.toContain('query1');
        });

        it('should add new queries to the front', async () => {
            await historyService.addToHistory('query1');
            await historyService.addToHistory('query2');
            await historyService.addToHistory('query3');

            const history = await historyService.getHistory();
            expect(history).toEqual(['query3', 'query2', 'query1']);
        });

        it('should trim whitespace from queries', async () => {
            const query = '  SELECT * FROM test  ';
            await historyService.addToHistory(query);

            const history = await historyService.getHistory();
            expect(history[0]).toBe('SELECT * FROM test');
        });
    });

    describe('retrieving history', () => {
        it('should return empty array when no history', async () => {
            const history = await historyService.getHistory();
            expect(history).toEqual([]);
        });

        it('should retrieve saved history', async () => {
            await historyService.addToHistory('query1');
            await historyService.addToHistory('query2');

            const history = await historyService.getHistory();
            expect(history).toHaveLength(2);
        });

        it('should handle corrupted storage data', async () => {
            await mockStorage.setItem('duckdb_query_history', 'invalid json');

            const history = await historyService.getHistory();
            expect(history).toEqual([]);
        });

        it('should handle non-array data in storage', async () => {
            await mockStorage.setItem('duckdb_query_history', JSON.stringify({ not: 'an array' }));

            const history = await historyService.getHistory();
            expect(history).toEqual([]);
        });
    });

    describe('clearing history', () => {
        it('should clear all history', async () => {
            await historyService.addToHistory('query1');
            await historyService.addToHistory('query2');

            await historyService.clearHistory();

            const history = await historyService.getHistory();
            expect(history).toEqual([]);
        });

        it('should persist to storage', async () => {
            await historyService.addToHistory('query1');
            await historyService.clearHistory();

            const stored = await mockStorage.getItem('duckdb_query_history');
            expect(JSON.parse(stored)).toEqual([]);
        });
    });

    describe('search functionality', () => {
        beforeEach(async () => {
            await historyService.addToHistory('SELECT * FROM users');
            await historyService.addToHistory('SELECT * FROM products');
            await historyService.addToHistory('INSERT INTO orders VALUES (1, 2)');
            await historyService.addToHistory('SELECT COUNT(*) FROM users');
        });

        it('should find queries containing search term', async () => {
            const results = await historyService.searchHistory('SELECT');
            expect(results).toHaveLength(3);
        });

        it('should be case insensitive', async () => {
            const results1 = await historyService.searchHistory('select');
            const results2 = await historyService.searchHistory('SELECT');

            expect(results1).toHaveLength(results2.length);
        });

        it('should find exact matches', async () => {
            const results = await historyService.searchHistory('users');
            expect(results).toHaveLength(2);
        });

        it('should return empty array for no matches', async () => {
            const results = await historyService.searchHistory('nonexistent');
            expect(results).toEqual([]);
        });
    });

    describe('statistics', () => {
        it('should return stats for empty history', async () => {
            const stats = await historyService.getStats();

            expect(stats.total).toBe(0);
            expect(stats.unique).toBe(0);
            expect(stats.oldest).toBeNull();
            expect(stats.newest).toBeNull();
        });

        it('should return stats with queries', async () => {
            await historyService.addToHistory('query1');
            await historyService.addToHistory('query2');
            await historyService.addToHistory('query3');

            const stats = await historyService.getStats();

            expect(stats.total).toBe(3);
            expect(stats.unique).toBe(3);
            expect(stats.oldest).toBe('query1');
            expect(stats.newest).toBe('query3');
        });

        it('should count unique queries correctly', async () => {
            await historyService.addToHistory('query1');
            await historyService.addToHistory('query2');
            await historyService.addToHistory('query1'); // Duplicate

            const stats = await historyService.getStats();
            expect(stats.unique).toBe(2);
        });
    });

    describe('removing from history', () => {
        it('should remove existing query', async () => {
            await historyService.addToHistory('query1');
            await historyService.addToHistory('query2');

            const removed = await historyService.removeFromHistory('query1');

            expect(removed).toBe(true);
            const history = await historyService.getHistory();
            expect(history).toEqual(['query2']);
        });

        it('should return false for non-existent query', async () => {
            const removed = await historyService.removeFromHistory('nonexistent');
            expect(removed).toBe(false);
        });

        it('should handle removing from empty history', async () => {
            const removed = await historyService.removeFromHistory('query1');
            expect(removed).toBe(false);
        });
    });

    describe('persistence across instances', () => {
        it('should persist history across service instances', async () => {
            await historyService.addToHistory('query1');

            const newService = new HistoryService({
                storage: mockStorage,
                maxHistorySize: 50
            });

            const history = await newService.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0]).toBe('query1');
        });
    });

    describe('edge cases', () => {
        it('should handle very long queries', async () => {
            const longQuery = 'SELECT * FROM test WHERE id IN (' +
                Array(1000).fill().map((_, i) => i).join(',') + ')';

            await historyService.addToHistory(longQuery);

            const history = await historyService.getHistory();
            expect(history[0]).toBe(longQuery);
        });

        it('should handle special characters in queries', async () => {
            const specialQuery = "SELECT * FROM test WHERE name = 'O\\'Reilly'";

            await historyService.addToHistory(specialQuery);

            const history = await historyService.getHistory();
            expect(history[0]).toBe(specialQuery);
        });

        it('should handle Unicode characters', async () => {
            const unicodeQuery = 'SELECT * FROM test WHERE name = "中文测试"';

            await historyService.addToHistory(unicodeQuery);

            const history = await historyService.getHistory();
            expect(history[0]).toBe(unicodeQuery);
        });
    });
});
