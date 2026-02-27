/**
 * Vitest Setup File
 * Global test configuration and mocks
 */

import { vi } from 'vitest';

// Mock CodeMirror globally
global.CodeMirror = vi.fn((element, options) => ({
    getValue: vi.fn(() => options?.value || ''),
    setValue: vi.fn(),
    focus: vi.fn(),
    on: vi.fn(),
    getOption: vi.fn((key) => options?.[key]),
    setOption: vi.fn(),
    execCommand: vi.fn(),
    lineCount: vi.fn(() => 0),
    getLine: vi.fn(() => ''),
    cursorCoords: vi.fn(() => ({ top: 0, left: 0 })),
    charCoords: vi.fn(() => ({ top: 0, left: 0 })),
    coordsChar: vi.fn(() => ({ line: 0, ch: 0 })),
    refresh: vi.fn(),
    addKeyMap: vi.fn(),
    removeKeyMap: vi.fn(),
    getDoc: vi.fn(() => ({
        getValue: vi.fn(() => options?.value || ''),
        setValue: vi.fn(),
        markText: vi.fn(),
        getCursor: vi.fn(() => ({ line: 0, ch: 0 })),
        replaceRange: vi.fn(),
        getSelection: vi.fn(() => '')
    }))
}));

// Mock localStorage
const localStorageMock = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(() => {}),
    removeItem: vi.fn(() => {}),
    clear: vi.fn(() => {}),
    get length() { return 0; },
    key: vi.fn(() => null)
};
global.localStorage = localStorageMock;

// Mock performance API
global.performance = {
    now: vi.fn(() => Date.now())
};

// Mock File API - Override jsdom's File implementation
delete global.File;

global.File = class MockFile {
    constructor(bits, name, options = {}) {
        this.bits = bits;
        this.name = name;
        // Always use options.size if explicitly provided
        this.size = options?.size ?? (bits[0]?.length ?? 0);
        this.type = options?.type ?? 'text/plain';
        this.lastModified = options?.lastModified ?? Date.now();
    }
};

// Ensure the mock is properly set
Object.defineProperty(global, 'File', {
    value: global.File,
    writable: false,
    configurable: false
});

// Mock FileReader API
global.FileReader = class MockFileReader {
    constructor() {
        this.readyState = 0;
        this.result = null;
        this.error = null;
        this.onload = null;
        this.onerror = null;
        setTimeout(() => {
            this.readyState = 2;
            if (this.onload) {
                this.onload({ target: this });
            }
        }, 0);
    }

    readAsText(file) {
        this.result = typeof file.bits === 'string' ? file.bits : file.bits[0];
    }

    readAsArrayBuffer(file) {
        this.result = new TextEncoder().encode(
            typeof file.bits === 'string' ? file.bits : file.bits[0]
        ).buffer;
    }

    readAsDataURL(file) {
        this.result = `data:${file.type};base64,${btoa(
            typeof file.bits === 'string' ? file.bits : file.bits[0]
        )}`;
    }
};

// Setup global test utilities
global.createMockDOM = () => {
    const elements = new Map();
    const eventListeners = new Map();

    return {
        elements,
        eventListeners,
        _mockElement: (id, element) => {
            elements.set(id, {
                ...element,
                addEventListener: (event, handler) => {
                    if (!eventListeners.has(event)) {
                        eventListeners.set(event, []);
                    }
                    eventListeners.get(event).push(handler);
                },
                removeEventListener: (event, handler) => {
                    if (eventListeners.has(event)) {
                        const handlers = eventListeners.get(event);
                        const index = handlers.indexOf(handler);
                        if (index > -1) {
                            handlers.splice(index, 1);
                        }
                    }
                },
                click: () => {
                    const clickHandlers = eventListeners.get('click') || [];
                    clickHandlers.forEach(handler => handler(new Event('click')));
                }
            });
        },
        getElementById: (id) => elements.get(id) || null,
        querySelector: (selector) => {
            // Simple implementation for testing
            const id = selector.replace('#', '');
            return elements.get(id) || null;
        },
        _triggerEvent: (elementId, event, eventData) => {
            const handlers = eventListeners.get(event) || [];
            handlers.forEach(handler => handler(eventData || new Event(event)));
        }
    };
};

// Mock window.alert
global.alert = vi.fn();

// Mock window.confirm
global.confirm = vi.fn(() => true);

// Mock window.prompt
global.prompt = vi.fn(() => null);

// Mock Blob
global.Blob = class MockBlob {
    constructor(parts, options = {}) {
        this.parts = parts;
        this.type = options.type || '';
        this.size = parts.reduce((acc, part) => acc + (part?.length || 0), 0);
    }
};

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = vi.fn();

console.log('✅ Vitest setup complete - global mocks configured');
