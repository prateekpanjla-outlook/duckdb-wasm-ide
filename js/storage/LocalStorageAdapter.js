/**
 * LocalStorageAdapter - Implementation of StorageAdapter using browser's localStorage
 */
import { StorageAdapter } from './StorageAdapter.js';

export class LocalStorageAdapter extends StorageAdapter {
    constructor() {
        super();
        this.storage = window.localStorage;
    }

    async setItem(key, value) {
        try {
            this.storage.setItem(key, value);
        } catch (error) {
            throw new Error(`Failed to set item "${key}": ${error.message}`);
        }
    }

    async getItem(key) {
        return this.storage.getItem(key);
    }

    async removeItem(key) {
        this.storage.removeItem(key);
    }

    async clear() {
        this.storage.clear();
    }

    async getLength() {
        return this.storage.length;
    }

    async getKeys() {
        return Object.keys(this.storage);
    }

    /**
     * Check if storage is available
     * @returns {boolean}
     */
    isAvailable() {
        try {
            const test = '__storage_test__';
            this.storage.setItem(test, test);
            this.storage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }
}
