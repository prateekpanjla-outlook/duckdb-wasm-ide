/**
 * Gemini API client — calls Google's generative AI endpoint.
 * Returns full response (no streaming).
 *
 * All config is parameterized via environment variables:
 *   GEMINI_API_KEY       — API key (required for real calls; absent = mock mode)
 *   GEMINI_API_URL       — API endpoint (default: Gemini 2.0 Flash)
 *   GEMINI_MODEL         — Model name (default: gemini-2.0-flash)
 *   GEMINI_MAX_TOKENS    — Max output tokens (default: 200)
 *   GEMINI_TEMPERATURE   — Randomness 0-1 (default: 0.7)
 *   GEMINI_TIMEOUT_MS    — Request timeout in ms (default: 10000)
 */

const BASE_URL = process.env.GEMINI_API_URL
    || 'https://generativelanguage.googleapis.com/v1beta/models';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const MAX_TOKENS = parseInt(process.env.GEMINI_MAX_TOKENS || '200', 10);
const TEMPERATURE = parseFloat(process.env.GEMINI_TEMPERATURE || '0.7');
const TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS || '10000', 10);

/**
 * Call Gemini API and return the generated text + token counts.
 *
 * @param {string} systemPrompt - System instruction
 * @param {string} userPrompt - User message
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number } | null>}
 *          null if no API key (signals caller to use mock)
 */
export async function generateHint(systemPrompt, userPrompt) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return null; // signals caller to use mock
    }

    const url = `${BASE_URL}/${MODEL}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{
            role: 'user',
            parts: [{ text: userPrompt }]
        }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
        generationConfig: {
            maxOutputTokens: MAX_TOKENS,
            temperature: TEMPERATURE,
            topP: 0.9
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${error}`);
    }

    const data = await response.json();

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

    return { text, inputTokens, outputTokens };
}
