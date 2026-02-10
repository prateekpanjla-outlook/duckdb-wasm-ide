/**
 * Unit Tests for MemoryStorageAdapter
 * Tests the in-memory storage implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageAdapter } from '../../../js/storage/MemoryStorageAdapter.js';

describe('MemoryStorageAdapter', () => {
    let storage;

    beforeEach(() => {
        storage = new MemoryStorageAdapter();
    });

    describe('basic operations', () => {
        it('should store and retrieve values', async () => {
            await storage.setItem('key1', 'value1');
            const value = await storage.getItem('key1');
            expect(value).toBe('value1');
        });

        it('should return null for non-existent keys', async () => {
            const value = await storage.getItem('nonexistent');
            expect(value).toBeNull();
        });

        it('should overwrite existing values', async () => {
            await storage.setItem('key1', 'value1');
            await storage.setItem('key1', 'value2');
            const value = await storage.getItem('key1');
            expect(value).toBe('value2');
        });

        it('should remove items', async () => {
            await storage.setItem('key1', 'value1');
            await storage.removeItem('key1');
            const value = await storage.getItem('key1');
            expect(value).toBeNull();
        });

        it('should clear all items', async () => {
            await storage.setItem('key1', 'value1');
            await storage.setItem('key2', 'value2');
            await storage.clear();

            expect(await storage.getItem('key1')).toBeNull();
            expect(await storage.getItem('key2')).toBeNull();
        });
    });

    describe('storage size', () => {
        it('should track storage length correctly', async () => {
            expect(await storage.getLength()).toBe(0);

            await storage.setItem('key1', 'value1');
            expect(await storage.getLength()).toBe(1);

            await storage.setItem('key2', 'value2');
            expect(await storage.getLength()).toBe(2);

            await storage.removeItem('key1');
            expect(await storage.getLength()).toBe(1);
        });

        it('should return all keys', async () => {
            await storage.setItem('key1', 'value1');
            await storage.setItem('key2', 'value2');
            await storage.setItem('key3', 'value3');

            const keys = await storage.getKeys();
            expect(keys).toHaveLength(3);
            expect(keys).toContain('key1');
            expect(keys).toContain('key2');
            expect(keys).toContain('key3');
        });
    });

    describe('test helpers', () => {
        it('should get all items as object', async () => {
            await storage.setItem('key1', 'value1');
            await storage.setItem('key2', 'value2');

            const all = storage._getAll();
            expect(all).toEqual({
                key1: 'value1',
                key2: 'value2'
            });
        });

        it('should check if key exists', async () => {
            await storage.setItem('key1', 'value1');

            expect(storage._has('key1')).toBe(true);
            expect(storage._has('nonexistent')).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle empty string keys', async () => {
            await storage.setItem('', 'empty');
            expect(await storage.getItem('')).toBe('empty');
        });

        it('should handle empty string values', async () => {
            await storage.setItem('key1', '');
            expect(await storage.getItem('key1')).toBe('');
        });

        it('should handle JSON strings', async () => {
            const obj = { nested: { value: 123 } };
            await storage.setItem('json', JSON.stringify(obj));
            const retrieved = JSON.parse(await storage.getItem('json'));
            expect(retrieved).toEqual(obj);
        });

        it('should handle special characters in keys', async () => {
            const specialKeys = ['key-with-dash', 'key_with_underscore', 'key.with.dot'];

            for (const key of specialKeys) {
                await storage.setItem(key, `value-${key}`);
            }

            for (const key of specialKeys) {
                expect(await storage.getItem(key)).toBe(`value-${key}`);
            }
        });
    });

    describe('isolation', () => {
        it('should maintain separate storage between instances', async () => {
            const storage1 = new MemoryStorageAdapter();
            const storage2 = new MemoryStorageAdapter();

            await storage1.setItem('key1', 'value1');
            await storage2.setItem('key1', 'value2');

            expect(await storage1.getItem('key1')).toBe('value1');
            expect(await storage2.getItem('key1')).toBe('value2');
        });
    });
});
