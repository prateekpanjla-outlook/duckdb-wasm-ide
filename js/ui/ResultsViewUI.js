/**
 * ResultsViewUI - UI wrapper for results display
 * Separated from ExportService for testability
 */
import { ExportService } from '../services/ExportService.js';

export class ResultsViewUI {
    constructor(dependencies = {}) {
        this.exportService = dependencies.exportService || new ExportService({});
        this.toastManager = dependencies.toastManager || null;
        this.domAdapter = dependencies.domAdapter || null;
        this.containerId = dependencies.containerId || 'resultsContainer';
        this.rowCountId = dependencies.rowCountId || 'rowCount';
        this.queryTimeId = dependencies.queryTimeId || 'queryTime';
        this.exportButtonId = dependencies.exportButtonId || 'exportResultsBtn';

        this.currentResults = null;
        this.currentExecutionTime = null;
    }

    /**
     * Initialize the results view UI
     */
    initialize() {
        if (!this.domAdapter) {
            console.warn('ResultsViewUI: No DOM adapter provided');
            return;
        }

        this._setupExportButton();
    }

    /**
     * Display query results
     * @param {Object} results - Query results
     * @param {string} executionTime - Query execution time
     */
    displayResults(results, executionTime = '') {
        this.currentResults = results;
        this.currentExecutionTime = executionTime;

        if (!this.domAdapter) {
            return;
        }

        const container = this.domAdapter.getElementById(this.containerId);
        if (!container) {
            return;
        }

        // Update row count and execution time
        this._updateMetadata(results, executionTime);

        // Check if we have results
        if (!results.columns || results.columns.length === 0) {
            this._showNoResults();
            return;
        }

        if (!results.rows || results.rows.length === 0) {
            this._showEmptyResult();
            return;
        }

        // Create and display results table
        const tableHTML = this._buildResultsTable(results);
        this.domAdapter.setHTML(container, tableHTML);

        // Setup sorting on table headers
        this._setupSorting();
    }

    /**
     * Display an error message
     * @param {string} errorMessage - The error message
     */
    displayError(errorMessage) {
        if (!this.domAdapter) {
            console.error('ResultsViewUI Error:', errorMessage);
            return;
        }

        const container = this.domAdapter.getElementById(this.containerId);
        if (!container) {
            return;
        }

        this.domAdapter.setHTML(container, `
            <div class="error-message">
                <strong>Error:</strong>
                <pre>${this._escapeHtml(errorMessage)}</pre>
            </div>
        `);

        this.domAdapter.setText(this.rowCountId, 'Error');
        this.domAdapter.setText(this.queryTimeId, '');
    }

    /**
     * Export results
     * @param {string} format - Export format ('CSV' or 'JSON')
     */
    async exportResults(format = 'CSV') {
        if (!this.currentResults || !this.currentResults.rows || this.currentResults.rows.length === 0) {
            if (this.toastManager) {
                this.toastManager.showWarning('No results to export');
            }
            return;
        }

        try {
            const exportData = await this.exportService[`exportTo${format}`](this.currentResults);
            this._triggerDownload(exportData);

            if (this.toastManager) {
                this.toastManager.showSuccess(`Results exported as ${format}`);
            }
        } catch (error) {
            if (this.toastManager) {
                this.toastManager.showError(`Export failed: ${error.message}`);
            }
        }
    }

    /**
     * Build results table HTML
     * @private
     * @param {Object} results - Query results
     * @returns {string} HTML table string
     */
    _buildResultsTable(results) {
        let html = '<table>';

        // Header row
        html += '<thead><tr>';
        for (const column of results.columns) {
            html += `<th data-column="${column}">${this._escapeHtml(column)}</th>`;
        }
        html += '</tr></thead>';

        // Body rows (limit to 1000 for performance)
        const maxRows = Math.min(results.rows.length, 1000);
        for (let i = 0; i < maxRows; i++) {
            const row = results.rows[i];
            html += '<tr>';
            for (const column of results.columns) {
                const value = row[column];
                html += `<td>${this._formatValue(value)}</td>`;
            }
            html += '</tr>';
        }

        html += '</table>';

        // Add note if truncated
        if (results.rows.length > 1000) {
            html += `
                <div class="results-note">
                    Showing first 1,000 of ${results.rows.length} rows. Export to see all results.
                </div>
            `;
        }

        return html;
    }

    /**
     * Format a value for display
     * @private
     * @param {*} value - The value to format
     * @returns {string} Formatted value
     */
    _formatValue(value) {
        if (value === null || value === undefined) {
            return '<span class="null-value">NULL</span>';
        }

        if (typeof value === 'object') {
            return `<span class="object-value">${this._escapeHtml(JSON.stringify(value))}</span>`;
        }

        if (typeof value === 'number') {
            return `<span class="number-value">${this._escapeHtml(String(value))}</span>`;
        }

        return `<span>${this._escapeHtml(String(value))}</span>`;
    }

