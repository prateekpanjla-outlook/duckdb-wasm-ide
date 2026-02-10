/**
 * FileService - File processing business logic
 * Separated from UI for testability
 */
import { validateFile, validateTableName, getFileExtension, isSupportedFileType } from '../utils/validators.js';
import { generateTableName, formatFileSize } from '../utils/formatters.js';

/**
 * Custom error for file processing errors
 */
export class FileProcessingError extends Error {
    constructor(message, code = 'FILE_PROCESSING_ERROR') {
        super(message);
        this.name = 'FileProcessingError';
        this.code = code;
    }
}

/**
 * File processing result
 */
export class FileProcessingResult {
    constructor(fileName, tableName, fileSize, fileType) {
        this.fileName = fileName;
        this.tableName = tableName;
        this.fileSize = fileSize;
        this.fileType = fileType;
        this.formattedSize = formatFileSize(fileSize);
        this.timestamp = new Date().toISOString();
    }
}

export class FileService {
    constructor(dependencies = {}) {
        this.dbManager = dependencies.dbManager || null;
        this.logger = dependencies.logger || console;
        this.validators = dependencies.validators || {
            validateFile,
            validateTableName,
            getFileExtension,
            isSupportedFileType
        };
        this.formatters = dependencies.formatters || {
            generateTableName,
            formatFileSize
        };
    }

    /**
     * Process a file upload
     * @param {File} file - The file to process
     * @param {Object} options - Processing options
     * @returns {Promise<FileProcessingResult>} Processing result
     */
    async processFile(file, options = {}) {
        // Validate file
        const validation = this.validators.validateFile(file);

        if (!validation.valid) {
            this.logger.error('File validation failed:', validation.errors);
            throw new FileProcessingError(
                `File validation failed: ${validation.errors.join(', ')}`,
                'INVALID_FILE'
            );
        }

        // Get file extension
        const extension = this.validators.getFileExtension(file.name);

        // Generate table name
        const tableName = options.tableName ||
            this.formatters.generateTableName(file.name);

        // Validate table name
        const tableNameValidation = this.validators.validateTableName(tableName);

        if (!tableNameValidation.valid) {
            this.logger.error('Table name validation failed:', tableNameValidation.errors);
            throw new FileProcessingError(
                `Invalid table name: ${tableNameValidation.errors.join(', ')}`,
                'INVALID_TABLE_NAME'
            );
        }

        // Register file with DuckDB
        if (!this.dbManager) {
            throw new FileProcessingError(
                'Database manager not initialized',
                'NO_DATABASE'
            );
        }

        try {
            await this.dbManager.registerFile(file.name, file);
        } catch (error) {
            this.logger.error('Failed to register file:', error);
            throw new FileProcessingError(
                `Failed to register file: ${error.message}`,
                'REGISTRATION_FAILED'
            );
        }

        // Load file based on type
        try {
            await this.loadFileIntoDatabase(file.name, tableName, extension);
        } catch (error) {
            this.logger.error('Failed to load file:', error);
            throw new FileProcessingError(
                `Failed to load file: ${error.message}`,
                'LOAD_FAILED'
            );
        }

        // Return result
        return new FileProcessingResult(
            file.name,
            tableName,
            file.size,
            extension
        );
    }

    /**
     * Load file into database based on type
     * @private
     * @param {string} fileName - Name of the file
     * @param {string} tableName - Target table name
     * @param {string} fileType - File type/extension
     * @returns {Promise<void>}
     */
    async loadFileIntoDatabase(fileName, tableName, fileType) {
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
                // DuckDB database files use ATTACH
                await this.dbManager.executeQuery(`ATTACH '${fileName}' AS imported_db`);
                break;

            default:
                throw new FileProcessingError(
                    `Unsupported file type: ${fileType}`,
                    'UNSUPPORTED_TYPE'
                );
        }
    }

    /**
     * Get list of supported file types
     * @returns {Array<string>} Array of supported file extensions
     */
    getSupportedFileTypes() {
        return ['csv', 'json', 'parquet', 'duckdb'];
    }

    /**
     * Check if a file type is supported
     * @param {string} extension - File extension
     * @returns {boolean} True if supported
     */
    isFileTypeSupported(extension) {
        return this.getSupportedFileTypes().includes(extension.toLowerCase());
    }

    /**
     * Generate a table name from a filename
     * @param {string} filename - The filename
     * @returns {string} Generated table name
     */
    generateTableName(filename) {
        return this.formatters.generateTableName(filename);
    }

    /**
     * Validate a file without processing it
     * @param {File} file - The file to validate
     * @returns {Object} Validation result
     */
    validateFile(file) {
        return this.validators.validateFile(file);
    }

    /**
     * Get file type from filename
     * @param {string} filename - The filename
     * @returns {string} File extension
     */
    getFileType(filename) {
        return this.validators.getFileExtension(filename);
    }

    /**
     * Format file size for display
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted size
     */
    formatFileSize(bytes) {
        return this.formatters.formatFileSize(bytes);
    }

    /**
     * Create a summary of processed files
     * @param {Array<FileProcessingResult>} results - Array of processing results
     * @returns {Object} Summary object
     */
    createSummary(results) {
        const summary = {
            totalFiles: results.length,
            totalSize: 0,
            filesByType: {},
            tableNames: [],
            timestamp: new Date().toISOString()
        };

        for (const result of results) {
            summary.totalSize += result.fileSize;
            summary.tableNames.push(result.tableName);

            if (!summary.filesByType[result.fileType]) {
                summary.filesByType[result.fileType] = 0;
            }
            summary.filesByType[result.fileType]++;
        }

        summary.formattedTotalSize = this.formatters.formatFileSize(summary.totalSize);

        return summary;
    }

    /**
     * Batch process multiple files
     * @param {Array<File>} files - Array of files to process
     * @param {Object} options - Processing options
     * @returns {Promise<Array<FileProcessingResult>>} Array of results
     */
    async processBatch(files, options = {}) {
        const results = [];
        const errors = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            try {
                const result = await this.processFile(file, {
                    ...options,
                    tableName: options.tableName ?
                        `${options.tableName}_${i + 1}` :
                        undefined
                });

                results.push(result);
            } catch (error) {
                this.logger.error(`Failed to process file ${file.name}:`, error);
                errors.push({
                    fileName: file.name,
                    error: error.message
                });
            }
        }

        // If any files failed, throw an error with details
        if (errors.length > 0 && !options.continueOnError) {
            throw new FileProcessingError(
                `Failed to process ${errors.length} file(s): ${errors.map(e => e.fileName).join(', ')}`,
                'BATCH_FAILED'
            );
        }

        return results;
    }
}
