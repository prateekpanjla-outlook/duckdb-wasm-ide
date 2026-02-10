// DuckDB WASM Browser Application
import { DuckDBManager } from './duckdb-manager.js';
import { FileHandler } from './file-handler.js';
import { QueryEditor } from './query-editor.js';
import { ResultsView } from './results-view.js';

class App {
    constructor() {
        this.dbManager = new DuckDBManager();
        this.fileHandler = new FileHandler(this.dbManager);
        this.queryEditor = new QueryEditor();
        this.resultsView = new ResultsView();

        this.init();
    }

    async init() {
        // Initialize DuckDB
        const success = await this.dbManager.initialize();
        this.updateStatus(success);

        // Set up event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Run query button
        document.getElementById('runQueryBtn').addEventListener('click', () => {
            this.executeQuery();
        });

        // Clear history button
        document.getElementById('clearHistoryBtn').addEventListener('click', () => {
            this.queryEditor.clearHistory();
        });

        // Export results button
        document.getElementById('exportResultsBtn').addEventListener('click', () => {
            this.resultsView.exportResults();
        });

        // Keyboard shortcut: Ctrl+Enter to run query
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.executeQuery();
            }
        });
    }

    updateStatus(connected) {
        const status = document.getElementById('dbStatus');
        if (connected) {
            status.textContent = '🟢 Connected';
            status.className = 'status connected';
        } else {
            status.textContent = '🔴 Connection Failed';
            status.className = 'status disconnected';
        }
    }

    async executeQuery() {
        const query = this.queryEditor.getQuery();

        if (!query.trim()) {
            alert('Please enter a SQL query');
            return;
        }

        // Show loading state
        this.setLoading(true);

        try {
            const startTime = performance.now();
            const result = await this.dbManager.executeQuery(query);
            const endTime = performance.now();
            const executionTime = ((endTime - startTime) / 1000).toFixed(3);

            // Display results
            this.resultsView.displayResults(result, executionTime);

            // Save to history
            this.queryEditor.addToHistory(query);

        } catch (error) {
            this.resultsView.displayError(error.message);
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        const btn = document.getElementById('runQueryBtn');
        if (loading) {
            btn.innerHTML = '<span class="spinner"></span> Running...';
            btn.disabled = true;
        } else {
            btn.innerHTML = '▶ Run (Ctrl+Enter)';
            btn.disabled = false;
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
