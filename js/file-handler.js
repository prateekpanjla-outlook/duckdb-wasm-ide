// File Handler - Manages file uploads and data loading
export class FileHandler {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.currentFile = null;
        this.currentTableName = null;
        this.setupDropZone();
    }

    setupDropZone() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');

        // Click to browse
        dropZone.addEventListener('click', () => fileInput.click());

        // Drag and drop events
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0]);
            }
        });

        // Clear file button
        document.getElementById('clearFileBtn').addEventListener('click', () => {
            this.clearFile();
        });
    }

    async handleFile(file) {
        const fileExtension = file.name.split('.').pop().toLowerCase();

        // Validate file type
        const validExtensions = ['csv', 'json', 'parquet', 'duckdb'];
        if (!validExtensions.includes(fileExtension)) {
            alert(`Invalid file type. Supported types: ${validExtensions.join(', ')}`);
            return;
        }

        // Show file info
        this.currentFile = file;
        document.getElementById('fileName').textContent = `📄 ${file.name} (${this.formatFileSize(file.size)})`;
        document.getElementById('fileInfo').classList.remove('hidden');
        document.getElementById('dropZone').classList.add('hidden');

        // Generate table name from filename
        this.currentTableName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');

        try {
            // Register file with DuckDB
            await this.dbManager.registerFile(file.name, file);

            // Load data based on file type
            await this.loadFileByType(fileExtension, file.name, this.currentTableName);

            // Show success message
            this.showMessage(`✓ Successfully loaded "${file.name}" into table "${this.currentTableName}"`);

        } catch (error) {
            this.clearFile();
            this.showMessage(`✗ Error loading file: ${error.message}`, true);
        }
    }

    async loadFileByType(fileType, fileName, tableName) {
        switch (fileType) {
            case 'csv':
                await this.dbManager.insertCSVFromPath(fileName, tableName);
                break;

            case 'json':
                await this.dbManager.insertJSONFromPath(fileName, tableName);
                break;

            case 'parquet':
                await this.dbManager.createTableFromParquet(fileName, tableName);
                break;

            case 'duckdb':
                // For .duckdb files, we attach the database
                await this.dbManager.executeQuery(`ATTACH '${fileName}' AS imported_db`);
                break;

            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }
    }

    clearFile() {
        this.currentFile = null;
        this.currentTableName = null;
        document.getElementById('fileName').textContent = '';
        document.getElementById('fileInfo').classList.add('hidden');
        document.getElementById('dropZone').classList.remove('hidden');
        document.getElementById('fileInput').value = '';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    showMessage(message, isError = false) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'error' : 'success'}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: ${isError ? '#f8d7da' : '#d4edda'};
            color: ${isError ? '#721c24' : '#155724'};
            border-radius: 4px;
            border: 1px solid ${isError ? '#f5c6cb' : '#c3e6cb'};
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    getCurrentTableName() {
        return this.currentTableName;
    }
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
