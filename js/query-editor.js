// Query Editor - Manages SQL editor with syntax highlighting and history
export class QueryEditor {
    constructor() {
        this.editor = null;
        this.history = this.loadHistory();
        this.initEditor();
        this.populateHistorySelect();
    }

    initEditor() {
        // Initialize CodeMirror
        this.editor = CodeMirror(document.getElementById('queryEditor'), {
            mode: 'text/x-sql',
            theme: 'dracula',
            lineNumbers: true,
            autoCloseBrackets: true,
            matchBrackets: true,
            indentWithTabs: true,
            smartIndent: true,
            lineWrapping: true,
            extraKeys: {
                'Ctrl-Enter': () => this.executeQuery(),
                'Ctrl-Space': 'autocomplete'
            },
            hintOptions: {
                tables: this.getTableList(),
                completeSingle: false
            }
        });

        // Set initial query
        this.editor.setValue('-- Load a file first, then query your data\n-- Example queries:\n-- SELECT * FROM your_table LIMIT 10;\n-- SELECT COUNT(*) FROM your_table;\n-- SELECT column1, COUNT(*) FROM your_table GROUP BY column1;');
    }

    executeQuery() {
        // This is called by CodeMirror's extraKeys
        // Trigger the run query button click
        document.getElementById('runQueryBtn').click();
    }

    getQuery() {
        return this.editor.getValue();
    }

    setQuery(query) {
        this.editor.setValue(query);
    }

    addToHistory(query) {
        // Add to history if not duplicate
        const trimmedQuery = query.trim();
        if (trimmedQuery && !this.history.includes(trimmedQuery)) {
            this.history.unshift(trimmedQuery);
            // Keep only last 50 queries
            if (this.history.length > 50) {
                this.history = this.history.slice(0, 50);
            }
            this.saveHistory();
            this.populateHistorySelect();
        }
    }

    loadHistory() {
        try {
            const stored = localStorage.getItem('duckdb_query_history');
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    saveHistory() {
        try {
            localStorage.setItem('duckdb_query_history', JSON.stringify(this.history));
        } catch (error) {
            console.warn('Failed to save query history:', error);
        }
    }

    clearHistory() {
        if (confirm('Are you sure you want to clear all query history?')) {
            this.history = [];
            this.saveHistory();
            this.populateHistorySelect();
        }
    }

    populateHistorySelect() {
        const select = document.getElementById('historySelect');
        select.innerHTML = '<option value="">Query History...</option>';

        this.history.forEach((query, index) => {
            const option = document.createElement('option');
            option.value = query;
            // Truncate long queries for display
            const displayText = query.length > 50 ? query.substring(0, 50) + '...' : query;
            option.textContent = `${index + 1}. ${displayText}`;
            select.appendChild(option);
        });

        // Add event listener to load selected query
        select.removeEventListener('change', this.handleHistoryChange);
        select.addEventListener('change', this.handleHistoryChange.bind(this));
    }

    handleHistoryChange(e) {
        const query = e.target.value;
        if (query) {
            this.setQuery(query);
            e.target.value = ''; // Reset select
        }
    }

    getTableList() {
        // Return common SQL keywords and functions for autocomplete
        return {
            keywords: [
                'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
                'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AND', 'OR', 'NOT',
                'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'AS', 'DISTINCT', 'CASE', 'WHEN',
                'THEN', 'ELSE', 'END', 'UNION', 'INTERSECT', 'EXCEPT', 'INSERT',
                'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INDEX', 'VIEW',
                'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'DEFAULT'
            ],
            functions: [
                'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ABS', 'ROUND', 'CEIL', 'FLOOR',
                'COALESCE', 'NULLIF', 'CAST', 'CONVERT', 'UPPER', 'LOWER', 'TRIM',
                'SUBSTRING', 'CONCAT', 'LENGTH', 'POSITION', 'REPLACE', 'NOW', 'DATE',
                'EXTRACT', 'DATE_PART', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE',
                'SECOND', 'ARRAY_AGG', 'LIST', 'STRING_AGG', 'GROUP_CONCAT'
            ]
        };
    }

    focus() {
        this.editor.focus();
    }
}
