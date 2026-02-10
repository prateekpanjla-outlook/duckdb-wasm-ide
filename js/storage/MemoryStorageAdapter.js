/**
 * MemoryStorageAdapter - In-memory implementation of StorageAdapter for testing
 */
import { StorageAdapter } from './StorageAdapter.js';

export class MemoryStorageAdapter extends StorageAdapter {
    constructor() {
        super();
        this.storage = new Map();
    }

    async setItem(key, value) {
        this.storage.set(key, value);
    }

    async getItem(key) {
        return this.storage.has(key) ? this.storage.get(key) : null;
    }

    async removeItem(key) {
        this.storage.delete(key);
    }

    async clear() {
        this.storage.clear();
    }

    async getLength() {
        return this.storage.size;
    }

    async getKeys() {
        return Array.from(this.storage.keys());
    }

    /**
     * Test helper: Get all stored items as an object
     * @returns {Object}
     */
    _getAll() {
        return Object.fromEntries(this.storage);
    }

    /**
     * Test helper: Check if a key exists
     * @param {string} key
     * @returns {boolean}
     */
    _has(key) {
        return this.storage.has(key);
    }
}
