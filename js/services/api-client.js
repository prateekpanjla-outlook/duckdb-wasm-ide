/**
 * API Client for Backend Communication
 * Handles all HTTP requests to the backend server
 */

import { API_BASE_URL } from '../config.js';

class APIClient {
    constructor() {
        this.token = this._safeGetItem('auth_token');
        this.user = this._safeParseJSON(this._safeGetItem('user_data'));
    }

    /**
     * Safely get item from localStorage (handles private browsing / quota errors)
     */
    _safeGetItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn('localStorage not available:', e.message);
            return null;
        }
    }

    /**
     * Safely set item in localStorage
     */
    _safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn('localStorage write failed:', e.message);
        }
    }

    /**
     * Safely remove item from localStorage
     */
    _safeRemoveItem(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.warn('localStorage remove failed:', e.message);
        }
    }

    /**
     * Safely parse JSON, returning null on failure
     */
    _safeParseJSON(str) {
        if (!str) return null;
        try {
            return JSON.parse(str);
        } catch (e) {
            return null;
        }
    }

    /**
     * Set authentication token
     */
    setToken(token) {
        this.token = token;
        if (token) {
            this._safeSetItem('auth_token', token);
        } else {
            this._safeRemoveItem('auth_token');
        }
    }

    /**
     * Set user data
     */
    setUser(user) {
        this.user = user;
        if (user) {
            this._safeSetItem('user_data', JSON.stringify(user));
        } else {
            this._safeRemoveItem('user_data');
        }
    }

    /**
     * Get authorization headers
     */
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    /**
     * Make HTTP request
     */
    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, config);
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                throw new Error(`Server returned invalid JSON (HTTP ${response.status})`);
            }

            if (!response.ok) {
                throw new Error(data.error || `Request failed (HTTP ${response.status})`);
            }

            return data;
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error.message);
            throw error;
        }
    }

    // ==================== Auth Endpoints ====================

    /**
     * Register new user
     */
    async register(email, password) {
        const data = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (!data.token || !data.user) {
            throw new Error('Invalid response from server: missing token or user data');
        }

        this.setToken(data.token);
        this.setUser(data.user);

        return data;
    }

    /**
     * Login user
     */
    async login(email, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (!data.token || !data.user) {
            throw new Error('Invalid response from server: missing token or user data');
        }

        this.setToken(data.token);
        this.setUser(data.user);

        return data;
    }

    /**
     * Logout user
     */
    async logout() {
        try {
            await this.request('/auth/logout', { method: 'POST' });
        } finally {
            this.setToken(null);
            this.setUser(null);
        }
    }

    /**
     * Get current user
     */
    async getCurrentUser() {
        const data = await this.request('/auth/me');
        this.setUser(data.user);
        return data.user;
    }

    // ==================== Practice Endpoints ====================

    /**
     * Start practice mode - get first question
     */
    async startPractice() {
        return await this.request('/practice/start');
    }

    /**
     * Get next question
     */
    async getNextQuestion() {
        return await this.request('/practice/next');
    }

    /**
     * Get specific question by ID
     */
    async getQuestion(id) {
        return await this.request(`/practice/question/${id}`);
    }

    /**
     * Verify solution submission
     */
    async verifySolution(questionId, userQuery, userResults, isCorrect, timeTakenSeconds) {
        return await this.request('/practice/verify', {
            method: 'POST',
            body: JSON.stringify({
                questionId,
                userQuery,
                userResults,
                isCorrect,
                timeTakenSeconds
            }, (key, value) => {
                // Convert BigInt to string
                if (typeof value === 'bigint') {
                    return value.toString();
                }
                return value;
            })
        });
    }

    /**
     * Get user progress
     */
    async getProgress() {
        return await this.request('/practice/progress');
    }

    /**
     * Get session state
     */
    async getSession() {
        return await this.request('/practice/session');
    }

    /**
     * Activate practice mode
     */
    async activatePracticeMode() {
        return await this.request('/practice/session/activate', {
            method: 'POST'
        });
    }

    /**
     * Deactivate practice mode
     */
    async deactivatePracticeMode() {
        return await this.request('/practice/session/deactivate', {
            method: 'POST'
        });
    }

    /**
     * Get all questions list
     */
    async getQuestions(filters = {}) {
        const params = new URLSearchParams(filters);
        return await this.request(`/practice/questions?${params}`);
    }

    // ==================== Utility Methods ====================

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.token;
    }

    /**
     * Get stored user
     */
    getUser() {
        return this.user;
    }

    /**
     * Clear all stored data
     */
    clearAll() {
        this.setToken(null);
        this.setUser(null);
    }
}

// Export singleton instance
export const apiClient = new APIClient();
