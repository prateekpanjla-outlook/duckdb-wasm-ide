/**
 * QueryEditorUI - UI wrapper for SQL query editor
 * Separated from HistoryService for testability
 */
export class QueryEditorUI {
    constructor(dependencies = {}) {
        this.historyService = dependencies.historyService || null;
        this.toastManager = dependencies.toastManager || null;
        this.domAdapter = dependencies.domAdapter || null;
        this.codeMirror = dependencies.codeMirror || null;
        this.editorElementId = dependencies.editorElementId || 'queryEditor';
        this.historySelectId = dependencies.historySelectId || 'historySelect';
        this.runButtonId = dependencies.runButtonId || 'runQueryBtn';
        this.clearHistoryButtonId = dependencies.clearHistoryButtonId || 'clearHistoryBtn';

        this.currentQuery = '';
    }

    /**
     * Initialize the query editor UI
     */
    initialize() {
        if (!this.domAdapter) {
            console.warn('QueryEditorUI: No DOM adapter provided');
            return;
        }

        this._setupCodeMirror();
        this._setupRunButton();
        this._setupHistorySelect();
        this._setupClearHistoryButton();
        this._setupKeyboardShortcuts();

        // Load initial history
        this._loadInitialHistory();
    }

    /**
     * Setup CodeMirror editor
     * @private
     */
    _setupCodeMirror() {
        if (!this.codeMirror) {
            console.warn('QueryEditorUI: No CodeMirror instance provided');
            return;
        }

        this.codeMirror.setValue('-- Load a file first, then query your data\n-- Example queries:\n-- SELECT * FROM your_table LIMIT 10;\n-- SELECT COUNT(*) FROM your_table;');
    }

    /**
     * Setup run button
     * @private
     */
    _setupRunButton() {
        const runButton = this.domAdapter.getElementById(this.runButtonId);
        if (runButton) {
            this.domAdapter.on(runButton, 'click', () => {
                this.executeQuery();
            });
        }
    }

    /**
     * Setup history dropdown
     * @private
     */
    _setupHistorySelect() {
        const historySelect = this.domAdapter.getElementById(this.historySelectId);
        if (historySelect) {
            this.domAdapter.on(historySelect, 'change', async (e) => {
                const query = e.target.value;
                if (query) {
                    this.setQuery(query);
                    e.target.value = ''; // Reset select
                }
            });
        }
    }

    /**
     * Setup clear history button
     * @private
     */
    _setupClearHistoryButton() {
        const clearButton = this.domAdapter.getElementById(this.clearHistoryButtonId);
        if (clearButton) {
            this.domAdapter.on(clearButton, 'click', () => {
                this.clearHistory();
            });
        }
    }

    /**
     * Setup keyboard shortcuts
     * @private
     */
    _setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.executeQuery();
            }
        });
    }

    /**
     * Get the current query
     * @returns {string} Current query text
     */
    getQuery() {
        if (this.codeMirror) {
            return this.codeMirror.getValue();
        }
        return this.currentQuery;
    }

    /**
     * Set a query in the editor
     * @param {string} query - The query to set
     */
    setQuery(query) {
        this.currentQuery = query;

        if (this.codeMirror) {
            this.codeMirror.setValue(query);
        }

        // Update DOM directly if CodeMirror not available
        const editorElement = this.domAdapter ?
            this.domAdapter.getElementById(this.editorElementId) : null;
        if (editorElement && !this.codeMirror) {
            editorElement.value = query;
        }
    }

    /**
     * Execute the current query
     * Triggered by button click or Ctrl+Enter
     */
    async executeQuery() {
        const query = this.getQuery();

        if (!query.trim()) {
            if (this.toastManager) {
                this.toastManager.showWarning('Please enter a SQL query');
            }
            return;
        }

        // This is handled by the parent App class
        // The UI component just provides the query
        if (this.onQueryExecute) {
            await this.onQueryExecute(query);
        }
    }

    /**
     * Add query to history
     * @param {string} query - The query to add
     */
    async addToHistory(query) {
        if (!this.historyService) {
            return;
        }

        await this.historyService.addToHistory(query);
        await this._refreshHistoryDropdown();
    }

    /**
     * Load initial history into dropdown
     * @private
     */
    async _loadInitialHistory() {
        await this._refreshHistoryDropdown();
    }

    /**
     * Refresh the history dropdown
     * @private
     */
    async _refreshHistoryDropdown() {
        if (!this.historyService || !this.domAdapter) {
            return;
        }

        const history = await this.historyService.getHistory();
        const historySelect = this.domAdapter.getElementById(this.historySelectId);

        if (historySelect) {
            // Clear existing options except default
            while (historySelect.options.length > 1) {
                historySelect.remove(1);
            }

            // Add history options
            history.forEach((query, index) => {
                const option = document.createElement('option');
                const displayText = query.length > 50 ?
                    query.substring(0, 50) + '...' : query;
                option.value = query;
                option.textContent = `${index + 1}. ${displayText}`;
                historySelect.add(option);
            });
        }
    }

    /**
     * Clear query history
     */
    async clearHistory() {
        if (!this.historyService) {
            return;
        }

        const confirmed = confirm('Are you sure you want to clear all query history?');
        if (confirmed) {
            await this.historyService.clearHistory();
            await this._refreshHistoryDropdown();

            if (this.toastManager) {
                this.toastManager.showInfo('Query history cleared');
            }
        }
    }

    /**
     * Set callback for query execution
     * @param {Function} callback - Callback function
     */
    onQueryExecute(callback) {
        this.onQueryExecute = callback;
    }

    /**
     * Focus the editor
     */
    focus() {
        if (this.codeMirror) {
            this.codeMirror.focus();
        }
    }
}
