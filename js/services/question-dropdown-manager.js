/**
 * Question Dropdown Manager
 * Manages the question dropdown selector in the left panel
 */

import { PracticeManager } from './practice-manager.js';

// Dynamic API URL - uses same hostname as frontend, just different port
const hostname = window.location.hostname;
const API_BASE_URL = `http://${hostname}:3000/api`;

class QuestionDropdownManager {
    constructor() {
        this.questions = [];
        this.selectedQuestion = null;
        this.setupEventListeners();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        const dropdown = document.getElementById('questionDropdown');
        const loadBtn = document.getElementById('loadQuestionBtn');

        if (dropdown) {
            dropdown.addEventListener('change', (e) => this.onQuestionChange(e));
        }

        if (loadBtn) {
            loadBtn.addEventListener('click', () => this.loadSelectedQuestion());
        }
    }

    /**
     * Load questions from backend
     */
    async loadQuestions() {
        try {
            const response = await fetch(`${API_BASE_URL}/practice/questions`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load questions');
            }

            const data = await response.json();
            this.questions = data.questions || [];

            console.log('[QuestionDropdownManager] Loaded questions:', this.questions.length);
            if (this.questions.length > 0) {
                console.log('[QuestionDropdownManager] First question has sql_data:', this.questions[0].sql_data ? 'YES' : 'NO');
            }

            this.populateDropdown();
        } catch (error) {
            console.error('Error loading questions:', error);
            this.showError('Failed to load questions. Please try again.');
        }
    }

    /**
     * Populate the dropdown with questions
     */
    populateDropdown() {
        const dropdown = document.getElementById('questionDropdown');
        const loadBtn = document.getElementById('loadQuestionBtn');

        if (!dropdown) return;

        // Clear existing options (except the first one)
        dropdown.innerHTML = '<option value="">-- Select a Question --</option>';

        // Add questions
        this.questions.forEach((question, index) => {
            const option = document.createElement('option');
            option.value = question.id;
            option.textContent = `Q${index + 1}: ${question.sql_question.substring(0, 60)}${question.sql_question.length > 60 ? '...' : ''}`;
            dropdown.appendChild(option);
        });

        // Enable dropdown and button
        dropdown.disabled = false;
        if (loadBtn) {
            loadBtn.disabled = false;
        }
    }

    /**
     * Handle dropdown change
     */
    onQuestionChange(event) {
        console.log('[QuestionDropdownManager] onQuestionChange called');
        const questionId = parseInt(event.target.value);
        console.log('[QuestionDropdownManager] questionId:', questionId);
        console.log('[QuestionDropdownManager] this.questions.length:', this.questions.length);
        const question = this.questions.find(q => q.id === questionId);
        console.log('[QuestionDropdownManager] found question:', question ? 'YES' : 'NO');

        if (question) {
            console.log('[QuestionDropdownManager] question has sql_data:', question.sql_data ? 'YES' : 'NO');
            this.showQuestionInfo(question);
            this.selectedQuestion = question;
        } else {
            this.hideQuestionInfo();
            this.selectedQuestion = null;
        }
    }

    /**
     * Show question information
     */
    showQuestionInfo(question) {
        console.log('[QuestionDropdownManager] showQuestionInfo called');
        const infoSection = document.getElementById('selectedQuestionInfo');
        const title = document.getElementById('selectedQuestionTitle');
        const category = document.getElementById('selectedQuestionCategory');
        const difficulty = document.getElementById('selectedQuestionDifficulty');
        const desc = document.getElementById('selectedQuestionDesc');

        if (title) title.textContent = question.sql_question;
        if (category) category.textContent = question.category;
        if (difficulty) difficulty.textContent = question.difficulty;
        if (desc) desc.textContent = `Practice your ${question.category.toLowerCase()} skills with this ${question.difficulty} level question.`;

        // Display table schema
        this.displayTableSchema(question);

        if (infoSection) {
            infoSection.classList.remove('hidden');
            console.log('[QuestionDropdownManager] removed hidden class from infoSection');
        }
    }

