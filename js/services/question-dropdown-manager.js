/**
 * Question Dropdown Manager
 * Manages the question dropdown selector in the left panel
 */

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
            const response = await fetch(`${window.location.origin}:3000/api/practice/questions`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load questions');
            }

            const data = await response.json();
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

        if (infoSection) {
            infoSection.classList.remove('hidden');
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
            const response = await fetch(`${window.location.origin}:3000/api/practice/question/${this.selectedQuestion.id}`, {
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
