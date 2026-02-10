/**
 * DOMAdapter - Abstract interface for DOM operations
 * This allows mocking DOM interactions for testing
 */
export class DOMAdapter {
    /**
     * Get an element by its ID
     * @param {string} id - The element ID
     * @returns {HTMLElement|null}
     */
    getElementById(id) {
        return document.getElementById(id);
    }

    /**
     * Query for a single element using CSS selector
     * @param {string} selector - CSS selector
     * @returns {HTMLElement|null}
     */
    querySelector(selector) {
        return document.querySelector(selector);
    }

    /**
     * Query for all elements using CSS selector
     * @param {string} selector - CSS selector
     * @returns {NodeList}
     */
    querySelectorAll(selector) {
        return document.querySelectorAll(selector);
    }

    /**
     * Set the HTML content of an element
     * @param {string|HTMLElement} element - Element ID or element reference
     * @param {string} html - HTML content
     */
    setHTML(element, html) {
        const el = typeof element === 'string' ? this.getElementById(element) : element;
        if (el) {
            el.innerHTML = html;
        }
    }

    /**
     * Set the text content of an element
     * @param {string|HTMLElement} element - Element ID or element reference
     * @param {string} text - Text content
     */
    setText(element, text) {
        const el = typeof element === 'string' ? this.getElementById(element) : element;
        if (el) {
            el.textContent = text;
        }
    }

    /**
     * Add a class to an element
     * @param {string|HTMLElement} element - Element ID or element reference
     * @param {string} className - Class name to add
     */
    addClass(element, className) {
        const el = typeof element === 'string' ? this.getElementById(element) : element;
        if (el) {
            el.classList.add(className);
        }
    }

    /**
     * Remove a class from an element
     * @param {string|HTMLElement} element - Element ID or element reference
     * @param {string} className - Class name to remove
     */
    removeClass(element, className) {
        const el = typeof element === 'string' ? this.getElementById(element) : element;
        if (el) {
            el.classList.remove(className);
        }
    }

    /**
     * Toggle a class on an element
     * @param {string|HTMLElement} element - Element ID or element reference
     * @param {string} className - Class name to toggle
     * @param {boolean} force - Optional force state
     */
    toggleClass(element, className, force) {
        const el = typeof element === 'string' ? this.getElementById(element) : element;
        if (el) {
            el.classList.toggle(className, force);
        }
    }

    /**
     * Add an event listener to an element
     * @param {string|HTMLElement} element - Element ID or element reference
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} options - Event listener options
     */
    on(element, event, handler, options = {}) {
        const el = typeof element === 'string' ? this.getElementById(element) : element;
        if (el) {
            el.addEventListener(event, handler, options);
        }
    }

    /**
     * Remove an event listener from an element
     * @param {string|HTMLElement} element - Element ID or element reference
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    off(element, event, handler) {
        const el = typeof element === 'string' ? this.getElementById(element) : element;
        if (el) {
            el.removeEventListener(event, handler);
        }
    }

    /**
     * Create a new element
     * @param {string} tag - HTML tag name
     * @param {Object} attributes - Optional attributes
     * @returns {HTMLElement}
     */
    createElement(tag, attributes = {}) {
        const element = document.createElement(tag);
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'textContent') {
                element.textContent = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else {
                element.setAttribute(key, value);
            }
        });
        return element;
    }

    /**
     * Show an element (remove hidden class)
     * @param {string|HTMLElement} element - Element ID or element reference
     */
    show(element) {
        this.removeClass(element, 'hidden');
    }

    /**
     * Hide an element (add hidden class)
     * @param {string|HTMLElement} element - Element ID or element reference
     */
    hide(element) {
        this.addClass(element, 'hidden');
    }

    /**
     * Check if an element is visible
     * @param {string|HTMLElement} element - Element ID or element reference
     * @returns {boolean}
     */
    isVisible(element) {
        const el = typeof element === 'string' ? this.getElementById(element) : element;
        return el && !el.classList.contains('hidden');
    }
}
