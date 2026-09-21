/**
 * Google Gemini Configuration & REST Client
 * Uses Node native fetch with strict timeout and cost/token bounds.
 * Zero external dependencies.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const getGeminiModel = () => {
  return process.env.GEMINI_MODEL || 'gemini-1.5-flash';
};

export const isGeminiConfigured = () => {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
};

/**
 * Call Gemini REST API with strict timeout, token caps, and safe error handling.
 * 
 * @param {Object} options
 * @param {string} options.systemPrompt - Strict system boundary instructions
 * @param {string} options.userMessage - User's query
 * @param {string} options.contextData - Verified database context (books/orders)
 * @param {Array} options.conversationHistory - Recent conversation turns (max 2)
 * @param {number} [options.timeoutMs=8000] - Request timeout in milliseconds
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
export async function callGeminiApi({
  systemPrompt,
  userMessage,
  contextData = '',
  conversationHistory = [],
  timeoutMs = 8000
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      error: 'GEMINI_NOT_CONFIGURED',
      text: null
    };
  }

  const model = getGeminiModel();
  const endpoint = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  // Format contents array with history (limited to last 2 turns)
  const contents = [];

  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-2);
    for (const turn of recentHistory) {
      if (turn.role && turn.text) {
        contents.push({
          role: turn.role === 'assistant' || turn.role === 'model' ? 'model' : 'user',
          parts: [{ text: String(turn.text).slice(0, 300) }]
        });
      }
    }
  }

  // Combine user message with verified database context
  let finalUserPrompt = userMessage.trim();
  if (contextData && contextData.trim()) {
    finalUserPrompt = `Verified Readora Database Context:\n${contextData.trim()}\n\nCustomer Question: ${finalUserPrompt}`;
  }

  contents.push({
    role: 'user',
    parts: [{ text: finalUserPrompt.slice(0, 800) }]
  });

  const requestBody = {
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 250,
      topP: 0.8
    }
  };

  // Add system instruction if provided
  if (systemPrompt && systemPrompt.trim()) {
    requestBody.system_instruction = {
      parts: [{ text: systemPrompt.trim() }]
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      const errorMessage = errorJson?.error?.message || `Gemini API returned status ${response.status}`;
      console.warn(`[Gemini API Warning] ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        text: null
      };
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText || !candidateText.trim()) {
      return {
        success: false,
        error: 'EMPTY_RESPONSE',
        text: null
      };
    }

    return {
      success: true,
      text: candidateText.trim()
    };
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      console.warn(`[Gemini API Timeout] Request exceeded ${timeoutMs}ms limit.`);
      return {
        success: false,
        error: 'REQUEST_TIMEOUT',
        text: null
      };
    }

    console.warn(`[Gemini API Network Error] ${err.message}`);
    return {
      success: false,
      error: err.message,
      text: null
    };
  }
}
