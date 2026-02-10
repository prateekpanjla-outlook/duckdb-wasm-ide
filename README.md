# DuckDB WebAssembly IDE

A browser-based SQL IDE powered by DuckDB WebAssembly. Query data files directly in your browser with no backend required.

## Features

- 📁 **Load Data Files**: Support for CSV, JSON, Parquet, and DuckDB (.duckdb) files
- 📝 **SQL Editor**: Full-featured SQL editor with syntax highlighting
- 🔄 **Query History**: Automatically saves and allows re-running previous queries
- 📊 **Results Display**: Sortable, paginated results table
- 📤 **Export Results**: Export query results to CSV or JSON
- 🚀 **Fast Execution**: All processing happens in your browser
- 🔒 **Privacy**: Your data never leaves your browser

## Quick Start

1. **Open the application** in a modern web browser (Chrome, Firefox, Edge, Safari)

2. **Load a data file** by:
   - Dragging and dropping a file onto the upload area
   - Clicking the upload area to browse files

3. **Run SQL queries**:
   - Type your query in the SQL editor
   - Press `Ctrl+Enter` or click "Run" to execute
   - View results in the right panel

4. **Export results**:
   - Click "Export Results" to download as CSV or JSON

## Supported File Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| CSV | `.csv` | Comma-separated values with header row |
| JSON | `.json` | JSON arrays (row-major or column-major) |
| Parquet | `.parquet` | Apache Parquet columnar storage |
| DuckDB | `.duckdb` | DuckDB database files |

## SQL Examples

```sql
-- View all tables
SHOW TABLES;

-- Select first 10 rows
SELECT * FROM your_table LIMIT 10;

-- Count records
SELECT COUNT(*) FROM your_table;

-- Group and aggregate
SELECT column1, COUNT(*) as count
FROM your_table
GROUP BY column1
ORDER BY count DESC;

-- Filter data
SELECT * FROM your_table
WHERE column1 > 100
LIMIT 100;
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Execute query |
| `Ctrl+Space` | Autocomplete |

## Technical Details

- **Frontend**: Vanilla JavaScript (ES6+)
- **Database**: DuckDB WebAssembly
- **Editor**: CodeMirror 6 with SQL mode
- **Styling**: Custom CSS with CSS Grid/Flexbox

## Limitations

- **Memory**: Limited by browser WebAssembly memory constraints (~4GB max)
- **Performance**: Best with datasets under 1GB for optimal performance
- **Threading**: Single-threaded execution by default

## Development

```bash
# Serve the project (e.g., using Python)
python -m http.server 8000

# Or using Node.js
npx serve .

# Open browser to http://localhost:8000
```

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14.1+
- Edge 90+

## License

MIT License - Feel free to use and modify as needed.

## Resources

- [DuckDB WASM Documentation](https://duckdb.org/docs/stable/clients/wasm/overview.html)
- [DuckDB GitHub](https://github.com/duckdb/duckdb-wasm)
- [CodeMirror](https://codemirror.net/)

<!-- 🔴 HIGH PRIORITY TODO - AuthManager Module Loading Issue -->
<!-- See: HIGH_PRIORITY_TODO.md for details -->

