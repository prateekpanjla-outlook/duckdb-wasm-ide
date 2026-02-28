/**
 * Questions Manager
 * Handles displaying and managing the list of practice questions
 */

// Dynamic API URL - uses same hostname as frontend, just different port
const hostname = window.location.hostname;
const API_BASE_URL = `http://${hostname}:3000/api`;

class QuestionsManager {
    constructor() {
        this.questions = [];
        this.userProgress = {};
        this.setupEventListeners();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // View questions button
        const viewQuestionsBtn = document.getElementById('viewQuestionsBtn');
        if (viewQuestionsBtn) {
            viewQuestionsBtn.addEventListener('click', () => this.showQuestionsModal());
        }

        // Close modal button
        const closeBtn = document.getElementById('closeQuestionsModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideQuestionsModal());
        }

        // Close modal on outside click
        const modal = document.getElementById('questionsModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideQuestionsModal();
                }
            });
        }
    }

    /**
     * Show questions modal
     */
    async showQuestionsModal() {
        const modal = document.getElementById('questionsModal');
        modal.classList.remove('hidden');

        // Load questions if not already loaded
        if (this.questions.length === 0) {
            await this.loadQuestions();
        }

        this.renderQuestions();
    }

    /**
     * Hide questions modal
     */
    hideQuestionsModal() {
        const modal = document.getElementById('questionsModal');
        modal.classList.add('hidden');
    }

    /**
     * Load all questions from backend
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
            this.questions = data.questions;
            this.userProgress = data.progress || {};
        } catch (error) {
            console.error('Error loading questions:', error);
            this.showError('Failed to load questions. Please try again.');
        }
    }

    /**
     * Render questions list
     */
    renderQuestions() {
        const container = document.getElementById('questionsList');

        if (!this.questions || this.questions.length === 0) {
            container.innerHTML = '<div class="no-questions">No questions available</div>';
            return;
        }

        let html = '<div class="questions-grid">';

        this.questions.forEach((question, index) => {
            const questionNumber = index + 1;
            const status = this.getQuestionStatus(question.id);
            const statusClass = status.class;
            const statusText = status.text;

            html += `
                <div class="question-card ${statusClass}" data-question-id="${question.id}">
                    <div class="question-header">
                        <span class="question-number">Q${questionNumber}</span>
                        <span class="question-status ${statusClass}">${statusText}</span>
                    </div>
                    <h3 class="question-title">${this.escapeHtml(question.sql_question)}</h3>
                    <div class="question-meta">
                        <span class="badge badge-category">${this.escapeHtml(question.category)}</span>
                        <span class="badge badge-difficulty">${this.escapeHtml(question.difficulty)}</span>
                    </div>
                    <button class="btn btn-primary btn-small start-question-btn"
                            data-question-id="${question.id}">
                        ${statusText === 'Completed' ? 'Retry' : 'Start'}
                    </button>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

        // Add click handlers for start buttons
        container.querySelectorAll('.start-question-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const questionId = parseInt(e.target.dataset.questionId);
                this.startQuestion(questionId);
            });
        });
    }

    /**
     * Get question status
     */
    getQuestionStatus(questionId) {
        const progress = this.userProgress[questionId];

        if (progress && progress.completed) {
            return { class: 'completed', text: '✓ Completed' };
        } else if (progress && progress.attempts > 0) {
            return { class: 'in-progress', text: '→ In Progress' };
        } else {
            return { class: 'not-started', text: '○ Not Started' };
        }
    }

    /**
     * Start a specific question
     */
    async startQuestion(questionId) {
        try {
            // Hide the modal
            this.hideQuestionsModal();

            // Load the specific question
            const response = await fetch(`${API_BASE_URL}/practice/question/${questionId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load question');
            }

            const data = await response.json();

            // Start practice mode with this question
            if (window.practiceManager) {
                await window.practiceManager.startQuestion(data.question);
            }
        } catch (error) {
            console.error('Error starting question:', error);
            this.showError('Failed to start question. Please try again.');
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        const container = document.getElementById('questionsList');
        container.innerHTML = `<div class="error-message">${this.escapeHtml(message)}</div>`;
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
export default QuestionsManager;
