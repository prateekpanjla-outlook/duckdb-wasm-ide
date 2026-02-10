/**
 * FileUploadUI - UI wrapper for file upload functionality
 * Separated from FileService for testability
 */
import { ToastManager } from './ToastManager.js';

export class FileUploadUI {
    constructor(dependencies = {}) {
        this.fileService = dependencies.fileService || null;
        this.toastManager = dependencies.toastManager || new ToastManager(dependencies);
        this.domAdapter = dependencies.domAdapter || null;
        this.onFileLoaded = dependencies.onFileLoaded || null;

        this.currentFile = null;
        this.currentTableName = null;
    }

    /**
     * Initialize the file upload UI
     * @param {string} dropZoneId - ID of the drop zone element
     * @param {string} fileInputId - ID of the file input element
     * @param {string} fileInfoId - ID of the file info display element
     * @param {string} clearButtonId - ID of the clear file button
     */
    initialize(dropZoneId, fileInputId, fileInfoId, clearButtonId) {
        if (!this.domAdapter) {
            console.warn('FileUploadUI: No DOM adapter provided');
            return;
        }

        this.dropZoneId = dropZoneId;
        this.fileInputId = fileInputId;
        this.fileInfoId = fileInfoId;
        this.clearButtonId = clearButtonId;

        this._setupDropZone();
        this._setupFileInput();
        this._setupClearButton();

        // Initialize toast container
        this.toastManager.initialize();
    }

    /**
     * Setup drag and drop zone
     * @private
     */
    _setupDropZone() {
        const dropZone = this.domAdapter.getElementById(this.dropZoneId);
        if (!dropZone) {
            return;
        }

        // Drag over event
        this.domAdapter.on(dropZone, 'dragover', (e) => {
            e.preventDefault();
            this.domAdapter.addClass(this.dropZoneId, 'dragover');
        });

        // Drag leave event
        this.domAdapter.on(dropZone, 'dragleave', () => {
            this.domAdapter.removeClass(this.dropZoneId, 'dragover');
        });

        // Drop event
        this.domAdapter.on(dropZone, 'drop', async (e) => {
            e.preventDefault();
            this.domAdapter.removeClass(this.dropZoneId, 'dragover');

            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                await this.handleFileDrop(e.dataTransfer.files[0]);
            }
        });

        // Click to browse
        this.domAdapter.on(dropZone, 'click', () => {
            const fileInput = this.domAdapter.getElementById(this.fileInputId);
            if (fileInput) {
                fileInput.click();
            }
        });
    }

    /**
     * Setup file input
     * @private
     */
    _setupFileInput() {
        const fileInput = this.domAdapter.getElementById(this.fileInputId);
        if (!fileInput) {
            return;
        }

        this.domAdapter.on(fileInput, 'change', async (e) => {
            if (e.target.files && e.target.files.length > 0) {
                await this.handleFileDrop(e.target.files[0]);
            }
        });
    }

    /**
     * Setup clear button
     * @private
     */
    _setupClearButton() {
        const clearButton = this.domAdapter.getElementById(this.clearButtonId);
        if (!clearButton) {
            return;
        }

        this.domAdapter.on(clearButton, 'click', () => {
            this.clearFile();
        });
    }

    /**
     * Handle file drop/input
     * @param {File} file - The dropped/selected file
     */
    async handleFileDrop(file) {
        if (!this.fileService) {
            this.toastManager.showError('File service not initialized');
            return;
        }

        try {
            this.showLoadingState();

            const result = await this.fileService.processFile(file);

            this.currentFile = file;
            this.currentTableName = result.tableName;

            this.displaySuccess(result);

            // Notify callback
            if (this.onFileLoaded) {
                this.onFileLoaded(result);
            }

        } catch (error) {
            this.clearFile();
            this.toastManager.showError(`Error loading file: ${error.message}`);
        } finally {
            this.hideLoadingState();
        }
    }

    /**
     * Display file info after successful load
     * @param {Object} result - File processing result
     */
    displaySuccess(result) {
        if (!this.domAdapter) {
            return;
        }

        const fileName = this.domAdapter.getElementById(this.fileInfoId);
        if (!fileName) {
            return;
        }

        this.domAdapter.setText(fileName, `📄 ${result.fileName} (${result.formattedSize}) → ${result.tableName}`);
        this.domAdapter.show(this.fileInfoId);
        this.domAdapter.hide(this.dropZoneId);

        this.toastManager.showSuccess(`✓ Loaded "${result.fileName}" into table "${result.tableName}"`);
    }

    /**
     * Clear the current file
     */
    clearFile() {
        this.currentFile = null;
        this.currentTableName = null;

        if (this.domAdapter) {
            this.domAdapter.hide(this.fileInfoId);
            this.domAdapter.show(this.dropZoneId);

            // Clear file input
            const fileInput = this.domAdapter.getElementById(this.fileInputId);
            if (fileInput) {
                fileInput.value = '';
            }
        }
    }

    /**
     * Show loading state
     * @private
     */
    showLoadingState() {
        if (this.domAdapter) {
            this.domAdapter.addClass(this.dropZoneId, 'loading');
        }
    }

    /**
     * Hide loading state
     * @private
     */
    hideLoadingState() {
        if (this.domAdapter) {
            this.domAdapter.removeClass(this.dropZoneId, 'loading');
        }
    }

    /**
     * Get current table name
     * @returns {string|null} Current table name
     */
    getCurrentTableName() {
        return this.currentTableName;
    }

    /**
     * Get current file
     * @returns {File|null} Current file
     */
    getCurrentFile() {
        return this.currentFile;
    }
}
