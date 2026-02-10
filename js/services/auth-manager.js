/**
 * Authentication Manager
 * Handles user authentication state and login/register UI
 */

import { apiClient } from './api-client.js';

export class AuthManager {
    constructor() {
        this.authModal = null;
        this.isLoginMode = true;
        this.initializeUI();
        this.checkExistingAuth();
    }

    /**
     * Initialize UI elements
     */
    initializeUI() {
        // Create auth modal HTML
        this.createAuthModal();
        this.addAuthButtonToHeader();
    }

    /**
     * Check if user is already authenticated
     */
    async checkExistingAuth() {
        if (apiClient.isAuthenticated()) {
            const user = apiClient.getUser();
            this.updateUIForLoggedInUser(user);
        }
    }

    /**
     * Create auth modal HTML
     */
    createAuthModal() {
        const modalHTML = `
            <div id="authModal" class="auth-modal">
                <div class="auth-modal-content">
                    <button class="auth-modal-close" id="closeAuthModal">&times;</button>

                    <div class="auth-header">
                        <h2 id="authTitle">Login</h2>
                        <p class="auth-subtitle">DuckDB WASM IDE</p>
                    </div>

                    <form id="authForm" class="auth-form">
                        <div class="form-group">
                            <label for="authEmail">Email</label>
                            <input
                                type="email"
                                id="authEmail"
                                class="form-input"
                                placeholder="your@email.com"
                                required
                            >
                        </div>

                        <div class="form-group">
                            <label for="authPassword">Password</label>
                            <input
                                type="password"
                                id="authPassword"
                                class="form-input"
                                placeholder="••••••••"
                                required
                                minlength="6"
                            >
                        </div>

                        <div id="authError" class="auth-error hidden"></div>

                        <button type="submit" class="btn btn-primary auth-submit-btn">
                            <span id="authSubmitText">Login</span>
                            <span class="spinner auth-spinner hidden"></span>
                        </button>
                    </form>

                    <div class="auth-toggle">
                        <span id="authToggleText">Don't have an account?</span>
                        <button id="authToggleBtn" class="btn-link">Register</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.attachEventListeners();
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Close button
        document.getElementById('closeAuthModal').addEventListener('click', () => {
            this.closeModal();
        });

        // Close on backdrop click
        document.getElementById('authModal').addEventListener('click', (e) => {
            if (e.target.id === 'authModal') {
                this.closeModal();
            }
        });

        // Toggle between login/register
        document.getElementById('authToggleBtn').addEventListener('click', () => {
            this.toggleMode();
        });

        // Form submission
        document.getElementById('authForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
    }

    /**
     * Add auth button to header
     */
    addAuthButtonToHeader() {
        const headerRight = document.querySelector('.header-right');
        const loginBtn = document.createElement('button');
        loginBtn.id = 'authBtn';
        loginBtn.className = 'btn btn-primary';
        loginBtn.textContent = 'Login';
        loginBtn.addEventListener('click', () => this.openModal());
        headerRight.insertBefore(loginBtn, headerRight.firstChild);
    }

    /**
     * Open auth modal
     */
    openModal() {
        const modal = document.getElementById('authModal');
        modal.classList.add('visible');
        document.getElementById('authEmail').focus();
    }

    /**
     * Close auth modal
     */
    closeModal() {
        const modal = document.getElementById('authModal');
        modal.classList.remove('visible');
        this.clearForm();
    }

    /**
     * Toggle between login and register mode
     */
    toggleMode() {
        this.isLoginMode = !this.isLoginMode;

        const title = document.getElementById('authTitle');
        const submitText = document.getElementById('authSubmitText');
        const toggleText = document.getElementById('authToggleText');
        const toggleBtn = document.getElementById('authToggleBtn');

        if (this.isLoginMode) {
            title.textContent = 'Login';
            submitText.textContent = 'Login';
            toggleText.textContent = "Don't have an account?";
            toggleBtn.textContent = 'Register';
        } else {
            title.textContent = 'Register';
            submitText.textContent = 'Register';
            toggleText.textContent = 'Already have an account?';
            toggleBtn.textContent = 'Login';
        }
    }

    /**
     * Handle form submission
     */
    async handleSubmit() {
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        const errorDiv = document.getElementById('authError');
        const submitBtn = document.querySelector('.auth-submit-btn');
        const submitText = document.getElementById('authSubmitText');
        const spinner = document.querySelector('.auth-spinner');

        // Clear previous errors
        errorDiv.classList.add('hidden');

        // Show loading state
        submitBtn.disabled = true;
        submitText.classList.add('hidden');
        spinner.classList.remove('hidden');

        try {
            if (this.isLoginMode) {
                // Login
                await apiClient.login(email, password);
            } else {
                // Register
                await apiClient.register(email, password);
            }

            // Success - close modal and update UI
            this.closeModal();
            const user = apiClient.getUser();
            this.updateUIForLoggedInUser(user);

            // Show success message
            this.showNotification(`${this.isLoginMode ? 'Login' : 'Registration'} successful!`, 'success');

        } catch (error) {
            errorDiv.textContent = error.message || `${this.isLoginMode ? 'Login' : 'Registration'} failed`;
            errorDiv.classList.remove('hidden');
        } finally {
            // Hide loading state
            submitBtn.disabled = false;
            submitText.classList.remove('hidden');
            spinner.classList.add('hidden');
        }
    }

    /**
     * Update UI for logged in user
     */
    updateUIForLoggedInUser(user) {
        const authBtn = document.getElementById('authBtn');
        const practiceBtn = document.getElementById('startPracticeBtn');
        const viewQuestionsBtn = document.getElementById('viewQuestionsBtn');

        if (user) {
            // Create user menu
            authBtn.textContent = user.email;
            authBtn.classList.remove('btn-primary');
            authBtn.classList.add('btn-secondary');

            // Add logout functionality
            authBtn.onclick = () => this.handleLogout();

            // Show practice and questions buttons when logged in
            if (practiceBtn) {
                practiceBtn.style.display = 'inline-block';
            }
            if (viewQuestionsBtn) {
                viewQuestionsBtn.classList.remove('hidden');
            }
        } else {
            authBtn.textContent = 'Login';
            authBtn.classList.remove('btn-secondary');
            authBtn.classList.add('btn-primary');
            authBtn.onclick = () => this.openModal();

            // Hide practice and questions buttons when logged out
            if (practiceBtn) {
                practiceBtn.style.display = 'none';
            }
            if (viewQuestionsBtn) {
                viewQuestionsBtn.classList.add('hidden');
            }
            if (practiceBtn) {
                practiceBtn.style.display = 'none';
            }
        }
    }

    /**
     * Handle logout
     */
    async handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            await apiClient.logout();
            this.updateUIForLoggedInUser(null);
            this.showNotification('Logged out successfully', 'info');
        }
    }

    /**
     * Clear form
     */
    clearForm() {
        document.getElementById('authEmail').value = '';
        document.getElementById('authPassword').value = '';
        document.getElementById('authError').classList.add('hidden');
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}
