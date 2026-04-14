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

        // Add AI hint button
        const hintBtn = document.createElement('button');
        hintBtn.id = 'getHintBtn';
        hintBtn.className = 'btn btn-info practice-action-btn';
        hintBtn.innerHTML = '🤖 Get Hint';
        hintBtn.addEventListener('click', () => this.getAIHint('hint'));

        queryActions.appendChild(submitBtn);
        queryActions.appendChild(solutionBtn);
        queryActions.appendChild(hintBtn);

        // Create AI response panel if it doesn't exist
        this.ensureAIPanel();
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
        // Order-independent comparison:
        // 1. Same row count
        // 2. Same column name set
        // 3. Each row, serialized with columns in a canonical order and sorted,
        //    matches position-by-position after sorting both sides.

        if (!userResults?.rows || !solutionResults?.rows) {
            console.log('❌ Compare: Missing results');
            return false;
        }

        const userRows = userResults.rows;
        const solutionRows = solutionResults.rows;

        console.log(`📊 Row count: User=${userRows.length}, Solution=${solutionRows.length}`);
        if (userRows.length !== solutionRows.length) {
            console.log('❌ Compare: Row count mismatch');
            return false;
        }

        const userCols = userRows.length > 0 ? Object.keys(userRows[0] || {}).sort() : [];
        const solutionCols = solutionRows.length > 0 ? Object.keys(solutionRows[0] || {}).sort() : [];

        console.log(`📊 Columns - User: [${userCols.join(', ')}]`);
        console.log(`📊 Columns - Solution: [${solutionCols.join(', ')}]`);

        if (userCols.length !== solutionCols.length ||
            !userCols.every((c, i) => c === solutionCols[i])) {
            console.log('❌ Compare: Column names do not match');
            return false;
        }

        // Canonicalize each row: stringify values through String() so BigInt,
        // Date, and number all collapse consistently, with keys in sorted order.
        const canonical = (row, cols) =>
            JSON.stringify(cols.map(c => String(row[c])));

        const userSorted = userRows.map(r => canonical(r, userCols)).sort();
        const solutionSorted = solutionRows.map(r => canonical(r, solutionCols)).sort();

        for (let i = 0; i < userSorted.length; i++) {
            if (userSorted[i] !== solutionSorted[i]) {
                console.log(`❌ Compare: Row mismatch at sorted index ${i}`);
                console.log(`   User:     ${userSorted[i]}`);
                console.log(`   Solution: ${solutionSorted[i]}`);
                return false;
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
                <p>Click "Show Solution" to see the correct answer, or ask AI for help.</p>
                <button id="explainErrorBtn" class="btn btn-info btn-sm">🤖 Explain What's Wrong</button>
            `;
            document.getElementById('explainErrorBtn').addEventListener('click', () => {
                this.getAIHint('explain_error');
            });
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
        feedbackDetails.innerHTML = `
            <p>${this.escapeHtml(errorMessage)}</p>
            <button id="explainErrorBtn" class="btn btn-info btn-sm">🤖 Explain This Error</button>
        `;
        document.getElementById('explainErrorBtn').addEventListener('click', () => {
            this.getAIHint('explain_error', errorMessage);
        });
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

    // ==================== AI Hint Methods ====================

    /**
     * Create the AI response panel if it doesn't exist
     */
    ensureAIPanel() {
        if (document.getElementById('aiResponsePanel')) return;

        const panel = document.createElement('div');
        panel.id = 'aiResponsePanel';
        panel.className = 'ai-panel hidden';
        panel.innerHTML = `
            <div class="ai-panel-header">
                <span class="ai-panel-title">🤖 AI Tutor</span>
                <button id="aiPanelClose" class="btn-link ai-panel-close">✕</button>
            </div>
            <div id="aiPanelContent" class="ai-panel-content"></div>
        `;

        // Insert after the feedback panel or at end of left panel
        const feedbackPanel = document.getElementById('practiceFeedbackPanel');
        if (feedbackPanel) {
            feedbackPanel.parentNode.insertBefore(panel, feedbackPanel.nextSibling);
        } else {
            document.querySelector('.left-panel')?.appendChild(panel);
        }

        document.getElementById('aiPanelClose').addEventListener('click', () => {
            panel.classList.add('hidden');
        });
    }

    /**
     * Get an AI hint, error explanation, or solution explanation
     * @param {'hint'|'explain_error'|'explain_solution'} type
     * @param {string|null} errorMessage
     */
    async getAIHint(type, errorMessage = null) {
        const panel = document.getElementById('aiResponsePanel');
        const content = document.getElementById('aiPanelContent');

        if (!panel || !content) return;

        // Get current user query from editor
        const queryEditor = document.querySelector('.CodeMirror');
        const userQuery = queryEditor?.CodeMirror?.getValue() || '';

        // Hide the feedback panel so it doesn't overlap the AI response
        const feedbackPanel = document.getElementById('practiceFeedbackPanel');
        if (feedbackPanel) feedbackPanel.classList.add('hidden');

        // Update header to show what type of response this is
        const titleLabels = { hint: '🤖 AI Hint', explain_error: '🤖 Error Explanation', explain_solution: '🤖 Solution Explanation' };
        const titleEl = document.querySelector('.ai-panel-title');
        if (titleEl) titleEl.textContent = titleLabels[type] || '🤖 AI Tutor';

        // Show loading state and scroll into view
        panel.classList.remove('hidden');
        content.innerHTML = '<span class="ai-thinking">Thinking...</span>';
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Disable hint button while loading
        const hintBtn = document.getElementById('getHintBtn');
        if (hintBtn) hintBtn.disabled = true;

        try {
            const response = await apiClient.getHint(
                this.currentQuestion.id,
                userQuery,
                errorMessage,
                type
            );

            if (response.error) {
                content.textContent = response.error;
                return;
            }

            // Typing animation
            content.textContent = '';
            await this.typeText(content, response.hint);

            if (response.cached) {
                content.innerHTML += '<span class="ai-cached"> (cached)</span>';
            }

        } catch (error) {
            console.error('AI hint error:', error);
            content.textContent = error.message || 'Failed to get hint. Please try again.';
        } finally {
            if (hintBtn) hintBtn.disabled = false;
        }
    }

    /**
     * Animate text appearing character by character
     */
    async typeText(element, text, speed = 20) {
        for (const char of text) {
            element.textContent += char;
            await new Promise(r => setTimeout(r, speed));
        }
    }
}
