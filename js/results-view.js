// Results View - Displays query results with export functionality
export class ResultsView {
    constructor() {
        this.container = document.getElementById('resultsContainer');
        this.currentResults = null;
    }

    displayResults(result, executionTime) {
        this.currentResults = result;

        // Update row count
        document.getElementById('rowCount').textContent = `${result.rows.length} rows`;
        document.getElementById('queryTime').textContent = executionTime ? `(${executionTime}s)` : '';

        // Clear previous results
        this.container.innerHTML = '';

        if (!result.columns || result.columns.length === 0) {
            this.showNoResults();
            return;
        }

        if (result.rows.length === 0) {
            this.showEmptyResult();
            return;
        }

        // Create results table
        const table = this.createResultsTable(result);
        this.container.appendChild(table);
    }

    createResultsTable(result) {
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');

        // Create header row
        const headerRow = document.createElement('tr');
        result.columns.forEach(column => {
            const th = document.createElement('th');
            th.textContent = column;
            th.addEventListener('click', () => this.sortColumn(column, th));
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create data rows (limit to 1000 rows for performance)
        const maxRows = Math.min(result.rows.length, 1000);
        for (let i = 0; i < maxRows; i++) {
            const row = result.rows[i];
            const tr = document.createElement('tr');
            result.columns.forEach(column => {
                const td = document.createElement('td');
                const value = row[column];
                td.textContent = this.formatValue(value);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);

        // Add note if truncated
        if (result.rows.length > 1000) {
            const note = document.createElement('div');
            note.className = 'results-note';
            note.style.cssText = `
                padding: 0.5rem;
                background: #fff3cd;
                color: #856404;
                text-align: center;
                font-size: 0.875rem;
            `;
            note.textContent = `Showing first 1,000 of ${result.rows.length} rows. Export to see all results.`;
            this.container.appendChild(note);
        }

        return table;
    }

    formatValue(value) {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }

    showNoResults() {
        this.container.innerHTML = `
            <div class="results-placeholder">
                <p>No results returned</p>
            </div>
        `;
    }

    showEmptyResult() {
        this.container.innerHTML = `
            <div class="results-placeholder">
                <p>Query executed successfully</p>
                <p class="hint">No rows returned</p>
            </div>
        `;
    }

    displayError(errorMessage) {
        this.container.innerHTML = `
            <div class="error-message">
                <strong>Error:</strong>
                <pre>${this.escapeHtml(errorMessage)}</pre>
            </div>
        `;
        document.getElementById('rowCount').textContent = 'Error';
        document.getElementById('queryTime').textContent = '';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    sortColumn(column, headerElement) {
        if (!this.currentResults || this.currentResults.rows.length === 0) {
            return;
        }

        // Determine sort direction
        const currentSort = headerElement.classList.contains('sort-asc') ? 'asc' :
                          headerElement.classList.contains('sort-desc') ? 'desc' : null;

        // Remove sort classes from all headers
        document.querySelectorAll('table th').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });

        let direction = 'asc';
        if (currentSort === 'asc') {
            direction = 'desc';
            headerElement.classList.add('sort-desc');
        } else {
            headerElement.classList.add('sort-asc');
        }

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
        this.displayResults(this.currentResults, '');
    }

    exportResults() {
        if (!this.currentResults || this.currentResults.rows.length === 0) {
            alert('No results to export');
            return;
        }

        // Ask user for format
        const format = prompt('Export format:\n1. CSV\n2. JSON\n\nEnter 1 or 2:', '1');

        if (format === '1') {
            this.exportCSV();
        } else if (format === '2') {
            this.exportJSON();
        }
    }

    exportCSV() {
        const result = this.currentResults;

        // Create CSV content
        const headers = result.columns.join(',');
        const rows = result.rows.map(row => {
            return result.columns.map(col => {
                const val = row[col];
                if (val === null || val === undefined) return '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return String(val);
            }).join(',');
        });

        const csv = [headers, ...rows].join('\n');

        this.downloadFile(csv, 'duckdb-results.csv', 'text/csv');
    }

    exportJSON() {
        const result = this.currentResults;
        const json = JSON.stringify(result.rows, null, 2);

        this.downloadFile(json, 'duckdb-results.json', 'application/json');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    }
}
