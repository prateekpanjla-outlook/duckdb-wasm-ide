/**
 * StorageAdapter - Abstract interface for storage operations
 * This allows swapping implementations (localStorage, memory, etc.) for testing
 */
export class StorageAdapter {
    /**
     * Store a value in storage
     * @param {string} key - The key to store the value under
     * @param {string} value - The value to store
     * @returns {Promise<void>}
     */
    async setItem(key, value) {
        throw new Error('setItem() must be implemented by subclass');
    }

    /**
     * Retrieve a value from storage
     * @param {string} key - The key to retrieve
     * @returns {Promise<string|null>} The stored value or null if not found
     */
    async getItem(key) {
        throw new Error('getItem() must be implemented by subclass');
    }

    /**
     * Remove a value from storage
     * @param {string} key - The key to remove
     * @returns {Promise<void>}
     */
    async removeItem(key) {
        throw new Error('removeItem() must be implemented by subclass');
    }

    /**
     * Clear all values from storage
     * @returns {Promise<void>}
     */
    async clear() {
        throw new Error('clear() must be implemented by subclass');
    }

    /**
     * Get the number of items in storage
     * @returns {Promise<number>}
     */
    async getLength() {
        throw new Error('getLength() must be implemented by subclass');
    }

    /**
     * Get all keys in storage
     * @returns {Promise<string[]>}
     */
    async getKeys() {
        throw new Error('getKeys() must be implemented by subclass');
    }
}
