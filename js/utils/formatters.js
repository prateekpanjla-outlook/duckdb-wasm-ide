/**
 * Formatters - Data formatting utilities
 */

/**
 * Format file size in human-readable format
 * @param {number} bytes - The file size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
    if (bytes === 0) {
        return '0 Bytes';
    }

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format a number with thousand separators
 * @param {number} num - The number to format
 * @returns {string} Formatted number
 */
export function formatNumber(num) {
    if (num === null || num === undefined) {
        return '';
    }

    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format a date to ISO string
 * @param {Date|string|number} date - The date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
    if (!date) {
        return '';
    }

    const d = date instanceof Date ? date : new Date(date);

    if (isNaN(d.getTime())) {
        return '';
    }

    return d.toISOString();
}

/**
 * Format a date to readable string
 * @param {Date|string|number} date - The date to format
 * @returns {string} Formatted date string
 */
export function formatDateReadable(date) {
    if (!date) {
        return '';
    }

    const d = date instanceof Date ? date : new Date(date);

    if (isNaN(d.getTime())) {
        return '';
    }

    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format execution time
 * @param {number} milliseconds - The time in milliseconds
 * @returns {string} Formatted time string
 */
export function formatExecutionTime(milliseconds) {
    if (milliseconds < 1000) {
        return `${milliseconds.toFixed(0)}ms`;
    } else if (milliseconds < 60000) {
        const seconds = (milliseconds / 1000).toFixed(2);
        return `${seconds}s`;
    } else {
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = ((milliseconds % 60000) / 1000).toFixed(0);
        return `${minutes}m ${seconds}s`;
    }
}

/**
 * Format a value for display in results table
 * @param {*} value - The value to format
 * @returns {string} Formatted value
 */
export function formatValue(value) {
    // Handle null/undefined
    if (value === null || value === undefined) {
        return 'NULL';
    }

    // Handle objects (including dates)
    if (typeof value === 'object') {
        if (value instanceof Date) {
            return formatDateReadable(value);
        }
        return JSON.stringify(value);
    }

    // Handle booleans
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    // Handle numbers
    if (typeof value === 'number') {
        // Format large numbers with separators
        if (Math.abs(value) >= 1000) {
            return formatNumber(value);
        }
        return String(value);
    }

    // Handle strings
    return String(value);
}

/**
 * Format query results as CSV
 * @param {Object} results - The query results
 * @returns {string} CSV formatted string
 */
export function formatAsCSV(results) {
    if (!results || !results.columns || !results.rows) {
        return '';
    }

    const lines = [];

    // Header row
    lines.push(results.columns.map(escapeCSV).join(','));

    // Data rows
    for (const row of results.rows) {
        const values = results.columns.map(col => {
            const value = row[col];
            const formatted = formatValue(value);
            return escapeCSV(formatted === 'NULL' ? '' : formatted);
        });
        lines.push(values.join(','));
    }

    return lines.join('\n');
}

/**
 * Escape a value for CSV
 * @param {string} value - The value to escape
 * @returns {string} Escaped value
 */
function escapeCSV(value) {
    if (typeof value !== 'string') {
        value = String(value);
    }

    // If value contains comma, quote, or newline, wrap in quotes and escape quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
}

/**
 * Format query results as JSON
 * @param {Object} results - The query results
 * @returns {string} JSON formatted string
 */
export function formatAsJSON(results) {
    if (!results || !results.rows) {
        return '[]';
    }

    return JSON.stringify(results.rows, null, 2);
}

/**
 * Format query results as HTML table
 * @param {Object} results - The query results
 * @returns {string} HTML table string
 */
export function formatAsHTMLTable(results) {
    if (!results || !results.columns || !results.rows) {
        return '<p>No results to display</p>';
    }

    let html = '<table>';

    // Header row
    html += '<thead><tr>';
    for (const col of results.columns) {
        html += `<th>${escapeHTML(col)}</th>`;
    }
    html += '</tr></thead>';

    // Body rows
    html += '<tbody>';
    for (const row of results.rows) {
        html += '<tr>';
        for (const col of results.columns) {
            const value = formatValue(row[col]);
            html += `<td>${escapeHTML(value)}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';

    return html;
}

/**
 * Escape HTML entities
 * @param {string} str - The string to escape
 * @returns {string} Escaped string
 */
function escapeHTML(str) {
    if (typeof str !== 'string') {
        str = String(str);
    }

    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Generate a table name from a filename
 * @param {string} filename - The filename
 * @returns {string} Generated table name
 */
export function generateTableName(filename) {
    if (!filename) {
        return 'table_' + Date.now();
    }

    // Remove extension
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Replace invalid characters with underscores
    let tableName = nameWithoutExt.replace(/[^a-zA-Z0-9_]/g, '_');

    // Convert to lowercase
    tableName = tableName.toLowerCase();

    // Ensure it starts with a letter or underscore
    if (/^[0-9]/.test(tableName)) {
        tableName = 'table_' + tableName;
    }

    // Ensure it's not empty
    if (!tableName) {
        tableName = 'table_' + Date.now();
    }

    // Limit length
    if (tableName.length > 64) {
        tableName = tableName.substring(0, 64);
    }

    return tableName;
}

/**
 * Truncate text to a maximum length
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 50) {
    if (!text || text.length <= maxLength) {
        return text || '';
    }

    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format a list of items as a comma-separated string
 * @param {Array} items - The items to format
 * @param {number} maxItems - Maximum items to display
 * @returns {string} Formatted string
 */
export function formatList(items, maxItems = 5) {
    if (!items || items.length === 0) {
        return '';
    }

    if (items.length <= maxItems) {
        return items.join(', ');
    }

    const displayed = items.slice(0, maxItems);
    const remaining = items.length - maxItems;

    return `${displayed.join(', ')} and ${remaining} more...`;
}

/**
 * Format percentage
 * @param {number} value - The value
 * @param {number} total - The total
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage
 */
export function formatPercentage(value, total, decimals = 1) {
    if (total === 0) {
        return '0%';
    }

    const percentage = (value / total) * 100;
    return percentage.toFixed(decimals) + '%';
}
