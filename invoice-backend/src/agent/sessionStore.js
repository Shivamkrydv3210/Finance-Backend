const WINDOW_SIZE = 20;

const sessions = new Map();
const lastExtractedBySession = new Map();

/**
 * Get messages for a session (last WINDOW_SIZE messages).
 * @param {string} sessionId
 * @returns {Array<{role: string, content: string}>}
 */
export function getMessages(sessionId) {
  const list = sessions.get(sessionId);
  if (!list) return [];
  return list.length > WINDOW_SIZE ? list.slice(-WINDOW_SIZE) : [...list];
}

/**
 * Append a user and assistant message to the session.
 * @param {string} sessionId
 * @param {string} userContent
 * @param {string} assistantContent
 */
export function appendExchange(sessionId, userContent, assistantContent) {
  let list = sessions.get(sessionId);
  if (!list) {
    list = [];
    sessions.set(sessionId, list);
  }
  list.push({ role: 'user', content: userContent });
  list.push({ role: 'assistant', content: assistantContent });
  if (list.length > WINDOW_SIZE) {
    sessions.set(sessionId, list.slice(-WINDOW_SIZE));
  }
}

/**
 * Store last extracted invoice for a session (avoids sending huge JSON in chat context).
 */
export function setLastExtracted(sessionId, extracted) {
  lastExtractedBySession.set(sessionId, extracted);
}

/**
 * Get and clear last extracted invoice for a session.
 */
export function getLastExtracted(sessionId) {
  const data = lastExtractedBySession.get(sessionId);
  lastExtractedBySession.delete(sessionId);
  return data ?? null;
}