    /**
     * Display table schema extracted from sql_data
     */
    displayTableSchema(question) {
        console.log('[QuestionDropdownManager] displayTableSchema called');
        const infoSection = document.getElementById('selectedQuestionInfo');
        if (!infoSection) {
            console.log('[QuestionDropdownManager] selectedQuestionInfo not found');
            return;
        }

        // Parse CREATE TABLE statements from sql_data (handles multi-line)
        const sqlData = question.sql_data;
        console.log('[QuestionDropdownManager] sqlData length:', sqlData.length);

        // Match CREATE TABLE ... ( ... ); with newlines allowed
        const createTableRegex = /CREATE TABLE\s+(\w+)\s*\(([\s\S]+?)\);/gi;
        const createTableMatches = [...sqlData.matchAll(createTableRegex)];

        console.log('[QuestionDropdownManager] createTableMatches length:', createTableMatches.length);

        if (!createTableMatches || createTableMatches.length === 0) return;

        // Remove existing schema if present
        const existingSchema = infoSection.querySelector('.table-schema-container');
        if (existingSchema) {
            existingSchema.remove();
        }

        let schemaHTML = '<div class="table-schema-container">';
        schemaHTML += '<h5 style="margin: 15px 0 10px 0; color: #4CAF50;">📊 Table Schema</h5>';

        createTableMatches.forEach(match => {
            // Extract table name (capture group 1)
            const tableName = match[1] || 'unknown';

            // Extract columns (capture group 2)
            const columnsStr = match[2];
            const columns = columnsStr.split(',').map(c => c.trim());

            schemaHTML += `<div style="margin-bottom: 12px; padding: 10px; background: #1e1e1e; border-radius: 6px; border-left: 3px solid #4CAF50;">
                <span style="color: #61dafb; font-weight: bold;">${tableName}</span>
                <div style="margin-left: 10px; font-family: monospace; font-size: 12px; color: #ccc;">`;

            columns.forEach(col => {
                // Clean up the column definition
                let colDef = col.replace(/^\(\d+,\s*/, ''); // Remove leading index
                colDef = colDef.replace(/\s*PRIMARY KEY/i, ' <span style="color: #f92672;">PRIMARY KEY</span>');
                colDef = colDef.replace(/\s*NOT NULL/i, ' <span style="color: #f92672;">NOT NULL</span>');
                colDef = colDef.replace(/\s*NULL/i, ' <span style="color: #f92672;">NULL</span>');
                colDef = colDef.replace(/\s*UNIQUE/i, ' <span style="color: #f92672;">UNIQUE</span>');
                schemaHTML += `<div style="margin: 2px 0;">• ${colDef}</div>`;
            });

            schemaHTML += '</div></div>';
        });

        schemaHTML += '</div>';

        // Append schema to info section
        infoSection.insertAdjacentHTML('beforeend', schemaHTML);
    }

    /**
     * Hide question information
     */
    hideQuestionInfo() {
        const infoSection = document.getElementById('selectedQuestionInfo');
        if (infoSection) {
            infoSection.classList.add('hidden');
        }
    }

    /**
     * Load the selected question into practice mode
     */
    async loadSelectedQuestion() {
        if (!this.selectedQuestion) {
            alert('Please select a question first');
            return;
        }

        try {
            // Show loading
            const loadBtn = document.getElementById('loadQuestionBtn');
            if (loadBtn) {
                loadBtn.textContent = 'Loading...';
                loadBtn.disabled = true;
            }

            // Fetch full question details
            const response = await fetch(`${API_BASE_URL}/practice/question/${this.selectedQuestion.id}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load question');
            }

            const data = await response.json();

            // Start practice mode with this question
            if (!window.practiceManager) {
                // Create PracticeManager if it doesn't exist
                if (window.app && window.app.dbManager) {
                    window.app.practiceManager = new PracticeManager(window.app.dbManager);
                    window.practiceManager = window.app.practiceManager;
                    console.log('[QuestionDropdownManager] Created PracticeManager');
                } else {
                    throw new Error('App or Database manager not initialized');
                }
            }

            await window.practiceManager.startQuestion(data.question);

            // Reset button
            if (loadBtn) {
                loadBtn.textContent = 'Load Question';
                loadBtn.disabled = false;
            }

        } catch (error) {
            console.error('Error loading question:', error);
            alert('Failed to load question: ' + error.message);

            const loadBtn = document.getElementById('loadQuestionBtn');
            if (loadBtn) {
                loadBtn.textContent = 'Load Question';
                loadBtn.disabled = false;
            }
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        const container = document.getElementById('selectedQuestionInfo');
        if (container) {
            container.innerHTML = `<div class="error-message">${this.escapeHtml(message)}</div>`;
            container.classList.remove('hidden');
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for use in app.js
export default QuestionDropdownManager;