    /**
     * Setup sorting on table headers
     * @private
     */
    _setupSorting() {
        if (!this.domAdapter) {
            return;
        }

        const container = this.domAdapter.getElementById(this.containerId);
        if (!container) {
            return;
        }

        const headers = container.querySelectorAll('th[data-column]');
        headers.forEach(th => {
            this.domAdapter.on(th, 'click', () => {
                const column = th.getAttribute('data-column');
                this.sortColumn(column);
            });
        });
    }

    /**
     * Sort results by column
     * @param {string} column - Column name to sort by
     */
    sortColumn(column) {
        if (!this.currentResults || !this.currentResults.rows.length) {
            return;
        }

        // Determine sort direction
        const currentSort = this._currentSortColumn();
        const direction = (currentSort === column && this._currentSortDirection() === 'asc') ? 'desc' : 'asc';

        // Update header classes
        this._updateSortIndicators(column, direction);

        // Sort the rows
        this.currentResults.rows.sort((a, b) => {
            const aVal = a[column];
            const bVal = b[column];

            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();

            if (direction === 'asc') {
                return aStr.localeCompare(bStr);
            } else {
                return bStr.localeCompare(aStr);
            }
        });

        // Re-display with sorted data
        this.displayResults(this.currentResults, this.currentExecutionTime);
    }

    /**
     * Get current sort column
     * @private
     */
    _currentSortColumn() {
        const th = this.domAdapter.querySelector(`th.sort-asc, th.sort-desc`);
        return th ? th.getAttribute('data-column') : null;
    }

    /**
     * Get current sort direction
     * @private
     */
    _currentSortDirection() {
        const th = this.domAdapter.querySelector(`th.sort-asc`);
        return th ? 'asc' : 'desc';
    }

    /**
     * Update sort indicators on headers
     * @private
     * @param {string} column - Column being sorted
     * @param {string} direction - Sort direction
     */
    _updateSortIndicators(column, direction) {
        if (!this.domAdapter) {
            return;
        }

        // Remove all sort classes
        this.domAdapter.querySelectorAll('th').forEach(th => {
            this.domAdapter.removeClass(th, 'sort-asc');
            this.domAdapter.removeClass(th, 'sort-desc');
        });

        // Add sort class to clicked header
        const headers = this.domAdapter.querySelectorAll(`th[data-column="${column}"]`);
        headers.forEach(th => {
            this.domAdapter.addClass(th, `sort-${direction}`);
        });
    }

    /**
     * Update metadata (row count, execution time)
     * @private
     */
    _updateMetadata(results, executionTime) {
        if (!this.domAdapter) {
            return;
        }

        const rowCount = results.rows ? results.rows.length : 0;
        this.domAdapter.setText(this.rowCountId, `${rowCount} rows`);

        if (executionTime) {
            this.domAdapter.setText(this.queryTimeId, `(${executionTime}s)`);
        }
    }

    /**
     * Show "no results" message
     * @private
     */
    _showNoResults() {
        if (!this.domAdapter) {
            return;
        }

        const container = this.domAdapter.getElementById(this.containerId);
        this.domAdapter.setHTML(container, `
            <div class="results-placeholder">
                <p>No results returned</p>
            </div>
        `);
    }

    /**
     * Show "empty result" message
     * @private
     */
    _showEmptyResult() {
        if (!this.domAdapter) {
            return;
        }

        const container = this.domAdapter.getElementById(this.containerId);
        this.domAdapter.setHTML(container, `
            <div class="results-placeholder">
                <p>Query executed successfully</p>
                <p class="hint">No rows returned</p>
            </div>
        `);
    }

    /**
     * Trigger file download
     * @private
     * @param {Object} exportData - Export data with content, filename, mimeType
     */
    _triggerDownload(exportData) {
        const blob = new Blob([exportData.content], { type: exportData.mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = exportData.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
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
     * Setup export button
     * @private
     */
    _setupExportButton() {
        if (!this.domAdapter) {
            return;
        }

        const exportButton = this.domAdapter.getElementById(this.exportButtonId);
        if (exportButton) {
            this.domAdapter.on(exportButton, 'click', () => {
                this._promptExportFormat();
            });
        }
    }

    /**
     * Prompt user for export format
     * @private
     */
    _promptExportFormat() {
        const format = prompt('Export format:\n1. CSV\n2. JSON\n\nEnter 1 or 2:', '1');

        if (format === '1') {
            this.exportResults('CSV');
        } else if (format === '2') {
            this.exportResults('JSON');
        }
    }

    /**
     * Get current results
     * @returns {Object|null} Current results
     */
    getCurrentResults() {
        return this.currentResults;
    }

    /**
     * Clear results display
     */
    clearResults() {
        this.currentResults = null;
        this.currentExecutionTime = null;

        if (this.domAdapter) {
            this._showNoResults();
            this.domAdapter.setText(this.rowCountId, '0 rows');
            this.domAdapter.setText(this.queryTimeId, '');
        }
    }
}
