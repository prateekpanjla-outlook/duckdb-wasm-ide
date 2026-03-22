/**
 * Application Configuration
 * Centralizes configuration values used across the app
 */

const hostname = window.location.hostname;
const port = window.location.port;

// In production (same Express server), API is on the same origin.
// In dev, static server (8888/8903) is separate from backend (3000/3015).
const devPorts = { '8888': '3000', '8903': '3015' };
const API_PORT = devPorts[port] || port || '3000';

export const API_BASE_URL = port
    ? `http://${hostname}:${API_PORT}/api`
    : `/api`;
