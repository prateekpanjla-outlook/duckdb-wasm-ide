/**
 * Application Configuration
 * Centralizes configuration values used across the app
 */

const hostname = window.location.hostname;
const API_PORT = 3000;

export const API_BASE_URL = `http://${hostname}:${API_PORT}/api`;
