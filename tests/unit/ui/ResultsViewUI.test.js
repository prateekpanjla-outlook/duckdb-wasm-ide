/**
 * Unit Tests for ResultsViewUI
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ResultsViewUI } from '../../../js/ui/ResultsViewUI.js';
import { ExportService } from '../../../js/services/ExportService.js';

describe('ResultsViewUI', () => {
    let resultsViewUI;
    let mockExportService;
    let mockToastManager;
    let mockDOMAdapter;
    let mockElements;
    let mockResults;

    beforeEach(() => {
        // Mock results
        mockResults = {
            columns: ['id', 'name', 'value'],
            rows: [
                { id: 1, name: 'Alice', value: 100 },
                { id: 2, name: 'Bob', value: 200 },
                { id: 3, name: 'Charlie', value: null }
            ]
        };

        // Mock DOM elements
        mockElements = {
            resultsContainer: {
                innerHTML: '',
                querySelectorAll: vi.fn(() => []),
                querySelector: vi.fn(() => null)
            },
            rowCount: {
                textContent: ''
            },
            queryTime: {
                textContent: ''
            },
            exportResultsBtn: {
                addEventListener: vi.fn()
            }
        };

        // Mock DOM adapter
        mockDOMAdapter = {
            getElementById: vi.fn((id) => {
                if (id === 'resultsContainer') return mockElements.resultsContainer;
                if (id === 'rowCount') return mockElements.rowCount;
                if (id === 'queryTime') return mockElements.queryTime;
                if (id === 'exportResultsBtn') return mockElements.exportResultsBtn;
                return null;
            }),
            querySelector: vi.fn(() => null),
            querySelectorAll: vi.fn(() => []),
            setHTML: vi.fn((element, html) => {
                const el = typeof element === 'string' ? mockElements.resultsContainer : element;
                if (el) el.innerHTML = html;
            }),
            setText: vi.fn((id, text) => {
                if (id === 'rowCount') mockElements.rowCount.textContent = text;
                if (id === 'queryTime') mockElements.queryTime.textContent = text;
            }),
            addClass: vi.fn(),
            removeClass: vi.fn(),
            on: vi.fn((element, event, handler) => {
                if (element && element.addEventListener) {
                    element.addEventListener(event, handler);
                }
            })
        };

        // Mock ExportService
        mockExportService = {
            exportToCSV: vi.fn().mockResolvedValue({
                content: 'id,name,value\n1,Alice,100',
                filename: 'results.csv',
                mimeType: 'text/csv'
            }),
            exportToJSON: vi.fn().mockResolvedValue({
                content: '[{"id":1,"name":"Alice","value":100}]',
                filename: 'results.json',
                mimeType: 'application/json'
            }),
            exportToHTML: vi.fn().mockResolvedValue({
                content: '<table>...</table>',
                filename: 'results.html',
                mimeType: 'text/html'
            })
        };

        // Mock ToastManager
        mockToastManager = {
            showSuccess: vi.fn(),
            showError: vi.fn(),
            showWarning: vi.fn(),
            showInfo: vi.fn(),
            show: vi.fn()
        };

        // Mock Blob and URL
        global.Blob = vi.fn((content, options) => ({
            content,
            type: options.type
        }));
        global.URL = {
            createObjectURL: vi.fn(() => 'blob:mock-url'),
            revokeObjectURL: vi.fn()
        };

        // Mock document.createElement and body
        const mockLink = {
            href: '',
            download: '',
            click: vi.fn()
        };
        global.document.createElement = vi.fn((tag) => {
            if (tag === 'a') return mockLink;
            return {
                textContent: '',
                innerHTML: ''
            };
        });

        // Properly mock document.body
        Object.defineProperty(document, 'body', {
            value: {
                appendChild: vi.fn(),
                removeChild: vi.fn()
            },
            writable: true,
            configurable: true
        });

        // Mock prompt
        global.prompt = vi.fn(() => '1');

        // Create ResultsViewUI
        resultsViewUI = new ResultsViewUI({
            exportService: mockExportService,
            toastManager: mockToastManager,
            domAdapter: mockDOMAdapter
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('initialization', () => {
        it('should initialize with provided dependencies', () => {
            expect(resultsViewUI.exportService).toBe(mockExportService);
            expect(resultsViewUI.toastManager).toBe(mockToastManager);
            expect(resultsViewUI.domAdapter).toBe(mockDOMAdapter);
        });

        it('should initialize with default IDs', () => {
            expect(resultsViewUI.containerId).toBe('resultsContainer');
            expect(resultsViewUI.rowCountId).toBe('rowCount');
            expect(resultsViewUI.queryTimeId).toBe('queryTime');
            expect(resultsViewUI.exportButtonId).toBe('exportResultsBtn');
        });

        it('should initialize with custom IDs', () => {
            const ui = new ResultsViewUI({
                containerId: 'customContainer',
                rowCountId: 'customRowCount',
                queryTimeId: 'customQueryTime',
                exportButtonId: 'customExport'
            });

            expect(ui.containerId).toBe('customContainer');
            expect(ui.rowCountId).toBe('customRowCount');
            expect(ui.queryTimeId).toBe('customQueryTime');
            expect(ui.exportButtonId).toBe('customExport');
        });

        it('should warn if no DOM adapter provided', () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn');
            const ui = new ResultsViewUI({
                exportService: mockExportService,
                toastManager: mockToastManager,
                domAdapter: null
            });

            ui.initialize();

            expect(consoleWarnSpy).toHaveBeenCalledWith('ResultsViewUI: No DOM adapter provided');
        });

        it('should setup export button event listener', () => {
            resultsViewUI.initialize();

            expect(mockDOMAdapter.on).toHaveBeenCalledWith(
                mockElements.exportResultsBtn,
                'click',
                expect.any(Function)
            );
        });

        it('should create default ExportService if not provided', () => {
            const ui = new ResultsViewUI({
                toastManager: mockToastManager,
                domAdapter: mockDOMAdapter
            });

            expect(ui.exportService).toBeInstanceOf(ExportService);
        });
    });

    describe('display results', () => {
        beforeEach(() => {
            resultsViewUI.initialize();
        });

        it('should display query results', () => {
            resultsViewUI.displayResults(mockResults, '0.5s');

            expect(resultsViewUI.currentResults).toBe(mockResults);
            expect(resultsViewUI.currentExecutionTime).toBe('0.5s');
        });

        it('should update row count metadata', () => {
            resultsViewUI.displayResults(mockResults);

            expect(mockDOMAdapter.setText).toHaveBeenCalledWith('rowCount', '3 rows');
        });

        it('should update execution time metadata', () => {
            resultsViewUI.displayResults(mockResults, '1.2');

            expect(mockDOMAdapter.setText).toHaveBeenCalledWith('queryTime', '(1.2s)');
        });

        it('should show no results message when no columns', () => {
            resultsViewUI.displayResults({ columns: [], rows: [] });

            expect(mockDOMAdapter.setHTML).toHaveBeenCalledWith(
                mockElements.resultsContainer,
                expect.stringContaining('No results returned')
            );
        });

        it('should show empty result message when no rows', () => {
            resultsViewUI.displayResults({ columns: ['id'], rows: [] });

            expect(mockDOMAdapter.setHTML).toHaveBeenCalledWith(
                mockElements.resultsContainer,
                expect.stringContaining('No rows returned')
            );
        });

        it('should build results table HTML', () => {
            resultsViewUI.displayResults(mockResults);

            expect(mockDOMAdapter.setHTML).toHaveBeenCalledWith(
                mockElements.resultsContainer,
                expect.stringContaining('<table>')
            );
        });

        it('should include table headers', () => {
            resultsViewUI.displayResults(mockResults);

            const htmlArg = mockDOMAdapter.setHTML.mock.calls[0][1];
            expect(htmlArg).toContain('<thead>');
            expect(htmlArg).toContain('id');
            expect(htmlArg).toContain('name');
            expect(htmlArg).toContain('value');
        });

        it('should include table rows', () => {
            resultsViewUI.displayResults(mockResults);

            const htmlArg = mockDOMAdapter.setHTML.mock.calls[0][1];
            expect(htmlArg).toContain('<tbody>');
            expect(htmlArg).toContain('Alice');
            expect(htmlArg).toContain('Bob');
        });

        it('should format NULL values', () => {
            resultsViewUI.displayResults(mockResults);

            const htmlArg = mockDOMAdapter.setHTML.mock.calls[0][1];
            expect(htmlArg).toContain('null-value');
        });

        it('should format number values', () => {
            resultsViewUI.displayResults(mockResults);

            const htmlArg = mockDOMAdapter.setHTML.mock.calls[0][1];
            expect(htmlArg).toContain('number-value');
        });

        it('should not display without DOM adapter', () => {
            const ui = new ResultsViewUI({
                exportService: mockExportService,
                toastManager: mockToastManager,
                domAdapter: null
            });

            expect(() => ui.displayResults(mockResults)).not.toThrow();
        });

        it('should not display without container element', () => {
            mockDOMAdapter.getElementById.mockReturnValue(null);

            expect(() => resultsViewUI.displayResults(mockResults)).not.toThrow();
        });
    });

    describe('display error', () => {
        beforeEach(() => {
            resultsViewUI.initialize();
        });

        it('should display error message', () => {
            resultsViewUI.displayError('Table not found');

            expect(mockDOMAdapter.setHTML).toHaveBeenCalledWith(
                mockElements.resultsContainer,
                expect.stringContaining('Error')
            );
        });

        it('should escape HTML in error message', () => {
            resultsViewUI.displayError('<script>alert("xss")</script>');

            const htmlArg = mockDOMAdapter.setHTML.mock.calls[0][1];
            expect(htmlArg).not.toContain('<script>');
        });

        it('should update row count to show Error', () => {
            resultsViewUI.displayError('Test error');

            expect(mockDOMAdapter.setText).toHaveBeenCalledWith('rowCount', 'Error');
        });

        it('should clear execution time on error', () => {
            resultsViewUI.displayError('Test error');

            expect(mockDOMAdapter.setText).toHaveBeenCalledWith('queryTime', '');
        });

        it('should log error if no DOM adapter', () => {
            const consoleErrorSpy = vi.spyOn(console, 'error');
            const ui = new ResultsViewUI({
                exportService: mockExportService,
                toastManager: mockToastManager,
                domAdapter: null
            });

            ui.displayError('Test error');

            expect(consoleErrorSpy).toHaveBeenCalledWith('ResultsViewUI Error:', 'Test error');
        });
    });

    describe('export functionality', () => {
        beforeEach(() => {
            resultsViewUI.initialize();
            resultsViewUI.displayResults(mockResults);
        });

        it('should export results as CSV', async () => {
            await resultsViewUI.exportResults('CSV');

            expect(mockExportService.exportToCSV).toHaveBeenCalledWith(mockResults);
        });

        it('should export results as JSON', async () => {
            await resultsViewUI.exportResults('JSON');

            expect(mockExportService.exportToJSON).toHaveBeenCalledWith(mockResults);
        });

        it('should trigger download after export', async () => {
            await resultsViewUI.exportResults('CSV');

            expect(Blob).toHaveBeenCalled();
            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(document.createElement).toHaveBeenCalledWith('a');
        });

        it('should show success toast after export', async () => {
            await resultsViewUI.exportResults('CSV');

            expect(mockToastManager.showSuccess).toHaveBeenCalledWith('Results exported as CSV');
        });

        it('should show warning if no results to export', async () => {
            resultsViewUI.currentResults = null;

            await resultsViewUI.exportResults('CSV');

            expect(mockToastManager.showWarning).toHaveBeenCalledWith('No results to export');
        });

        it('should show warning if no rows in results', async () => {
            resultsViewUI.currentResults = { columns: ['id'], rows: [] };

            await resultsViewUI.exportResults('CSV');

            expect(mockToastManager.showWarning).toHaveBeenCalledWith('No results to export');
        });

        it('should show error toast if export fails', async () => {
            mockExportService.exportToCSV.mockRejectedValue(new Error('Export failed'));

            await resultsViewUI.exportResults('CSV');

            expect(mockToastManager.showError).toHaveBeenCalledWith(expect.stringContaining('Export failed'));
        });

        it('should handle export without toast manager', async () => {
            const ui = new ResultsViewUI({
                exportService: mockExportService,
                toastManager: null,
                domAdapter: mockDOMAdapter
            });
            ui.initialize();
            ui.displayResults(mockResults);

            await ui.exportResults('CSV');

            expect(mockExportService.exportToCSV).toHaveBeenCalled();
        });
    });

    describe('sorting functionality', () => {
        beforeEach(() => {
            resultsViewUI.initialize();
            resultsViewUI.displayResults(mockResults);

            // Mock querySelector for sorting
            mockDOMAdapter.querySelector.mockReturnValue({
                getAttribute: vi.fn(() => 'name'),
                classList: { add: vi.fn(), remove: vi.fn() }
            });
            mockDOMAdapter.querySelectorAll.mockReturnValue([
                {
                    getAttribute: vi.fn(() => 'name'),
                    classList: { add: vi.fn(), remove: vi.fn() }
                }
            ]);
        });

        it('should sort column ascending', () => {
            resultsViewUI.sortColumn('name');

            expect(resultsViewUI.currentResults.rows[0].name).toBe('Alice');
            expect(resultsViewUI.currentResults.rows[2].name).toBe('Charlie');
        });

        it('should sort column descending on second click', () => {
            // First sort
            resultsViewUI.sortColumn('name');
            // Second sort on same column
            resultsViewUI.sortColumn('name');

            // Should be reversed
            expect(resultsViewUI.currentResults.rows[0].name).toBe('Charlie');
            expect(resultsViewUI.currentResults.rows[2].name).toBe('Alice');
        });

        it('should handle null values in sorting', () => {
            resultsViewUI.sortColumn('value');

            // NULL should be at the end
            expect(resultsViewUI.currentResults.rows[2].value).toBeNull();
        });

        it('should sort numbers numerically', () => {
            resultsViewUI.sortColumn('value');

            expect(resultsViewUI.currentResults.rows[0].value).toBe(100);
            expect(resultsViewUI.currentResults.rows[1].value).toBe(200);
        });

        it('should not sort without current results', () => {
            resultsViewUI.currentResults = null;

            expect(() => resultsViewUI.sortColumn('name')).not.toThrow();
        });

        it('should not sort empty results', () => {
            resultsViewUI.currentResults = { columns: ['id'], rows: [] };

            expect(() => resultsViewUI.sortColumn('name')).not.toThrow();
        });
    });

    describe('export format prompt', () => {
        beforeEach(() => {
            resultsViewUI.initialize();
        });

        it('should prompt for export format on button click', () => {
            const clickHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.exportResultsBtn && call[1] === 'click'
            )[2];

            clickHandler();

            expect(prompt).toHaveBeenCalled();
        });

        it('should export CSV when user selects 1', async () => {
            global.prompt = vi.fn(() => '1');
            const exportSpy = vi.spyOn(resultsViewUI, 'exportResults');

            const clickHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.exportResultsBtn && call[1] === 'click'
            )[2];

            await clickHandler();

            expect(exportSpy).toHaveBeenCalledWith('CSV');
        });

        it('should export JSON when user selects 2', async () => {
            global.prompt = vi.fn(() => '2');
            const exportSpy = vi.spyOn(resultsViewUI, 'exportResults');

            const clickHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.exportResultsBtn && call[1] === 'click'
            )[2];

            await clickHandler();

            expect(exportSpy).toHaveBeenCalledWith('JSON');
        });

        it('should not export for invalid selection', async () => {
            global.prompt = vi.fn(() => '3');
            const exportSpy = vi.spyOn(resultsViewUI, 'exportResults');

            const clickHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.exportResultsBtn && call[1] === 'click'
            )[2];

            await clickHandler();

            expect(exportSpy).not.toHaveBeenCalled();
        });
    });

    describe('getters and clear', () => {
        it('should return current results', () => {
            resultsViewUI.currentResults = mockResults;

            expect(resultsViewUI.getCurrentResults()).toBe(mockResults);
        });

        it('should return null when no results', () => {
            expect(resultsViewUI.getCurrentResults()).toBeNull();
        });

        it('should clear results', () => {
            resultsViewUI.initialize();
            resultsViewUI.displayResults(mockResults);

            resultsViewUI.clearResults();

            expect(resultsViewUI.currentResults).toBeNull();
            expect(resultsViewUI.currentExecutionTime).toBeNull();
        });

        it('should reset metadata on clear', () => {
            resultsViewUI.initialize();
            resultsViewUI.displayResults(mockResults);

            resultsViewUI.clearResults();

            expect(mockDOMAdapter.setText).toHaveBeenCalledWith('rowCount', '0 rows');
            expect(mockDOMAdapter.setText).toHaveBeenCalledWith('queryTime', '');
        });
    });

    describe('edge cases', () => {
        it('should handle missing DOM elements gracefully', () => {
            mockDOMAdapter.getElementById.mockReturnValue(null);

            expect(() => resultsViewUI.initialize()).not.toThrow();
        });

        it('should handle very large result sets', () => {
            const largeResults = {
                columns: ['id'],
                rows: Array.from({ length: 10000 }, (_, i) => ({ id: i }))
            };

            expect(() => resultsViewUI.displayResults(largeResults)).not.toThrow();
        });

        it('should truncate large result sets in display', () => {
            const largeResults = {
                columns: ['id'],
                rows: Array.from({ length: 10000 }, (_, i) => ({ id: i }))
            };

            resultsViewUI.initialize();
            resultsViewUI.displayResults(largeResults);

            const htmlArg = mockDOMAdapter.setHTML.mock.calls[0][1];
            expect(htmlArg).toContain('Showing first 1,000');
        });

        it('should handle special characters in data', () => {
            const specialResults = {
                columns: ['name'],
                rows: [{ name: '<script>alert("xss")</script>' }]
            };

            resultsViewUI.initialize();
            resultsViewUI.displayResults(specialResults);

            const htmlArg = mockDOMAdapter.setHTML.mock.calls[0][1];
            expect(htmlArg).not.toContain('<script>alert');
        });

        it('should handle Unicode characters', () => {
            const unicodeResults = {
                columns: ['name'],
                rows: [{ name: '中文 émoji 🎉' }]
            };

            expect(() => resultsViewUI.displayResults(unicodeResults)).not.toThrow();
        });

        it('should handle object values', () => {
            const objectResults = {
                columns: ['data'],
                rows: [{ data: { nested: { value: 123 } } }]
            };

            resultsViewUI.initialize();
            resultsViewUI.displayResults(objectResults);

            const htmlArg = mockDOMAdapter.setHTML.mock.calls[0][1];
            expect(htmlArg).toContain('object-value');
        });

        it('should handle boolean values', () => {
            const boolResults = {
                columns: ['active'],
                rows: [{ active: true }, { active: false }]
            };

            expect(() => resultsViewUI.displayResults(boolResults)).not.toThrow();
        });

        it('should handle date values', () => {
            const dateResults = {
                columns: ['created'],
                rows: [{ created: new Date('2024-01-01') }]
            };

            expect(() => resultsViewUI.displayResults(dateResults)).not.toThrow();
        });

        it('should handle empty column names', () => {
            const emptyColResults = {
                columns: ['', 'id'],
                rows: [{ '': 'empty', id: 1 }]
            };

            expect(() => resultsViewUI.displayResults(emptyColResults)).not.toThrow();
        });

        it('should handle columns with special characters', () => {
            const specialColResults = {
                columns: ['user-name', 'user_email', 'user.id'],
                rows: [{ 'user-name': 'Test', 'user_email': 'test@test.com', 'user.id': 1 }]
            };

            expect(() => resultsViewUI.displayResults(specialColResults)).not.toThrow();
        });
    });
});
