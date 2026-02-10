/**
 * ToastManager - Manages toast notifications
 * Separated from business logic for testability
 */
export class ToastManager {
    constructor(dependencies = {}) {
        this.domAdapter = dependencies.domAdapter || null;
        this.containerId = dependencies.containerId || 'toastContainer';
        this.defaultDuration = dependencies.defaultDuration || 5000;
        this.toasts = [];
    }

    /**
     * Initialize the toast container
     */
    initialize() {
        if (!this.domAdapter) {
            console.warn('ToastManager: No DOM adapter provided');
            return;
        }

        // Create toast container if it doesn't exist
        let container = this.domAdapter.getElementById(this.containerId);

        if (!container) {
            container = this.domAdapter.createElement('div', {
                id: this.containerId,
                className: 'toast-container'
            });

            // Add container to body
            const body = this.domAdapter.querySelector('body');
            if (body) {
                body.appendChild(container);
            }
        }

        return container;
    }

    /**
     * Show a success toast
     * @param {string} message - The message to display
     * @param {number} duration - Duration in milliseconds
     */
    showSuccess(message, duration = this.defaultDuration) {
        return this.show(message, 'success', duration);
    }

    /**
     * Show an error toast
     * @param {string} message - The message to display
     * @param {number} duration - Duration in milliseconds
     */
    showError(message, duration = this.defaultDuration) {
        return this.show(message, 'error', duration);
    }

    /**
     * Show a warning toast
     * @param {string} message - The message to display
     * @param {number} duration - Duration in milliseconds
     */
    showWarning(message, duration = this.defaultDuration) {
        return this.show(message, 'warning', duration);
    }

    /**
     * Show an info toast
     * @param {string} message - The message to display
     * @param {number} duration - Duration in milliseconds
     */
    showInfo(message, duration = this.defaultDuration) {
        return this.show(message, 'info', duration);
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - The toast type (success, error, warning, info)
     * @param {number} duration - Duration in milliseconds
     * @returns {Object} Toast control object
     */
    show(message, type = 'info', duration = this.defaultDuration) {
        if (!this.domAdapter) {
            console.log(`[${type.toUpperCase()}]`, message);
            return { id: Date.now(), close: () => {} };
        }

        const container = this.initialize();
        if (!container) {
            return { id: Date.now(), close: () => {} };
        }

        const toastId = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const toast = this._createToastElement(toastId, message, type);

        container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            this.domAdapter.addClass(toastId, 'show');
        });

        const toastControl = {
            id: toastId,
            close: () => this._removeToast(toastId)
        };

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                toastControl.close();
            }, duration);
        }

        return toastControl;
    }

    /**
     * Create a toast element
     * @private
     * @param {string} id - Toast ID
     * @param {string} message - Message text
     * @param {string} type - Toast type
     * @returns {HTMLElement} Toast element
     */
    _createToastElement(id, message, type) {
        const toast = this.domAdapter.createElement('div', {
            id: id,
            className: 'toast'
        });

        // Add type class
        this.domAdapter.addClass(id, type);

        // Set content
        toast.innerHTML = `
            <div class="toast-icon">${this._getIcon(type)}</div>
            <div class="toast-message">${this._escapeHtml(message)}</div>
            <button class="toast-close" onclick="document.getElementById('${id}').remove()">✕</button>
        `;

        return toast;
    }

    /**
     * Remove a toast
     * @private
     * @param {string} toastId - Toast ID
     */
    _removeToast(toastId) {
        if (!this.domAdapter) {
            return;
        }

        const toast = this.domAdapter.getElementById(toastId);
        if (toast) {
            this.domAdapter.removeClass(toastId, 'show');
            this.domAdapter.addClass(toastId, 'hide');

            // Remove from DOM after animation
            setTimeout(() => {
                const element = this.domAdapter.getElementById(toastId);
                if (element) {
                    element.remove();
                }
            }, 300);
        }
    }

    /**
     * Get icon for toast type
     * @private
     * @param {string} type - Toast type
     * @returns {string} Icon HTML
     */
    _getIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    /**
     * Escape HTML to prevent XSS
     * @private
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Clear all toasts
     */
    clearAll() {
        if (!this.domAdapter) {
            return;
        }

        const container = this.domAdapter.getElementById(this.containerId);
        if (container) {
            container.innerHTML = '';
        }
        this.toasts = [];
    }
}
