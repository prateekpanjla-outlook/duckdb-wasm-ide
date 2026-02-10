/**
 * Validators - Input validation utilities
 */

/**
 * Supported file extensions
 */
const SUPPORTED_EXTENSIONS = new Set(['csv', 'json', 'parquet', 'duckdb']);

/**
 * MIME type mappings
 */
const MIME_TYPES = {
    'csv': 'text/csv',
    'json': 'application/json',
    'parquet': 'application/octet-stream',
    'duckdb': 'application/octet-stream'
};

/**
 * SQL reserved keywords that cannot be used as table names
 */
const SQL_RESERVED_WORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER',
    'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AND', 'OR', 'NOT',
    'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'AS', 'DISTINCT', 'CASE', 'WHEN',
    'THEN', 'ELSE', 'END', 'UNION', 'INTERSECT', 'EXCEPT', 'INSERT', 'UPDATE',
    'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INDEX', 'VIEW', 'PRIMARY',
    'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'DEFAULT'
]);

/**
 * Validate a file for upload
 * @param {File} file - The file to validate
 * @returns {Object} Validation result with valid flag and errors array
 */
export function validateFile(file) {
    const errors = [];

    // Check if file exists
    if (!file) {
        return {
            valid: false,
            errors: ['No file provided']
        };
    }

    // Check file size (max 500MB)
    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        errors.push(`File size exceeds maximum of 500MB`);
    }

    // Check file size (min 1 byte)
    if (file.size === 0) {
        errors.push('File is empty');
    }

    // Get file extension
    const extension = getFileExtension(file.name);

    // Validate extension
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
        errors.push(
            `Invalid file type. Supported types: ${Array.from(SUPPORTED_EXTENSIONS).join(', ')}`
        );
    }

    // Check for special characters in filename (basic validation)
    if (/[<>:"|?*]/.test(file.name)) {
        errors.push('Filename contains invalid characters');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate a table name
 * @param {string} tableName - The table name to validate
 * @returns {Object} Validation result
 */
export function validateTableName(tableName) {
    const errors = [];

    if (!tableName) {
        return {
            valid: false,
            errors: ['Table name cannot be empty']
        };
    }

    // Check length
    if (tableName.length > 128) {
        errors.push('Table name exceeds maximum length of 128 characters');
    }

    // Check if starts with valid character (letter or underscore)
    if (!/^[a-zA-Z_]/.test(tableName)) {
        errors.push('Table name must start with a letter or underscore');
    }

    // Check if contains only valid characters
    if (!/^[a-zA-Z0-9_]*$/.test(tableName)) {
        errors.push('Table name can only contain letters, numbers, and underscores');
    }

    // Check if it's a reserved word
    const upperName = tableName.toUpperCase();
    if (SQL_RESERVED_WORDS.has(upperName)) {
        errors.push(`'${tableName}' is a reserved SQL keyword`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate a SQL query
 * @param {string} query - The SQL query to validate
 * @returns {Object} Validation result
 */
export function validateQuery(query) {
    const errors = [];
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
        return {
            valid: false,
            errors: ['Query cannot be empty']
        };
    }

    // Check for obviously dangerous operations
    const dangerousPatterns = [
        /DROP\s+TABLE/i,
        /DROP\s+DATABASE/i,
        /DROP\s+SCHEMA/i,
        /TRUNCATE/i,
        /DELETE\s+FROM\s+\w+\s*$/i, // DELETE without WHERE
        /ALTER\s+TABLE.*DROP/i
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmedQuery)) {
            errors.push('Query contains potentially dangerous operations');
            break;
        }
    }

    // Basic SQL syntax check (must start with SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, WITH, SHOW, DESCRIBE, EXPLAIN)
    const validStartPatterns = [
        /^SELECT/i,
        /^INSERT/i,
        /^UPDATE/i,
        /^DELETE/i,
        /^CREATE/i,
        /^ALTER/i,
        /^DROP/i,
        /^WITH/i,
        /^SHOW/i,
        /^DESCRIBE/i,
        /^EXPLAIN/i,
        /^--/i, // Comment
        /^\/\*/i // Multi-line comment
    ];

    const isValidStart = validStartPatterns.some(pattern => pattern.test(trimmedQuery));
    if (!isValidStart) {
        errors.push('Query must start with a valid SQL keyword (SELECT, INSERT, UPDATE, DELETE, CREATE, etc.)');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings: errors.length > 0 ? [] : ['Query validation passed (basic checks only)']
    };
}

/**
 * Get file extension from filename
 * @param {string} filename - The filename
 * @returns {string} The file extension (lowercase)
 */
export function getFileExtension(filename) {
    if (!filename) {
        return '';
    }

    const parts = filename.split('.');
    if (parts.length < 2) {
        return '';
    }

    return parts.pop().toLowerCase();
}

/**
 * Check if file type is supported
 * @param {string} extension - The file extension
 * @returns {boolean} True if supported
 */
export function isSupportedFileType(extension) {
    return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
}

/**
 * Get MIME type for file extension
 * @param {string} extension - The file extension
 * @returns {string} The MIME type
 */
export function getMimeType(extension) {
    return MIME_TYPES[extension.toLowerCase()] || 'application/octet-stream';
}

/**
 * Sanitize a filename to be safe for use
 * @param {string} filename - The filename to sanitize
 * @returns {string} Sanitized filename
 */
export function sanitizeFilename(filename) {
    return filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_{2,}/g, '_')
        .toLowerCase();
}

/**
 * Check if a string is a valid SQL identifier
 * @param {string} identifier - The identifier to check
 * @returns {boolean} True if valid
 */
export function isValidSQLIdentifier(identifier) {
    if (!identifier) {
        return false;
    }

    // Must start with letter or underscore
    if (!/^[a-zA-Z_]/.test(identifier)) {
        return false;
    }

    // Can contain letters, numbers, underscores
    return /^[a-zA-Z0-9_]*$/.test(identifier);
}
