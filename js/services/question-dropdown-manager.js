/**
 * Question Dropdown Manager
 * Manages the question dropdown selector in the left panel
 */

import { PracticeManager } from './practice-manager.js';
import { apiClient } from './api-client.js';

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
            const data = await apiClient.getQuestions();
            this.questions = data.questions || [];
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
        const questionId = parseInt(event.target.value);
        const question = this.questions.find(q => q.id === questionId);

        if (question) {
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
        }
    }

    /**
     * Display table schema extracted from sql_data
     */
    displayTableSchema(question) {
        const infoSection = document.getElementById('selectedQuestionInfo');
        if (!infoSection) return;

        const sqlData = question.sql_data;
        const createTableRegex = /CREATE TABLE\s+(\w+)\s*\(([\s\S]+?)\);/gi;
        const createTableMatches = [...sqlData.matchAll(createTableRegex)];

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

        // Render ER diagram if available
        this.displayERDiagram(question, infoSection);
    }

    /**
     * Display Mermaid ER diagram if the question has one stored
     */
    displayERDiagram(question, container) {
        // Remove existing diagram
        const existing = container.querySelector('.er-diagram-container');
        if (existing) existing.remove();

        if (!question.er_diagram) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'er-diagram-container';
        wrapper.innerHTML = '<h5 class="er-diagram-title">Table Relationships</h5>';

        const mermaidDiv = document.createElement('div');
        mermaidDiv.className = 'mermaid';
        mermaidDiv.textContent = question.er_diagram;
        wrapper.appendChild(mermaidDiv);
        container.appendChild(wrapper);

        // Render with Mermaid.js
        if (window.mermaid) {
            mermaid.run({ nodes: [mermaidDiv] });
        }
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
            const data = await apiClient.getQuestion(this.selectedQuestion.id);

            // Start practice mode with this question
            if (!window.practiceManager) {
                // Create PracticeManager if it doesn't exist
                if (window.app && window.app.dbManager) {
                    window.app.practiceManager = new PracticeManager(window.app.dbManager);
                    window.practiceManager = window.app.practiceManager;
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
