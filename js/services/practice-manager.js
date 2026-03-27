/**
 * Practice Mode Manager
 * Handles SQL practice mode functionality
 */

import { apiClient } from './api-client.js';

export class PracticeManager {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.isActive = false;
        this.currentQuestion = null;
        // Practice mode uses the main DuckDB connection (this.dbManager)
        this.questionStartTime = null;

        this.initializeUI();
    }

    /**
     * Initialize UI elements
     */
    initializeUI() {
        // Create practice prompt modal
        this.createPracticePromptModal();
        // Create practice mode UI components
        this.createPracticeModeUI();
    }

    /**
     * Create practice prompt modal
     */
    createPracticePromptModal() {
        const modalHTML = `
            <div id="practicePromptModal" class="auth-modal">
                <div class="auth-modal-content practice-prompt-content">
                    <button class="auth-modal-close" id="closePracticePrompt">&times;</button>

                    <div class="practice-prompt-header">
                        <h2>🎯 Start SQL Practice?</h2>
                        <p class="auth-subtitle">Improve your SQL skills with interactive challenges</p>
                    </div>

                    <div class="practice-prompt-info">
                        <div class="practice-benefit">
                            <span class="practice-icon">📝</span>
                            <span>Interactive SQL challenges</span>
                        </div>
                        <div class="practice-benefit">
                            <span class="practice-icon">✅</span>
                            <span>Instant feedback on your solutions</span>
                        </div>
                        <div class="practice-benefit">
                            <span class="practice-icon">📊</span>
                            <span>Track your progress</span>
                        </div>
                    </div>

                    <div class="practice-prompt-actions">
                        <button id="startPracticeYes" class="btn btn-primary">Yes, Start Practicing!</button>
                        <button id="startPracticeNo" class="btn btn-secondary">Not Now</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.attachPromptEventListeners();
    }

    /**
     * Attach prompt event listeners
     */
    attachPromptEventListeners() {
        document.getElementById('closePracticePrompt').addEventListener('click', () => {
            this.closePromptModal();
        });

        document.getElementById('practicePromptModal').addEventListener('click', (e) => {
            if (e.target.id === 'practicePromptModal') {
                this.closePromptModal();
            }
        });

        document.getElementById('startPracticeYes').addEventListener('click', () => {
            this.startPracticeMode();
        });

        document.getElementById('startPracticeNo').addEventListener('click', () => {
            this.closePromptModal();
        });
    }

    /**
     * Show prompt modal
     */
    showPromptModal() {
        document.getElementById('practicePromptModal').classList.add('visible');
    }

    /**
     * Close prompt modal
     */
    closePromptModal() {
        document.getElementById('practicePromptModal').classList.remove('visible');
    }

    /**
     * Create practice mode UI components
     * Note: Panels are now in HTML, this is kept for compatibility
     */
    createPracticeModeUI() {
        // Panels are now in index.html, no need to create them dynamically
        // This method is kept for compatibility with existing code
    }

    /**
     * Start practice mode
     */
    async startPracticeMode() {
        this.closePromptModal();

        try {
            // Show loading
            this.showLoading('Loading practice question...', '🎯 Loading Practice Mode...');

            // Activate practice mode on backend
            await apiClient.activatePracticeMode();

            // Get first question
            const response = await apiClient.startPractice();
            this.currentQuestion = response.question;

            // Initialize practice DuckDB instance
            await this.initializePracticeDuckDB();

            // Show practice UI
            this.showPracticeUI();

            // Start timer
            this.startTimer();

        } catch (error) {
            console.error('Failed to start practice mode:', error);
            alert('Failed to start practice mode: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Start practice mode with a specific question (from dropdown/modal)
     */
    async startQuestion(question) {
        try {
            // Show loading
            this.showLoading('Loading question...', '📝 Loading Question...');

            // Set current question
            this.currentQuestion = question;

            // Initialize practice DuckDB instance
            await this.initializePracticeDuckDB();

            // Show practice UI
            this.showPracticeUI();

            // Start timer
            this.startTimer();

        } catch (error) {
            console.error('Failed to start question:', error);
            alert('Failed to start question: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Load current question's tables into the main DuckDB connection.
     * Uses CREATE OR REPLACE to handle table name conflicts across questions.
     */
    async initializePracticeDuckDB() {
        const data = this.currentQuestion.sql_data;
        // Replace CREATE TABLE with CREATE OR REPLACE TABLE so reloading works
        const sql = data.replace(/CREATE TABLE/gi, 'CREATE OR REPLACE TABLE');
        const statements = sql.split(';').filter(s => s.trim());

        for (const statement of statements) {
            if (statement.trim()) {
                await this.dbManager.executeQuery(statement);
            }
        }

        console.log(`Practice tables loaded (${statements.length} statements)`);
    }

    /**
     * Show practice UI
     */
    showPracticeUI() {
        // Show question panel
        document.getElementById('practiceQuestionPanel').classList.remove('hidden');

        // Display question
        document.getElementById('practiceQuestionText').textContent = this.currentQuestion.sql_question;

        // Display difficulty and category
        document.getElementById('practiceDifficulty').textContent = this.currentQuestion.difficulty;
        document.getElementById('practiceCategory').textContent = this.currentQuestion.category;

        // Add practice buttons to query section
        this.addPracticeButtons();

        // Clear editor
        const queryEditor = document.querySelector('.CodeMirror');
        if (queryEditor && queryEditor.CodeMirror) {
            queryEditor.CodeMirror.setValue('');
        }

        // Clear results
        document.getElementById('resultsContainer').innerHTML = '<div class="results-placeholder"><p>Write your SQL query and click "Run Code" to see results</p></div>';
    }

    /**
     * Add practice mode buttons
     */
    addPracticeButtons() {
        const queryActions = document.querySelector('.query-actions');

        // Remove existing practice buttons if any
        const existingButtons = queryActions.querySelectorAll('.practice-action-btn');
        existingButtons.forEach(btn => btn.remove());

        // Add submit button
        const submitBtn = document.createElement('button');
        submitBtn.id = 'submitPracticeBtn';
        submitBtn.className = 'btn btn-success practice-action-btn';
        submitBtn.innerHTML = '✓ Submit Code';
        submitBtn.addEventListener('click', () => this.submitSolution());

        // Add show solution button
        const solutionBtn = document.createElement('button');
        solutionBtn.id = 'showSolutionBtn';
        solutionBtn.className = 'btn btn-secondary practice-action-btn';
        solutionBtn.innerHTML = '💡 Show Solution';
        solutionBtn.addEventListener('click', () => this.showSolution());

        queryActions.appendChild(submitBtn);
        queryActions.appendChild(solutionBtn);
    }

    /**
     * Remove practice mode buttons
     */
    removePracticeButtons() {
        const buttons = document.querySelectorAll('.practice-action-btn');
        buttons.forEach(btn => btn.remove());
    }

    /**
     * Submit solution for verification
     */
    async submitSolution() {
        const queryEditor = document.querySelector('.CodeMirror');
        const userQuery = queryEditor.CodeMirror.getValue();

        if (!userQuery.trim()) {
            alert('Please write a query first!');
            return;
        }

        try {
            // Stop timer
            const timeTaken = Math.floor((Date.now() - this.questionStartTime) / 1000);

            // Execute user query
            const userResults = await this.dbManager.executeQuery(userQuery);

            // Debug: Check what tables exist before solution query
            console.log('🔍 DEBUG: Tables before solution query');
            try {
                const tables = await this.dbManager.executeQuery("SHOW TABLES");
                console.log('   Tables:', JSON.stringify(tables, null, 2));
            } catch (e) {
                console.log('   Error showing tables:', e.message);
            }

            // Get solution results for comparison
            const solutionResults = await this.dbManager.executeQuery(this.currentQuestion.sql_solution);

            // Debug logging (handle BigInt serialization)
            console.log('Comparing results:');
            console.log('User results:', this.safeStringify(userResults));
            console.log('Solution results:', this.safeStringify(solutionResults));
            console.log('Solution query:', this.currentQuestion.sql_solution);

            // Compare results
            const isCorrect = this.compareResults(userResults, solutionResults);
            console.log('Is correct?', isCorrect);

            // Show feedback
            this.showFeedback(isCorrect, userResults, solutionResults);

            // Submit to backend
            await apiClient.verifySolution(
                this.currentQuestion.id,
                userQuery,
                userResults,
                isCorrect,
                timeTaken
            );

            // If correct, show next question button
            if (isCorrect) {
                this.showNextQuestionButton();
            }

        } catch (error) {
            console.error('Error submitting solution:', error);
            this.showErrorFeedback(error.message);
        }
    }

    /**
     * Compare user results with solution results
     */
    compareResults(userResults, solutionResults) {
        // Improved comparison for DuckDB results

        if (!userResults || !solutionResults) {
            console.log('❌ Compare: Missing results');
            return false;
        }

        // Check if both have rows
        if (!userResults.rows || !solutionResults.rows) {
            console.log('❌ Compare: Missing rows');
            return false;
        }

        const userRows = userResults.rows;
        const solutionRows = solutionResults.rows;

        console.log(`📊 Row count: User=${userRows.length}, Solution=${solutionRows.length}`);

        // Compare row count
        if (userRows.length !== solutionRows.length) {
            console.log('❌ Compare: Row count mismatch');
            return false;
        }

        // Compare column names
        const userCols = userRows.length > 0 ? Object.keys(userRows[0] || {}) : [];
        const solutionCols = solutionRows.length > 0 ? Object.keys(solutionRows[0] || {}) : [];

        console.log(`📊 Columns - User: [${userCols.join(', ')}]`);
        console.log(`📊 Columns - Solution: [${solutionCols.join(', ')}]`);

        if (userCols.length !== solutionCols.length) {
            console.log('❌ Compare: Column count mismatch');
            return false;
        }

        // Check if columns match (regardless of order)
        const userColsSorted = [...userCols].sort();
        const solutionColsSorted = [...solutionCols].sort();
        const colsMatch = userColsSorted.every((col, i) => col === solutionColsSorted[i]);

        if (!colsMatch) {
            console.log('❌ Compare: Column names do not match');
            return false;
        }

        // For each row, compare values
        // Note: This is a simplified comparison that doesn't handle row ordering
        for (let i = 0; i < userRows.length; i++) {
            const userRow = userRows[i];
            const solutionRow = solutionRows[i];

            for (const col of userCols) {
                const userVal = userRow[col];
                const solutionVal = solutionRow[col];

                // Compare values (handle numbers as strings)
                const userStr = String(userVal);
                const solutionStr = String(solutionVal);

                if (userStr !== solutionStr) {
                    console.log(`❌ Compare: Row ${i}, Column '${col}' mismatch`);
                    console.log(`   User: "${userStr}" (${typeof userVal})`);
                    console.log(`   Solution: "${solutionStr}" (${typeof solutionVal})`);
                    return false;
                }
            }
        }

        console.log('✅ Compare: Results match!');
        return true;
    }

    /**
     * Show feedback
     */
    showFeedback(isCorrect, userResults, solutionResults) {
        const feedbackPanel = document.getElementById('practiceFeedbackPanel');
        const feedbackIcon = document.getElementById('feedbackIcon');
        const feedbackMessage = document.getElementById('feedbackMessage');
        const feedbackDetails = document.getElementById('feedbackDetails');

        feedbackPanel.classList.remove('hidden', 'feedback-correct', 'feedback-incorrect');

        if (isCorrect) {
            feedbackPanel.classList.add('feedback-correct');
            feedbackIcon.textContent = '✅';
            feedbackMessage.textContent = 'Correct! Well done!';
            feedbackDetails.innerHTML = `
                <p>Your solution matches the expected result.</p>
                <p>Click "Next Question" to continue.</p>
            `;
        } else {
            feedbackPanel.classList.add('feedback-incorrect');
            feedbackIcon.textContent = '❌';
            feedbackMessage.textContent = 'Not quite right. Keep trying!';
            feedbackDetails.innerHTML = `
                <p>Your results don't match the expected solution.</p>
                <p>Click "Show Solution" to see the correct answer.</p>
            `;
        }
    }

    /**
     * Show error feedback
     */
    showErrorFeedback(errorMessage) {
        const feedbackPanel = document.getElementById('practiceFeedbackPanel');
        const feedbackIcon = document.getElementById('feedbackIcon');
        const feedbackMessage = document.getElementById('feedbackMessage');
        const feedbackDetails = document.getElementById('feedbackDetails');

        feedbackPanel.classList.remove('hidden', 'feedback-correct', 'feedback-incorrect');
        feedbackPanel.classList.add('feedback-error');

        feedbackIcon.textContent = '⚠️';
        feedbackMessage.textContent = 'Error executing query';
        feedbackDetails.textContent = errorMessage;
    }

    /**
     * Show solution
     */
    showSolution() {
        const solutionPanel = document.getElementById('practiceSolutionPanel');
        const solutionContent = document.getElementById('practiceSolutionContent');

        const explanation = this.currentQuestion.sql_solution_explanation || [];

        let explanationHTML = '<div class="solution-explanation">';
        if (Array.isArray(explanation) && explanation.length > 0) {
            explanationHTML += '<h4>Step-by-step explanation:</h4><ol>';
            explanation.forEach(step => {
                explanationHTML += `<li>${step}</li>`;
            });
            explanationHTML += '</ol>';
        }
        explanationHTML += '</div>';

        solutionContent.innerHTML = `
            <div class="solution-code">
                <strong>Correct Solution:</strong>
                <pre><code>${this.escapeHtml(this.currentQuestion.sql_solution)}</code></pre>
            </div>
            ${explanationHTML}
        `;

        solutionPanel.classList.remove('hidden');
    }

    /**
     * Show next question button
     */
    showNextQuestionButton() {
        const feedbackDetails = document.getElementById('feedbackDetails');

        const nextBtn = document.createElement('button');
        nextBtn.id = 'nextQuestionBtn';
        nextBtn.className = 'btn btn-primary';
        nextBtn.textContent = 'Next Question →';
        nextBtn.addEventListener('click', () => this.getNextQuestion());

        feedbackDetails.appendChild(document.createElement('br'));
        feedbackDetails.appendChild(nextBtn);
    }

    /**
     * Get next question
     */
    async getNextQuestion() {
        try {
            this.showLoading('Loading next question...', '➡️ Loading Next Question...');

            const response = await apiClient.getNextQuestion();

            if (response.error) {
                alert(response.error);
                await this.exitPracticeMode();
                return;
            }

            this.currentQuestion = response.question;

            // Reinitialize DuckDB with new data
            await this.initializePracticeDuckDB();

            // Reset UI
            this.hideFeedback();
            this.showPracticeUI();
            this.startTimer();

        } catch (error) {
            console.error('Failed to load next question:', error);
            alert('Failed to load next question: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Hide feedback panel
     */
    hideFeedback() {
        document.getElementById('practiceFeedbackPanel').classList.add('hidden');
        document.getElementById('practiceSolutionPanel').classList.add('hidden');
    }

    /**
     * Start timer
     */
    startTimer() {
        this.questionStartTime = Date.now();

        // Update timer display every second
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.questionStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            document.getElementById('timerValue').textContent =
                `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    /**
     * Stop timer
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * Exit practice mode
     */
    async exitPracticeMode() {
        this.isActive = false;
        this.stopTimer();

        // Hide practice UI
        document.getElementById('practiceQuestionPanel').classList.add('hidden');
        document.getElementById('practiceSolutionPanel').classList.add('hidden');
        document.getElementById('practiceFeedbackPanel').classList.add('hidden');

        // Remove practice buttons
        this.removePracticeButtons();

        // Deactivate on backend
        try {
            await apiClient.deactivatePracticeMode();
        } catch (error) {
            console.error('Failed to deactivate practice mode:', error);
        }
    }

    /**
     * Show loading state
     */
    showLoading(message, title = null) {
        const overlay = document.getElementById('loadingOverlay');
        const loadingMessage = document.getElementById('loadingMessage');
        const loadingTitle = document.getElementById('loadingTitle');

        loadingMessage.textContent = message;
        if (title && loadingTitle) {
            loadingTitle.textContent = title;
        }
        overlay.classList.add('visible');
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.classList.remove('visible');
    }

    /**
     * Escape HTML for safe display
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Safely stringify results, handling BigInt values
     */
    safeStringify(obj, indent = 2) {
        return JSON.stringify(obj, (key, value) => {
            // Convert BigInt to string
            if (typeof value === 'bigint') {
                return value.toString();
            }
            return value;
        }, indent);
    }
}
