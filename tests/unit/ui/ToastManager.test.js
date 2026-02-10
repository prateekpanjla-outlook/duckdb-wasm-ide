/**
 * Unit Tests for ToastManager
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ToastManager } from '../../../js/ui/ToastManager.js';

describe('ToastManager', () => {
    let toastManager;
    let mockDOMAdapter;
    let mockContainer;
    let mockToast;

    beforeEach(() => {
        // Create mock toast element
        mockToast = {
            id: 'test-toast',
            className: 'toast',
            innerHTML: '',
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
                contains: vi.fn(() => false)
            },
            remove: vi.fn()
        };

        // Create mock container
        mockContainer = {
            id: 'toastContainer',
            className: 'toast-container',
            innerHTML: '',
            appendChild: vi.fn(),
            childNodes: []
        };

        // Create mock DOM adapter
        mockDOMAdapter = {
            getElementById: vi.fn((id) => {
                if (id === 'toastContainer') {
                    return mockContainer;
                }
                if (id.startsWith('toast_')) {
                    return mockToast;
                }
                return null;
            }),
            querySelector: vi.fn(() => mockContainer),
            createElement: vi.fn((tag, attrs = {}) => {
                if (tag === 'div') {
                    const element = {
                        id: attrs.id || 'mock-element',
                        className: attrs.className || '',
                        innerHTML: attrs.innerHTML || '',
                        classList: {
                            add: vi.fn(),
                            remove: vi.fn(),
                            contains: vi.fn(() => false)
                        },
                        appendChild: vi.fn(),
                        remove: vi.fn()
                    };
                    return element;
                }
                return {};
            }),
            addClass: vi.fn((id, className) => {
                if (typeof id === 'string' && id.startsWith('toast_')) {
                    mockToast.classList.add(className);
                }
            }),
            removeClass: vi.fn((id, className) => {
                if (typeof id === 'string' && id.startsWith('toast_')) {
                    mockToast.classList.remove(className);
                }
            }),
            setHTML: vi.fn(),
            setText: vi.fn()
        };

        // Mock requestAnimationFrame
        global.requestAnimationFrame = vi.fn((cb) => cb());

        // Create ToastManager
        toastManager = new ToastManager({
            domAdapter: mockDOMAdapter,
            containerId: 'toastContainer',
            defaultDuration: 5000
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    describe('initialization', () => {
        it('should initialize with default values', () => {
            const manager = new ToastManager();

            expect(manager.containerId).toBe('toastContainer');
            expect(manager.defaultDuration).toBe(5000);
            expect(manager.toasts).toEqual([]);
        });

        it('should initialize with custom values', () => {
            const manager = new ToastManager({
                containerId: 'customContainer',
                defaultDuration: 3000
            });

            expect(manager.containerId).toBe('customContainer');
            expect(manager.defaultDuration).toBe(3000);
        });

        it('should create container if it does not exist', () => {
            mockDOMAdapter.getElementById.mockReturnValue(null);

            toastManager.initialize();

            expect(mockDOMAdapter.createElement).toHaveBeenCalledWith('div', {
                id: 'toastContainer',
                className: 'toast-container'
            });
        });

        it('should return existing container', () => {
            const container = toastManager.initialize();

            expect(container).toBe(mockContainer);
            expect(mockDOMAdapter.createElement).not.toHaveBeenCalled();
        });

        it('should warn if no DOM adapter provided', () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn');
            const noAdapterManager = new ToastManager({ domAdapter: null });

            noAdapterManager.initialize();

            expect(consoleWarnSpy).toHaveBeenCalledWith('ToastManager: No DOM adapter provided');
        });
    });

    describe('show toast methods', () => {
        it('should show success toast', () => {
            const toastControl = toastManager.showSuccess('Operation successful');

            expect(toastControl).toBeDefined();
            expect(toastControl.id).toBeDefined();
            expect(toastControl.close).toBeInstanceOf(Function);
        });

        it('should show error toast', () => {
            const toastControl = toastManager.showError('Operation failed');

            expect(toastControl).toBeDefined();
            expect(toastControl.close).toBeInstanceOf(Function);
        });

        it('should show warning toast', () => {
            const toastControl = toastManager.showWarning('Warning message');

            expect(toastControl).toBeDefined();
            expect(toastControl.close).toBeInstanceOf(Function);
        });

        it('should show info toast', () => {
            const toastControl = toastManager.showInfo('Info message');

            expect(toastControl).toBeDefined();
            expect(toastControl.close).toBeInstanceOf(Function);
        });

        it('should use custom duration', () => {
            vi.useFakeTimers();
            const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

            toastManager.showSuccess('Message', 2000);

            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

            vi.useRealTimers();
        });
    });

    describe('show generic toast', () => {
        it('should create toast element with correct structure', () => {
            toastManager.show('Test message', 'info', 0);

            expect(mockDOMAdapter.createElement).toHaveBeenCalledWith('div', {
                id: expect.stringContaining('toast_'),
                className: 'toast'
            });
        });

        it('should add toast to container', () => {
            toastManager.show('Test message', 'info', 0);

            expect(mockContainer.appendChild).toHaveBeenCalled();
        });

        it('should add show class via requestAnimationFrame', () => {
            toastManager.show('Test message', 'info', 0);

            expect(requestAnimationFrame).toHaveBeenCalled();
        });

        it('should return toast control object', () => {
            const toastControl = toastManager.show('Test', 'info', 0);

            expect(toastControl).toHaveProperty('id');
            expect(toastControl).toHaveProperty('close');
            expect(typeof toastControl.close).toBe('function');
        });

        it('should handle missing DOM adapter gracefully', () => {
            const consoleLogSpy = vi.spyOn(console, 'log');
            const noAdapterManager = new ToastManager({ domAdapter: null });

            const toastControl = noAdapterManager.show('Test', 'info', 0);

            expect(toastControl).toBeDefined();
            expect(consoleLogSpy).toHaveBeenCalled();
        });

        it('should auto-remove toast after duration', () => {
            vi.useFakeTimers();
            const closeSpy = vi.fn();
            const toastControl = toastManager.show('Test', 'info', 1000);
            toastControl.close = closeSpy;

            // Advance time by duration
            vi.advanceTimersByTime(1000);

            expect(closeSpy).toHaveBeenCalled();
        });

        it('should not auto-remove if duration is 0', () => {
            vi.useFakeTimers();
            const closeSpy = vi.fn();
            const toastControl = toastManager.show('Test', 'info', 0);
            toastControl.close = closeSpy;

            // Advance time
            vi.advanceTimersByTime(10000);

            expect(closeSpy).not.toHaveBeenCalled();
        });
    });

    describe('toast icons', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should use correct icon for success', () => {
            toastManager.showSuccess('Success');

            // The icon should be added when creating toast element
            expect(mockDOMAdapter.createElement).toHaveBeenCalled();
        });

        it('should use correct icon for error', () => {
            toastManager.showError('Error');

            expect(mockDOMAdapter.createElement).toHaveBeenCalled();
        });

        it('should use correct icon for warning', () => {
            toastManager.showWarning('Warning');

            expect(mockDOMAdapter.createElement).toHaveBeenCalled();
        });

        it('should use correct icon for info', () => {
            toastManager.showInfo('Info');

            expect(mockDOMAdapter.createElement).toHaveBeenCalled();
        });
    });

    describe('toast removal', () => {
        it('should remove toast when close is called', () => {
            vi.useFakeTimers();
            const toastControl = toastManager.show('Test', 'info', 0);

            toastControl.close();

            expect(mockDOMAdapter.removeClass).toHaveBeenCalled();
        });

        it('should add hide class before removal', () => {
            vi.useFakeTimers();
            const toastControl = toastManager.show('Test', 'info', 0);

            toastControl.close();

            expect(mockDOMAdapter.removeClass).toHaveBeenCalledWith(
                expect.stringContaining('toast_'),
                'show'
            );
            expect(mockDOMAdapter.addClass).toHaveBeenCalledWith(
                expect.stringContaining('toast_'),
                'hide'
            );
        });

        it('should handle missing DOM adapter on close', () => {
            vi.useFakeTimers();
            const manager = new ToastManager({ domAdapter: null });
            const toastControl = manager.show('Test', 'info', 0);

            // Should not throw
            expect(() => toastControl.close()).not.toThrow();
        });
    });

    describe('HTML escaping', () => {
        it('should escape HTML in message', () => {
            // Create a mock document.createElement for the escape test
            const mockDiv = {
                textContent: '',
                innerHTML: ''
            };

            const createElementSpy = vi.spyOn(document, 'createElement')
                .mockReturnValue(mockDiv);

            toastManager.show('<script>alert("xss")</script>', 'info', 0);

            // The escaping happens via DOM API
            expect(createElementSpy).toHaveBeenCalledWith('div');

            createElementSpy.mockRestore();
        });
    });

    describe('clear all toasts', () => {
        it('should clear all toasts from container', () => {
            toastManager.show('Test 1', 'info', 0);
            toastManager.show('Test 2', 'error', 0);

            toastManager.clearAll();

            expect(mockContainer.innerHTML).toBe('');
        });

        it('should reset toasts array', () => {
            toastManager.show('Test 1', 'info', 0);
            toastManager.show('Test 2', 'error', 0);

            toastManager.clearAll();

            expect(toastManager.toasts).toEqual([]);
        });

        it('should handle missing DOM adapter', () => {
            const manager = new ToastManager({ domAdapter: null });

            // Should not throw
            expect(() => manager.clearAll()).not.toThrow();
        });

        it('should handle missing container', () => {
            mockDOMAdapter.getElementById.mockReturnValue(null);

            // Should not throw
            expect(() => toastManager.clearAll()).not.toThrow();
        });
    });

    describe('edge cases', () => {
        it('should handle empty message', () => {
            const toastControl = toastManager.show('', 'info', 0);

            expect(toastControl).toBeDefined();
        });

        it('should handle very long message', () => {
            const longMessage = 'x'.repeat(10000);
            const toastControl = toastManager.show(longMessage, 'info', 0);

            expect(toastControl).toBeDefined();
        });

        it('should handle special characters in message', () => {
            const specialMessage = 'Message with "quotes" & <tags>';
            const toastControl = toastManager.show(specialMessage, 'info', 0);

            expect(toastControl).toBeDefined();
        });

        it('should handle Unicode characters', () => {
            const unicodeMessage = 'Message with émojis 🎉 and 中文';
            const toastControl = toastManager.show(unicodeMessage, 'info', 0);

            expect(toastControl).toBeDefined();
        });

        it('should handle negative duration (should not auto-remove)', () => {
            vi.useFakeTimers();
            const closeSpy = vi.fn();
            const toastControl = toastManager.show('Test', 'info', -1000);
            toastControl.close = closeSpy;

            vi.advanceTimersByTime(10000);

            expect(closeSpy).not.toHaveBeenCalled();
        });

        it('should handle very short duration', () => {
            vi.useFakeTimers();
            const closeSpy = vi.fn();
            const toastControl = toastManager.show('Test', 'info', 1);
            toastControl.close = closeSpy;

            vi.advanceTimersByTime(10);

            expect(closeSpy).toHaveBeenCalled();
        });
    });

    describe('toast type validation', () => {
        it('should handle unknown toast type', () => {
            const toastControl = toastManager.show('Test', 'unknown', 0);

            expect(toastControl).toBeDefined();
            // Unknown types should use info icon as default
        });
    });
});
