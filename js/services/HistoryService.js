/**
 * HistoryService - Manages query history persistence
 * Separated from QueryEditor for testability
 */
import { StorageAdapter } from '../storage/StorageAdapter.js';

export class HistoryService {
    constructor(dependencies = {}) {
        this.storage = dependencies.storage || new StorageAdapter();
        this.maxHistorySize = dependencies.maxHistorySize || 50;
        this.storageKey = dependencies.storageKey || 'duckdb_query_history';
    }

    /**
     * Add a query to history
     * @param {string} query - The SQL query to add
     * @returns {Promise<void>}
     */
    async addToHistory(query) {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            return;
        }

        const history = await this.getHistory();

        // Don't add duplicates
        if (!history.includes(trimmedQuery)) {
            history.unshift(trimmedQuery);

            // Maintain max size
            if (history.length > this.maxHistorySize) {
                history.splice(this.maxHistorySize);
            }

            await this._saveHistory(history);
        }
    }

    /**
     * Get all query history
     * @returns {Promise<string[]>} Array of queries
     */
    async getHistory() {
        try {
            const stored = await this.storage.getItem(this.storageKey);
            if (!stored) {
                return [];
            }

            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error('Failed to parse history:', error);
            return [];
        }
    }

    /**
     * Clear all query history
     * @returns {Promise<void>}
     */
    async clearHistory() {
        await this._saveHistory([]);
    }

    /**
     * Search history by query text
     * @param {string} searchTerm - The search term
     * @returns {Promise<string[]>} Matching queries
     */
    async searchHistory(searchTerm) {
        const history = await this.getHistory();
        const lowerSearchTerm = searchTerm.toLowerCase();
        return history.filter(query =>
            query.toLowerCase().includes(lowerSearchTerm)
        );
    }

    /**
     * Get history statistics
     * @returns {Promise<Object>} Statistics about query history
     */
    async getStats() {
        const history = await this.getHistory();
        return {
            total: history.length,
            unique: new Set(history).size,
            oldest: history.length > 0 ? history[history.length - 1] : null,
            newest: history.length > 0 ? history[0] : null
        };
    }

    /**
     * Save history to storage
     * @private
     * @param {string[]} history - Array of queries
     * @returns {Promise<void>}
     */
    async _saveHistory(history) {
        try {
            await this.storage.setItem(this.storageKey, JSON.stringify(history));
        } catch (error) {
            console.error('Failed to save history:', error);
            throw new Error(`Failed to save history: ${error.message}`);
        }
    }

    /**
     * Remove a specific query from history
     * @param {string} query - The query to remove
     * @returns {Promise<boolean>} True if removed, false if not found
     */
    async removeFromHistory(query) {
        const history = await this.getHistory();
        const index = history.indexOf(query);

        if (index > -1) {
            history.splice(index, 1);
            await this._saveHistory(history);
            return true;
        }

        return false;
    }
}
