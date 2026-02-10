/**
 * ExportService - Handles data export functionality
 * Separated from UI for testability
 */
import { formatAsCSV, formatAsJSON } from '../utils/formatters.js';

export class ExportService {
    constructor(dependencies = {}) {
        this.formatters = dependencies.formatters || {
            formatAsCSV,
            formatAsJSON
        };
    }

    /**
     * Export results as CSV
     * @param {Object} results - Query results
     * @returns {Object} Export data with content, filename, mimeType
     */
    exportToCSV(results) {
        if (!results || !results.rows) {
            throw new Error('No results to export');
        }

        const csv = this.formatters.formatAsCSV(results);

        return {
            content: csv,
            filename: this._generateFilename('csv'),
            mimeType: 'text/csv'
        };
    }

    /**
     * Export results as JSON
     * @param {Object} results - Query results
     * @returns {Object} Export data with content, filename, mimeType
     */
    exportToJSON(results) {
        if (!results || !results.rows) {
            throw new Error('No results to export');
        }

        const json = this.formatters.formatAsJSON(results);

        return {
            content: json,
            filename: this._generateFilename('json'),
            mimeType: 'application/json'
        };
    }

    /**
     * Export results as HTML
     * @param {Object} results - Query results
     * @returns {Object} Export data with content, filename, mimeType
     */
    exportToHTML(results) {
        if (!results || !results.rows) {
            throw new Error('No results to export');
        }

        const html = this._formatResultsAsHTML(results);

        return {
            content: html,
            filename: this._generateFilename('html'),
            mimeType: 'text/html'
        };
    }

    /**
     * Generate filename with timestamp
     * @private
     * @param {string} extension - File extension
     * @returns {string} Generated filename
     */
    _generateFilename(extension) {
        const timestamp = new Date().toISOString()
            .replace(/[:.]/g, '-')
            .replace(/T/, '_')
            .replace(/\.\d+Z$/, ''); // Remove milliseconds

        return `duckdb-results_${timestamp}.${extension}`;
    }

    /**
     * Format results as HTML table
     * @private
     * @param {Object} results - Query results
     * @returns {string} HTML table string
     */
    _formatResultsAsHTML(results) {
        let html = '<table>';

        // Header row
        html += '<thead><tr>';
        for (const column of results.columns) {
            html += `<th>${this._escapeHTML(column)}</th>`;
        }
        html += '</tr></thead>';

        // Body rows
        html += '<tbody>';
        for (const row of results.rows) {
            html += '<tr>';
            for (const column of results.columns) {
                const value = row[column];
                html += `<td>${this._formatValue(value)}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';

        return html;
    }

    /**
     * Format a value for HTML display
     * @private
     * @param {*} value - Value to format
     * @returns {string} Formatted value
     */
    _formatValue(value) {
        if (value === null || value === undefined) {
            return '<span class="null">NULL</span>';
        }

        if (typeof value === 'boolean') {
            return `<span class="boolean">${value}</span>`;
        }

        if (typeof value === 'number') {
            return `<span class="number">${value}</span>`;
        }

        return `<span>${this._escapeHTML(String(value))}</span>`;
    }

    /**
     * Escape HTML entities
     * @private
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Validate export data
     * @param {Object} exportData - Export data to validate
     * @returns {Object} Validation result
     */
    validateExportData(exportData) {
        const errors = [];

        if (!exportData) {
            return {
                valid: false,
                errors: ['No export data provided']
            };
        }

        if (!exportData.content) {
            errors.push('No content to export');
        }

        if (!exportData.filename) {
            errors.push('No filename specified');
        }

        if (!exportData.mimeType) {
            errors.push('No MIME type specified');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Create export summary
     * @param {Array} exports - Array of export data objects
     * @returns {Object} Export summary
     */
    createExportSummary(exports) {
        return {
            totalExports: exports.length,
            totalRows: exports.reduce((sum, exp) => {
                // Estimate row count from content
                const lines = exp.content.split('\n').length;
                return sum + (lines > 1 ? lines - 1 : 0); // Subtract header
            }, 0),
            formats: {},
            timestamp: new Date().toISOString()
        };
    }
}
