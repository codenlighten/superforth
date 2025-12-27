/**
 * Memory Summarizer
 * 
 * Wrapper function that calls the summarizeAgent endpoint to generate
 * summaries for memory sessions.
 */

import fetch from 'node-fetch';

/**
 * Create a summarize function for memory sessions
 * 
 * @param {Object} options
 * @param {string} [options.apiUrl] - Base URL for the API (default: http://localhost:3000)
 * @param {string} [options.apiKey] - API key for authentication
 * @returns {function({ interactions, summaries, sessionId }): Promise<string>}
 */
export function createMemorySummarizer(options = {}) {
  const apiUrl = options.apiUrl || 'http://localhost:3000';
  const apiKey = options.apiKey;

  /**
   * Summarize a memory session's interactions
   * 
   * @param {Object} params
   * @param {Array<{role: string, content: string, timestamp: number}>} params.interactions
   * @param {Array<{index: number, summary: string, createdAt: number, window: {from: number, to: number}}>} params.summaries
   * @param {string} params.sessionId
   * @returns {Promise<string>} - The summary text
   */
  return async function summarizeFn({ interactions, summaries, sessionId }) {
    try {
      // Build context from interactions
      const interactionContext = interactions.map((inter, idx) => {
        const date = new Date(inter.timestamp).toISOString();
        return `${idx + 1}. [${inter.role}] ${date}\n${inter.content}`;
      }).join('\n\n');

      // Build previous summaries context
      let summariesContext = '';
      if (summaries.length > 0) {
        summariesContext = '\n\nPrevious summaries:\n' + summaries.map(s => 
          `Summary ${s.index} (interactions ${s.window.from}-${s.window.to}):\n${s.summary}`
        ).join('\n\n');
      }

      const query = `Summarize these conversation interactions concisely. Focus on key topics, decisions, and context that would be valuable for understanding the conversation flow.`;
      const context = interactionContext + summariesContext;

      // Call summarize endpoint
      const headers = {
        'Content-Type': 'application/json'
      };
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      const response = await fetch(`${apiUrl}/api/summarize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, context })
      });

      if (!response.ok) {
        throw new Error(`Summarize API returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Extract summary from response
      // Expected format: { summary: string, missingContext: [], reasoning: string, ... }
      const summaryText = result.summary || result.data?.summary || 'Summary generation returned empty result';
      
      console.log(`Created summary for session ${sessionId}: ${summaryText.slice(0, 100)}...`);
      
      return summaryText;
    } catch (error) {
      console.error('Error in memory summarizer:', error.message);
      // Return fallback summary
      return `Summary failed: ${error.message}. Session had ${interactions.length} interactions.`;
    }
  };
}

export default createMemorySummarizer;
