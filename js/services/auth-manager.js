/**
 * Authentication Manager
 * Handles user authentication state and login/register UI
 */

import { apiClient } from './api-client.js';
import { PracticeManager } from './practice-manager.js';

export class AuthManager {
    constructor() {
        console.log('[AuthManager] Constructor called');
        this.authModal = null;
        this.isLoginMode = true;
        console.log('[AuthManager] About to call initializeUI()');
        this.initializeUI();
        console.log('[AuthManager] initializeUI() returned');
        console.log('[AuthManager] About to call checkExistingAuth()');
        this.checkExistingAuth();
        console.log('[AuthManager] Constructor complete');
    }

    /**
     * Initialize UI elements
     */
    initializeUI() {
        console.log('[AuthManager] initializeUI() - Starting');
        // Create auth modal HTML
        console.log('[AuthManager] initializeUI() - About to call createAuthModal()');
        this.createAuthModal();
        console.log('[AuthManager] initializeUI() - createAuthModal() returned');
        this.addAuthButtonToHeader();
        console.log('[AuthManager] initializeUI() - Complete');
    }

    /**
     * Check if user is already authenticated
     */
    async checkExistingAuth() {
        console.log('[AuthManager] checkExistingAuth() - Checking...');
        if (apiClient.isAuthenticated()) {
            const user = apiClient.getUser();
            console.log('[AuthManager] checkExistingAuth() - User already authenticated:', user);
            this.updateUIForLoggedInUser(user);
        } else {
            console.log('[AuthManager] checkExistingAuth() - No existing auth');
        }
    }

    /**
     * Create auth modal HTML
     */
    createAuthModal() {
        console.log('[AuthManager] createAuthModal() - Starting');
        console.log('[AuthManager] createAuthModal() - document.body exists:', !!document.body);

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

        console.log('[AuthManager] createAuthModal() - Modal HTML created, inserting into DOM');
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        console.log('[AuthManager] createAuthModal() - Modal inserted, verifying...');

        const modal = document.getElementById('authModal');
        console.log('[AuthManager] createAuthModal() - Modal element exists:', !!modal);

        this.attachEventListeners();
        console.log('[AuthManager] createAuthModal() - Complete');
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
        document.getElementById('authForm').addEventListener('submit', async (e) => {
            console.log('[AuthManager] Form submit event fired');
            e.preventDefault();
            await this.handleSubmit();
        });
    }

    /**
     * Add auth button to header (or attach to existing button)
     */
    addAuthButtonToHeader() {
        // Check if button already exists in HTML
        let loginBtn = document.getElementById('authBtn');

        if (loginBtn) {
            // Button exists, just attach the click handler
            loginBtn.addEventListener('click', () => this.openModal());
        } else {
            // Button doesn't exist, create it
            const headerRight = document.querySelector('.header-right');
            loginBtn = document.createElement('button');
            loginBtn.id = 'authBtn';
            loginBtn.className = 'btn btn-primary';
            loginBtn.textContent = 'Login';
            loginBtn.addEventListener('click', () => this.openModal());
            headerRight.insertBefore(loginBtn, headerRight.firstChild);
        }
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
        console.log('[AuthManager] handleSubmit() - STARTED');
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        const errorDiv = document.getElementById('authError');
        const submitBtn = document.querySelector('.auth-submit-btn');
        const submitText = document.getElementById('authSubmitText');
        const spinner = document.querySelector('.auth-spinner');
        console.log('[AuthManager] Email entered:', email);

        // Clear previous errors
        errorDiv.classList.add('hidden');

        // Show loading state
        submitBtn.disabled = true;
        submitText.classList.add('hidden');
        spinner.classList.remove('hidden');

        try {
            console.log('[AuthManager] About to call API login/register...');
            if (this.isLoginMode) {
                // Login
                console.log('[AuthManager] Calling apiClient.login()...');
                const result = await apiClient.login(email, password);
                console.log('[AuthManager] apiClient.login() returned:', result);
            } else {
                // Register
                console.log('[AuthManager] Calling apiClient.register()...');
                const result = await apiClient.register(email, password);
                console.log('[AuthManager] apiClient.register() returned:', result);
            }

            // Success - close modal and update UI
            this.closeModal();
            const user = apiClient.getUser();
            this.updateUIForLoggedInUser(user);

            // Show success message
            this.showNotification(`${this.isLoginMode ? 'Login' : 'Registration'} successful!`, 'success');

            // Initialize DuckDB after login and show question selector
            console.log('[AuthManager] Checking if window.app exists for DuckDB init...');
            console.log('[AuthManager] window.app exists:', !!window.app);

            if (window.app && typeof window.app.initializeDuckDB === 'function') {
                console.log('[AuthManager] Calling initializeDuckDB...');
                try {
                    const result = await window.app.initializeDuckDB();
                    console.log('[AuthManager] initializeDuckDB completed, result:', result);
                    // Initialize Practice Manager after DuckDB is ready
                    window.app.practiceManager = new PracticeManager(window.app.dbManager);
                    window.practiceManager = window.app.practiceManager;
                    console.log('[AuthManager] PracticeManager created and assigned');
                } catch (dbError) {
                    console.error('[AuthManager] initializeDuckDB failed:', dbError);
                    // Continue anyway - DuckDB might not be critical for questions UI
                }
            } else {
                console.log('[AuthManager] initializeDuckDB not available, skipping...');
            }

            // Show question selector
            console.log('[AuthManager] === POST-LOGIN: Checking for question selector ===');
            console.log('[AuthManager] window.app exists:', !!window.app);
            console.log('[AuthManager] typeof window.app:', typeof window.app);

            // Try to call showQuestionSelector regardless (for debugging)
            try {
                if (window.app && typeof window.app.showQuestionSelector === 'function') {
                    console.log('[AuthManager] Calling showQuestionSelector (standard path)...');
                    window.app.showQuestionSelector();
                } else {
                    console.error('[AuthManager] showQuestionSelector not available! window.app:', window.app);
                    // Force try calling anyway for debugging
                    if (window.app) {
                        console.log('[AuthManager] Force calling showQuestionSelector...');
                        window.app.showQuestionSelector();
                    }
                }
            } catch (e) {
                console.error('[AuthManager] Error calling showQuestionSelector:', e);
            }

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
