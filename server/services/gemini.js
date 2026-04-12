/**
 * Gemini API client — calls Google's generative AI endpoint.
 * Returns full response (no streaming).
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Call Gemini API and return the generated text + token counts.
 *
 * @param {string} systemPrompt - System instruction
 * @param {string} userPrompt - User message
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number }>}
 */
export async function generateHint(systemPrompt, userPrompt) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return null; // signals caller to use mock
    }

    const body = {
        contents: [{
            role: 'user',
            parts: [{ text: userPrompt }]
        }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
        generationConfig: {
            maxOutputTokens: 200,
            temperature: 0.7,
            topP: 0.9
        }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000) // 10s timeout
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
