/**
 * Unit Tests for FileUploadUI
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileUploadUI } from '../../../js/ui/FileUploadUI.js';
import { FileProcessingResult } from '../../../js/services/FileService.js';

describe('FileUploadUI', () => {
    let fileUploadUI;
    let mockFileService;
    let mockToastManager;
    let mockDOMAdapter;
    let mockElements;

    beforeEach(() => {
        // Mock DOM elements
        mockElements = {
            dropZone: {
                addEventListener: vi.fn(),
                classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }
            },
            fileInput: {
                addEventListener: vi.fn(),
                click: vi.fn(),
                value: ''
            },
            fileInfo: {
                textContent: '',
                classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }
            },
            clearButton: {
                addEventListener: vi.fn()
            }
        };

        // Mock DOM adapter
        mockDOMAdapter = {
            getElementById: vi.fn((id) => {
                if (id === 'dropZone') return mockElements.dropZone;
                if (id === 'fileInput') return mockElements.fileInput;
                if (id === 'fileInfo') return mockElements.fileInfo;
                if (id === 'clearButton') return mockElements.clearButton;
                return null;
            }),
            addClass: vi.fn((idOrElement, className) => {
                const el = typeof idOrElement === 'string'
                    ? mockDOMAdapter.getElementById(idOrElement)
                    : idOrElement;
                if (el && el.classList) el.classList.add(className);
            }),
            removeClass: vi.fn((idOrElement, className) => {
                const el = typeof idOrElement === 'string'
                    ? mockDOMAdapter.getElementById(idOrElement)
                    : idOrElement;
                if (el && el.classList) el.classList.remove(className);
            }),
            show: vi.fn((idOrElement) => {
                const el = typeof idOrElement === 'string'
                    ? mockDOMAdapter.getElementById(idOrElement)
                    : idOrElement;
                if (el && el.classList) el.classList.remove('hidden');
            }),
            hide: vi.fn((idOrElement) => {
                const el = typeof idOrElement === 'string'
                    ? mockDOMAdapter.getElementById(idOrElement)
                    : idOrElement;
                if (el && el.classList) el.classList.add('hidden');
            }),
            setText: vi.fn((idOrElement, text) => {
                const el = typeof idOrElement === 'string'
                    ? mockDOMAdapter.getElementById(idOrElement)
                    : idOrElement;
                if (el) el.textContent = text;
            }),
            on: vi.fn((element, event, handler) => {
                if (element && element.addEventListener) {
                    element.addEventListener(event, handler);
                }
            })
        };

        // Mock FileService
        mockFileService = {
            processFile: vi.fn().mockResolvedValue(
                new FileProcessingResult('test.csv', 'test_table', 1024, 'csv')
            )
        };

        // Mock ToastManager
        mockToastManager = {
            initialize: vi.fn(),
            showSuccess: vi.fn(),
            showError: vi.fn(),
            showWarning: vi.fn(),
            showInfo: vi.fn(),
            show: vi.fn()
        };

        // Create FileUploadUI
        fileUploadUI = new FileUploadUI({
            fileService: mockFileService,
            toastManager: mockToastManager,
            domAdapter: mockDOMAdapter
        });
    });

    describe('initialization', () => {
        it('should initialize with provided dependencies', () => {
            expect(fileUploadUI.fileService).toBe(mockFileService);
            expect(fileUploadUI.toastManager).toBe(mockToastManager);
            expect(fileUploadUI.domAdapter).toBe(mockDOMAdapter);
        });

        it('should initialize without DOM adapter', () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn');
            const ui = new FileUploadUI({
                fileService: mockFileService,
                toastManager: mockToastManager,
                domAdapter: null
            });

            ui.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');

            expect(consoleWarnSpy).toHaveBeenCalledWith('FileUploadUI: No DOM adapter provided');
        });

        it('should setup drop zone events', () => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');

            expect(mockDOMAdapter.on).toHaveBeenCalledWith(
                mockElements.dropZone,
                'dragover',
                expect.any(Function)
            );
            expect(mockDOMAdapter.on).toHaveBeenCalledWith(
                mockElements.dropZone,
                'dragleave',
                expect.any(Function)
            );
            expect(mockDOMAdapter.on).toHaveBeenCalledWith(
                mockElements.dropZone,
                'drop',
                expect.any(Function)
            );
            expect(mockDOMAdapter.on).toHaveBeenCalledWith(
                mockElements.dropZone,
                'click',
                expect.any(Function)
            );
        });

        it('should setup file input events', () => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');

            expect(mockDOMAdapter.on).toHaveBeenCalledWith(
                mockElements.fileInput,
                'change',
                expect.any(Function)
            );
        });

        it('should setup clear button events', () => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');

            expect(mockDOMAdapter.on).toHaveBeenCalledWith(
                mockElements.clearButton,
                'click',
                expect.any(Function)
            );
        });

        it('should initialize toast manager', () => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');

            expect(mockToastManager.initialize).toHaveBeenCalled();
        });
    });

    describe('drag and drop handling', () => {
        beforeEach(() => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');
        });

        it('should add dragover class on dragover event', () => {
            const dragoverHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.dropZone && call[1] === 'dragover'
            )[2];

            const mockEvent = { preventDefault: vi.fn() };
            dragoverHandler(mockEvent);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(mockDOMAdapter.addClass).toHaveBeenCalledWith('dropZone', 'dragover');
        });

        it('should remove dragover class on dragleave event', () => {
            const dragleaveHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.dropZone && call[1] === 'dragleave'
            )[2];

            dragleaveHandler();

            expect(mockDOMAdapter.removeClass).toHaveBeenCalledWith('dropZone', 'dragover');
        });

        it('should handle file drop', async () => {
            const dropHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.dropZone && call[1] === 'drop'
            )[2];

            const mockFile = new File(['id,name\n1,Alice'], 'test.csv', { type: 'text/csv' });
            const mockEvent = {
                preventDefault: vi.fn(),
                dataTransfer: { files: [mockFile] }
            };

            await dropHandler(mockEvent);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(mockDOMAdapter.removeClass).toHaveBeenCalledWith('dropZone', 'dragover');
            expect(mockFileService.processFile).toHaveBeenCalledWith(mockFile);
        });

        it('should trigger file input click on drop zone click', () => {
            const clickHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.dropZone && call[1] === 'click'
            )[2];

            clickHandler();

            expect(mockElements.fileInput.click).toHaveBeenCalled();
        });
    });

    describe('file input handling', () => {
        beforeEach(() => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');
        });

        it('should process selected file', async () => {
            const changeHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.fileInput && call[1] === 'change'
            )[2];

            const mockFile = new File(['id,name\n1,Alice'], 'test.csv', { type: 'text/csv' });
            const mockEvent = {
                target: { files: [mockFile] }
            };

            await changeHandler(mockEvent);

            expect(mockFileService.processFile).toHaveBeenCalledWith(mockFile);
        });
    });

    describe('file processing', () => {
        beforeEach(() => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');
        });

        it('should handle successful file processing', async () => {
            const mockFile = new File(['id,name\n1,Alice'], 'test.csv', { type: 'text/csv' });

            await fileUploadUI.handleFileDrop(mockFile);

            expect(fileUploadUI.currentFile).toBe(mockFile);
            expect(fileUploadUI.currentTableName).toBe('test_table');
            expect(mockToastManager.showSuccess).toHaveBeenCalled();
        });

        it('should display file info after successful load', async () => {
            const mockFile = new File(['id,name\n1,Alice'], 'test.csv', { type: 'text/csv' });

            await fileUploadUI.handleFileDrop(mockFile);

            expect(mockDOMAdapter.setText).toHaveBeenCalledWith(
                mockElements.fileInfo,
                expect.stringContaining('test.csv')
            );
            expect(mockDOMAdapter.show).toHaveBeenCalledWith('fileInfo');
            expect(mockDOMAdapter.hide).toHaveBeenCalledWith('dropZone');
        });

        it('should show loading state during processing', async () => {
            const mockFile = new File(['id,name\n1,Alice'], 'test.csv', { type: 'text/csv' });

            // Make processing slower to check loading state
            let resolveProcess;
            mockFileService.processFile.mockReturnValue(
                new Promise(resolve => {
                    resolveProcess = resolve;
                })
            );

            const processingPromise = fileUploadUI.handleFileDrop(mockFile);

            expect(mockDOMAdapter.addClass).toHaveBeenCalledWith('dropZone', 'loading');

            resolveProcess(new FileProcessingResult('test.csv', 'test_table', 1024, 'csv'));
            await processingPromise;

            expect(mockDOMAdapter.removeClass).toHaveBeenCalledWith('dropZone', 'loading');
        });

        it('should handle file processing errors', async () => {
            const error = new Error('File validation failed');
            mockFileService.processFile.mockRejectedValue(error);

            const mockFile = new File(['invalid'], 'test.txt', { type: 'text/plain' });

            await fileUploadUI.handleFileDrop(mockFile);

            expect(mockToastManager.showError).toHaveBeenCalledWith(
                expect.stringContaining('Error loading file')
            );
            expect(fileUploadUI.currentFile).toBeNull();
            expect(fileUploadUI.currentTableName).toBeNull();
        });

        it('should call onFileLoaded callback if provided', async () => {
            const onFileLoadedCallback = vi.fn();
            fileUploadUI.onFileLoaded = onFileLoadedCallback;

            const mockFile = new File(['id,name\n1,Alice'], 'test.csv', { type: 'text/csv' });

            await fileUploadUI.handleFileDrop(mockFile);

            expect(onFileLoadedCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    fileName: 'test.csv',
                    tableName: 'test_table'
                })
            );
        });

        it('should show error if file service not initialized', async () => {
            const noServiceUI = new FileUploadUI({
                fileService: null,
                toastManager: mockToastManager,
                domAdapter: mockDOMAdapter
            });

            const mockFile = new File(['data'], 'test.csv', { type: 'text/csv' });

            await noServiceUI.handleFileDrop(mockFile);

            expect(mockToastManager.showError).toHaveBeenCalledWith('File service not initialized');
        });
    });

    describe('clear file', () => {
        beforeEach(() => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');

            // Set current file
            fileUploadUI.currentFile = new File(['data'], 'test.csv', { type: 'text/csv' });
            fileUploadUI.currentTableName = 'test_table';
        });

        it('should clear current file and table name', () => {
            fileUploadUI.clearFile();

            expect(fileUploadUI.currentFile).toBeNull();
            expect(fileUploadUI.currentTableName).toBeNull();
        });

        it('should hide file info and show drop zone', () => {
            fileUploadUI.clearFile();

            expect(mockDOMAdapter.hide).toHaveBeenCalledWith('fileInfo');
            expect(mockDOMAdapter.show).toHaveBeenCalledWith('dropZone');
        });

        it('should clear file input value', () => {
            mockElements.fileInput.value = 'some-value';

            fileUploadUI.clearFile();

            expect(mockElements.fileInput.value).toBe('');
        });

        it('should be called on clear button click', () => {
            const clearSpy = vi.spyOn(fileUploadUI, 'clearFile');

            const clickHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.clearButton && call[1] === 'click'
            )[2];

            clickHandler();

            expect(clearSpy).toHaveBeenCalled();
        });
    });

    describe('getters', () => {
        it('should return current table name', () => {
            fileUploadUI.currentTableName = 'my_table';

            expect(fileUploadUI.getCurrentTableName()).toBe('my_table');
        });

        it('should return null when no table loaded', () => {
            expect(fileUploadUI.getCurrentTableName()).toBeNull();
        });

        it('should return current file', () => {
            const mockFile = new File(['data'], 'test.csv', { type: 'text/csv' });
            fileUploadUI.currentFile = mockFile;

            expect(fileUploadUI.getCurrentFile()).toBe(mockFile);
        });

        it('should return null when no file loaded', () => {
            expect(fileUploadUI.getCurrentFile()).toBeNull();
        });
    });

    describe('edge cases', () => {
        it('should handle missing DOM elements gracefully', () => {
            mockDOMAdapter.getElementById.mockReturnValue(null);

            expect(() => {
                fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');
            }).not.toThrow();
        });

        it('should handle empty file list in drop event', async () => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');

            const dropHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.dropZone && call[1] === 'drop'
            )[2];

            const mockEvent = {
                preventDefault: vi.fn(),
                dataTransfer: { files: [] }
            };

            await dropHandler(mockEvent);

            expect(mockFileService.processFile).not.toHaveBeenCalled();
        });

        it('should handle null dataTransfer in drop event', async () => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');

            const dropHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.dropZone && call[1] === 'drop'
            )[2];

            const mockEvent = {
                preventDefault: vi.fn(),
                dataTransfer: null
            };

            await dropHandler(mockEvent);

            expect(mockFileService.processFile).not.toHaveBeenCalled();
        });

        it('should handle empty file list in change event', async () => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');

            const changeHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.fileInput && call[1] === 'change'
            )[2];

            const mockEvent = {
                target: { files: [] }
            };

            await changeHandler(mockEvent);

            expect(mockFileService.processFile).not.toHaveBeenCalled();
        });

        it('should handle null files in change event', async () => {
            fileUploadUI.initialize('dropZone', 'fileInput', 'fileInfo', 'clearButton');

            const changeHandler = mockDOMAdapter.on.mock.calls.find(
                call => call[0] === mockElements.fileInput && call[1] === 'change'
            )[2];

            const mockEvent = {
                target: { files: null }
            };

            await changeHandler(mockEvent);

            expect(mockFileService.processFile).not.toHaveBeenCalled();
        });
    });
});
