// DuckDB WASM Browser Application
import { DuckDBManager } from './duckdb-manager.js';
import { FileHandler } from './file-handler.js';
import { QueryEditor } from './query-editor.js';
import { ResultsView } from './results-view.js';
import { AuthManager } from './services/auth-manager.js';
import { PracticeManager } from './services/practice-manager.js';
import QuestionsManager from './services/questions-manager.js';
import QuestionDropdownManager from './services/question-dropdown-manager.js';

class App {
    constructor() {
        this.dbManager = new DuckDBManager();
        this.fileHandler = new FileHandler(this.dbManager);
        this.queryEditor = new QueryEditor();
        this.resultsView = new ResultsView();

        // Initialize async and handle errors
        this.init().catch((error) => {
            console.error('[app.js] Initialization error:', error);
            // Ensure loading overlay is hidden even if init fails
            this.showLoading(false);
        });
    }

    async init() {
        try {
            console.log('[app.js] init() - Starting application initialization');

            // Set up event listeners
            console.log('[app.js] init() - Setting up event listeners');
            this.setupEventListeners();

            // Initialize Authentication Manager (but don't initialize DuckDB yet!)
            console.log('[app.js] init() - Creating AuthManager...');
            this.authManager = new AuthManager();
            console.log('[app.js] init() - AuthManager created, checking if modal exists...');

            // Check if modal was created
            setTimeout(() => {
                const modal = document.getElementById('authModal');
                console.log('[app.js] init() - AuthModal exists in DOM:', !!modal);
                console.log('[app.js] init() - window.app exists:', !!window.app);
                console.log('[app.js] init() - window.app.authManager exists:', !!(window.app && window.app.authManager));
            }, 100);

            // Initialize Questions Manager
            console.log('[app.js] init() - Creating QuestionsManager...');
            this.questionsManager = new QuestionsManager();
            console.log('[app.js] init() - QuestionsManager created');

            // Check if user is already logged in from localStorage
            const token = localStorage.getItem('auth_token');
            const user = JSON.parse(localStorage.getItem('user_data') || 'null');

            console.log('[app.js] init() - Token exists:', !!token);
            console.log('[app.js] init() - User exists:', !!user);

            if (token && user) {
                console.log('[app.js] init() - User is logged in, initializing DuckDB');
                // User is logged in, initialize DuckDB now
                await this.initializeDuckDB();

                // Update UI for logged in user
                this.authManager.updateUIForLoggedInUser(user);

                // Initialize Practice Manager
                this.practiceManager = new PracticeManager(this.dbManager);
                window.practiceManager = this.practiceManager;

                // Make app instance available globally
                window.app = this;
                console.log('[app.js] init() - App instance set to window.app');
            } else {
                console.log('[app.js] init() - User not logged in, showing login prompt');
                // User not logged in, show login prompt
                this.showLoginPrompt();
            }

            console.log('[app.js] init() - Initialization complete');
        } catch (error) {
            console.error('[app.js] Error during initialization:', error);
        } finally {
            // Always hide loading overlay, regardless of success or failure
            console.log('[app.js] Hiding loading overlay');
            this.showLoading(false);
        }
    }

    /**
     * Initialize DuckDB (called after login)
     */
    async initializeDuckDB() {
        // Show loading state
        this.showLoading(true, 'Initializing DuckDB WASM...');

        // Initialize DuckDB
        const success = await this.dbManager.initialize();
        this.updateStatus(success);

        // Hide loading state
        this.showLoading(false);

        return success;
    }

    /**
     * Show login prompt when not authenticated
     */
    showLoginPrompt() {
        const loginPromptSection = document.getElementById('loginPromptSection');
        const questionSelectorSection = document.getElementById('questionSelectorSection');

        if (loginPromptSection) {
            loginPromptSection.classList.remove('hidden');
        }
        if (questionSelectorSection) {
            questionSelectorSection.classList.add('hidden');
        }

        // Set up login prompt button
        const loginPromptBtn = document.getElementById('loginPromptBtn');
        if (loginPromptBtn) {
            loginPromptBtn.addEventListener('click', () => {
                if (this.authManager) {
                    this.authManager.openModal();
                }
            });
        }
    }

    /**
     * Show question selector after login
     */
    showQuestionSelector() {
        const loginPromptSection = document.getElementById('loginPromptSection');
        const questionSelectorSection = document.getElementById('questionSelectorSection');

        if (loginPromptSection) {
            loginPromptSection.classList.add('hidden');
        }
        if (questionSelectorSection) {
            questionSelectorSection.classList.remove('hidden');
        }

        // Initialize Question Dropdown Manager
        this.questionDropdownManager = new QuestionDropdownManager();
        this.questionDropdownManager.loadQuestions();
    }

    showLoading(show, message = '') {
        const overlay = document.getElementById('loadingOverlay');
        const appContainer = document.getElementById('appContainer');
        const loadingMessage = document.getElementById('loadingMessage');

        if (show) {
            overlay.classList.add('visible');
            appContainer.style.opacity = '0.5';
            appContainer.style.pointerEvents = 'none';
            if (message) {
                loadingMessage.textContent = message;
            }
        } else {
            overlay.classList.remove('visible');
            appContainer.style.opacity = '1';
            appContainer.style.pointerEvents = 'auto';
        }
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

        // Help toggle button
        const toggleHelpBtn = document.getElementById('toggleHelp');
        const helpContent = document.getElementById('helpContent');
        toggleHelpBtn.addEventListener('click', () => {
            const isExpanded = helpContent.classList.contains('expanded');
            if (isExpanded) {
                helpContent.classList.remove('expanded');
                helpContent.classList.add('collapsed');
                toggleHelpBtn.textContent = 'Show';
            } else {
                helpContent.classList.remove('collapsed');
                helpContent.classList.add('expanded');
                toggleHelpBtn.textContent = 'Hide';
            }
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
    console.log('[app.js] DOMContentLoaded fired, creating App instance');
    window.app = new App();
    console.log('[app.js] App instance created and set to window.app');
});
