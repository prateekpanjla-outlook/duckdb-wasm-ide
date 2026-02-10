# Playwright E2E Testing Guide

This guide explains how to run and debug Playwright end-to-end tests for the DuckDB WASM IDE.

## Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```

   For all browsers:
   ```bash
   npx playwright install
   ```

## Running Tests

### Run All E2E Tests
```bash
npm run test:e2e
```

### Run Specific Test File
```bash
npx playwright test tests/e2e/basic-workflow.spec.js
```

### Run Specific Test
```bash
npx playwright test --grep "should execute SHOW TABLES"
```

### Run in Headed Mode (See Browser)
```bash
npx playwright test --headed
```

### Debug Mode (Interactive)
```bash
npm run test:e2e:debug
```

This opens the Playwright Inspector where you can:
- Step through tests
- Inspect elements
- View selectors
- See live execution

### UI Mode (Visual Interface)
```bash
npm run test:e2e:ui
```

Opens a visual interface showing all tests with timelines and traces.

## Test Files

| Test File | Description |
|-----------|-------------|
| [tests/e2e/basic-workflow.spec.js](../tests/e2e/basic-workflow.spec.js) | Basic workflow: CSV upload, query execution, screenshots |
| [debug-arrow.html](../debug-arrow.html) | Debug page for Arrow result structure |

## Screenshots

Screenshots are saved to `test-results/screenshots/` after each test step:

- `01-initial-load.png` - Application initial load
- `02-before-upload.png` - Before CSV upload
- `03-file-selected.png` - After CSV selection
- `04-before-show-tables.png` - Before SHOW TABLES query
- `05-show-tables-typed.png` - After typing query
- `06-show-tables-executed.png` - After clicking run
- `07-show-tables-results.png` - Query results
- `08-19-*.png` - Other query results
- `debug-*.png` - Arrow debugging screenshots

## Key Selectors Used

| Element | Selector |
|---------|----------|
| Query Editor | `.CodeMirror` |
| Run Button | `#runQueryBtn` |
| File Input | `#fileInput` |
| Drop Zone | `#dropZone` |
| File Info | `#fileInfo` |
| Results Container | `#resultsContainer` |
| DB Status | `#dbStatus` |
| Export Button | `#exportResultsBtn` |

## Test Coverage

### Current Tests
1. ✅ Application load
2. ✅ CSV file upload
3. ✅ SHOW TABLES query
4. ✅ SELECT with LIMIT
5. ✅ DESCRIBE query
6. ✅ COUNT query
7. ✅ Export results
8. ✅ Arrow structure debugging

### Future Tests
- [ ] Multiple file uploads
- [ ] Query history
- [ ] Error handling
- [ ] Large datasets
- [ ] Different file types (JSON, Parquet)

## Debugging Arrow Results

The [debug-arrow.html](../debug-arrow.html) page shows the raw Arrow structure from DuckDB.

**To use:**
1. Open `http://localhost:8000/debug-arrow.html`
2. Click "Test SHOW TABLES" button
3. View the Arrow structure in the browser
4. Check browser console for column data debug info

## Troubleshooting

### Tests Timing Out
- Increase timeout: `test.setTimeout(60000)`
- DuckDB initialization takes ~5 seconds
- Add `await page.waitForTimeout(5000)` after page load

### Element Not Found
- Check selector in [index.html](../index.html)
- Use Playwright Inspector: `npm run test:e2e:debug`
- Try `page.locator('selector').count()` to see if element exists

### Screenshots Not Saving
- Ensure directory exists: `mkdir -p test-results/screenshots`
- Check file permissions
- Verify path in `page.screenshot()`

## CI/CD Integration

For GitHub Actions, GitLab CI, etc:

```yaml
- name: Install dependencies
  run: npm ci

- name: Install Playwright browsers
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npm run test:e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: test-results/
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Test Docs](https://playwright.dev/docs/intro)
- [Selectors Guide](https://playwright.dev/docs/selectors)
- [Debugging Tests](https://playwright.dev/docs/debug)
