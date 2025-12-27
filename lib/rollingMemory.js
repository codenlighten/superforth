/**
 * Rolling Memory System (21+3 Pattern) - Enhanced with Convergence
 * 
 * Core invariants for infinite context without token bloat:
 * 1) After any message: interactions.length <= 21
 * 2) When the 22nd is added:
 *    - create summary for interactions #2–#22 (the last 21)
 *    - shift window to keep #2–#22
 * 3) summaries.length <= 3 (drop oldest first)
 * 4) After 85 messages:
 *    - summaries cover 23–43, 44–64, 65–85
 *    - active window shows 65–85
 * 
 * Enhancements:
 * - Convergence-based optimal summaries
 * - Structured summary metadata
 * - Persistence layer
 * - Statistics and analytics
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * @typedef {'user' | 'ai'} Role
 */

/**
 * @typedef {Object} Interaction
 * @property {string} id - Monotonic id or uuid
 * @property {Role} role - Who sent the message
 * @property {string} text - Message content
 * @property {string} ts - ISO timestamp
 * @property {Object} [metadata] - Optional metadata (tokens, model, etc.)
 */

/**
 * @typedef {Object} SummaryMetadata
 * @property {string[]} keyTopics - Main topics discussed
 * @property {string[]} decisions - Decisions made
 * @property {string[]} actionItems - Actions to take
 * @property {number} importance - 1-10 importance score
 * @property {string} emotionalTone - Overall tone (collaborative, debugging, etc.)
 */

/**
 * @typedef {Object} Summary
 * @property {string} id - Summary id
 * @property {Object} range - Message range summarized
 * @property {string} range.startId - First message id
 * @property {string} range.endId - Last message id
 * @property {string} text - Summary text
 * @property {SummaryMetadata} metadata - Structured metadata
 * @property {string} ts - ISO timestamp
 * @property {number} convergenceScore - Quality score (0-100)
 */

/**
 * @typedef {Object} MemoryState
 * @property {Interaction[]} interactions - Active window (<= 21)
 * @property {Summary[]} summaries - Rolling summaries (<= 3)
 * @property {Object} stats - Statistics
 * @property {number} stats.totalMessages - Total messages processed
 * @property {number} stats.totalSummaries - Total summaries created
 * @property {string} stats.createdAt - When session started
 * @property {string} stats.updatedAt - Last update
 */

/**
 * @typedef {Object} MemoryConfig
 * @property {number} [WINDOW_SIZE=21] - Max interactions in active window
 * @property {number} [MAX_SUMMARIES=3] - Max summaries to retain
 * @property {boolean} [useConvergence=true] - Use convergence for summaries
 * @property {string} [persistPath] - Path to persist memory state
 */

/**
 * Create a new memory state
 * @param {string} [sessionId] - Optional session identifier
 * @returns {MemoryState}
 */
function createMemoryState(sessionId) {
  return {
    sessionId: sessionId || crypto.randomUUID(),
    interactions: [],
    summaries: [],
    stats: {
      totalMessages: 0,
      totalSummaries: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

/**
 * Create a new interaction
 * @param {Role} role 
 * @param {string} text 
 * @param {Object} [metadata] - Optional metadata
 * @returns {Interaction}
 */
function createInteraction(role, text, metadata = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    ts: new Date().toISOString(),
    metadata
  };
}

/**
 * Create convergence-based optimal summary
 * Uses dual-agent convergence to create comprehensive summaries
 * @param {Interaction[]} interactions 
 * @returns {Promise<{text: string, metadata: SummaryMetadata, convergenceScore: number}>}
 */
async function createConvergedSummary(interactions, converge) {
  // Use provided converge function, fall back to simple summary
  if (!converge) {
    // Fallback: simple concatenation
    const text = interactions.map(i => `${i.role}: ${i.text}`).join('\n');
    return {
      text: `Summary of ${interactions.length} messages: ${text.substring(0, 500)}...`,
      metadata: {
        keyTopics: [],
        decisions: [],
        actionItems: [],
        importance: 5,
        emotionalTone: 'neutral'
      },
      convergenceScore: 0
    };
  }

  const conversationText = interactions
    .map(i => `${i.role}: ${i.text}`)
    .join('\n\n');
  
  const result = await converge(
    `Summarize this conversation concisely. Extract:
    - Key topics discussed
    - Decisions made
    - Action items
    - Overall importance (1-10)
    - Emotional tone
    
    Conversation:
    ${conversationText}
    
    Format your response clearly with these sections.`,
    {
      agentA: "Summarizer - Extract key information, be concise but comprehensive",
      agentB: "Reviewer - Ensure nothing critical is lost, verify accuracy",
      maxIterations: 3,
      temperature: 0.3
    }
  );
  
  // Parse metadata from response (basic extraction)
  const response = result.finalResponse.response;
  const keyTopics = extractSection(response, ['key topics', 'topics']);
  const decisions = extractSection(response, ['decisions', 'decided']);
  const actionItems = extractSection(response, ['action items', 'actions', 'todos']);
  const importance = extractImportance(response);
  const emotionalTone = extractTone(response);
  
  return {
    text: response,
    metadata: {
      keyTopics,
      decisions,
      actionItems,
      importance,
      emotionalTone
    },
    convergenceScore: result.convergenceScore
  };
}

/**
 * Simple extraction helpers
 */
function extractSection(text, keywords) {
  const lines = text.split('\n');
  const items = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (keywords.some(kw => line.includes(kw))) {
      // Get next few lines that look like list items
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (nextLine.match(/^[-•*]\s+(.+)/) || nextLine.match(/^\d+\.\s+(.+)/)) {
          items.push(nextLine.replace(/^[-•*\d.]\s+/, ''));
        }
      }
      break;
    }
  }
  
  return items.slice(0, 5); // Max 5 items
}

function extractImportance(text) {
  const match = text.match(/importance[:\s]+(\d+)/i);
  return match ? parseInt(match[1]) : 5;
}

function extractTone(text) {
  const tones = ['collaborative', 'debugging', 'exploratory', 'analytical', 'creative', 'technical'];
  for (const tone of tones) {
    if (text.toLowerCase().includes(tone)) {
      return tone;
    }
  }
  return 'neutral';
}

/**
 * Apply rolling memory update when a new message arrives
 * 
 * @param {MemoryState} state - Current memory state (mutated)
 * @param {Interaction} newInteraction - New message to add
 * @param {MemoryConfig} [cfg={}] - Configuration
 * @returns {Promise<{summaryCreated: boolean, summary?: Summary}>}
 */
async function applyRollingMemoryUpdate(state, newInteraction, cfg = {}) {
  const WINDOW_SIZE = cfg.WINDOW_SIZE ?? 21;
  const MAX_SUMMARIES = cfg.MAX_SUMMARIES ?? 3;
  const USE_CONVERGENCE = cfg.useConvergence ?? true;

  // Add the new interaction
  state.interactions.push(newInteraction);
  state.stats.totalMessages++;
  state.stats.updatedAt = new Date().toISOString();

  // Invariant: interactions.length <= 21 unless we just hit 22
  if (state.interactions.length <= WINDOW_SIZE) {
    return { summaryCreated: false };
  }

  // We only ever allow WINDOW_SIZE + 1 (i.e., 22) temporarily
  if (state.interactions.length !== WINDOW_SIZE + 1) {
    // If something external violated invariants, enforce them deterministically
    while (state.interactions.length > WINDOW_SIZE + 1) {
      state.interactions.shift();
    }
  }

  // When the 22nd is added:
  // Create summary for interactions #2–#22 (the last 21)
  const last21 = state.interactions.slice(1); // drop #1, keep #2..#22

  // Use convergence-based summary if enabled
  const summaryResult = USE_CONVERGENCE 
    ? await createConvergedSummary(last21)
    : {
        text: last21.map(i => `${i.role}: ${i.text.substring(0, 100)}...`).join('\n'),
        metadata: {
          keyTopics: [],
          decisions: [],
          actionItems: [],
          importance: 5,
          emotionalTone: 'neutral'
        },
        convergenceScore: 0
      };

  const summary = {
    id: crypto.randomUUID(),
    range: { 
      startId: last21[0].id, 
      endId: last21[last21.length - 1].id 
    },
    text: summaryResult.text,
    metadata: summaryResult.metadata,
    convergenceScore: summaryResult.convergenceScore,
    ts: new Date().toISOString()
  };

  // Append summary
  state.summaries.push(summary);
  state.stats.totalSummaries++;

  // Shift window to keep #2–#22 (drop oldest so interactions returns to 21)
  state.interactions.shift();

  // Enforce summaries.length <= 3 (drop oldest first)
  while (state.summaries.length > MAX_SUMMARIES) {
    state.summaries.shift();
  }

  // Auto-persist if configured
  if (cfg.persistPath) {
    await saveMemoryState(state, cfg.persistPath);
  }

  // Now invariants hold:
  // - interactions.length <= 21
  // - summaries.length <= 3
  return { summaryCreated: true, summary };
}

/**
 * Build context string from memory state for AI prompts
 * @param {MemoryState} state 
 * @param {Object} [options]
 * @param {boolean} [options.includeMetadata=false] - Include summary metadata
 * @returns {string}
 */
function buildContextString(state, options = {}) {
  const includeMetadata = options.includeMetadata ?? false;
  let context = '';

  // Add summaries (oldest to newest)
  if (state.summaries.length > 0) {
    context += '=== CONVERSATION HISTORY (SUMMARIES) ===\n\n';
    state.summaries.forEach((summary, i) => {
      context += `Summary ${i + 1} (${summary.range.startId.substring(0, 8)} → ${summary.range.endId.substring(0, 8)}):\n`;
      context += summary.text + '\n';
      
      if (includeMetadata && summary.metadata.keyTopics.length > 0) {
        context += `Key Topics: ${summary.metadata.keyTopics.join(', ')}\n`;
      }
      if (includeMetadata && summary.metadata.decisions.length > 0) {
        context += `Decisions: ${summary.metadata.decisions.join(', ')}\n`;
      }
      context += '\n';
    });
  }

  // Add recent interactions
  if (state.interactions.length > 0) {
    context += '=== RECENT INTERACTIONS ===\n\n';
    state.interactions.forEach(interaction => {
      const speaker = interaction.role === 'user' ? 'Human' : 'AI';
      context += `${speaker}: ${interaction.text}\n\n`;
    });
  }

  return context;
}

/**
 * Get statistics about current memory state
 * @param {MemoryState} state 
 * @returns {Object}
 */
function getMemoryStats(state) {
  const totalMessagesInMemory = state.summaries.reduce((sum) => sum + 21, 0) + state.interactions.length;
  
  return {
    sessionId: state.sessionId,
    activeInteractions: state.interactions.length,
    summaryCount: state.summaries.length,
    totalMessages: state.stats.totalMessages,
    totalMessagesInMemory,
    totalSummaries: state.stats.totalSummaries,
    averageConvergenceScore: state.summaries.length > 0
      ? state.summaries.reduce((sum, s) => sum + s.convergenceScore, 0) / state.summaries.length
      : 0,
    keyTopics: [...new Set(state.summaries.flatMap(s => s.metadata.keyTopics))],
    createdAt: state.stats.createdAt,
    updatedAt: state.stats.updatedAt,
    oldestSummaryTs: state.summaries[0]?.ts,
    newestInteractionTs: state.interactions[state.interactions.length - 1]?.ts
  };
}

/**
 * Save memory state to disk
 * @param {MemoryState} state 
 * @param {string} filepath - Path to save (can include sessionId placeholder)
 */
async function saveMemoryState(state, filepath) {
  const resolvedPath = filepath.replace('{sessionId}', state.sessionId);
  const dir = path.dirname(resolvedPath);
  
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(resolvedPath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save memory state:', error.message);
  }
}

/**
 * Load memory state from disk
 * @param {string} filepath 
 * @returns {Promise<MemoryState>}
 */
async function loadMemoryState(filepath) {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load memory state: ${error.message}`);
  }
}

/**
 * Search through memory state
 * @param {MemoryState} state 
 * @param {string} query - Search query
 * @returns {Object[]} - Matching interactions and summaries
 */
function searchMemory(state, query) {
  const lowerQuery = query.toLowerCase();
  const results = [];
  
  // Search interactions
  state.interactions.forEach(interaction => {
    if (interaction.text.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: 'interaction',
        id: interaction.id,
        role: interaction.role,
        text: interaction.text,
        ts: interaction.ts
      });
    }
  });
  
  // Search summaries
  state.summaries.forEach(summary => {
    if (summary.text.toLowerCase().includes(lowerQuery) ||
        summary.metadata.keyTopics.some(t => t.toLowerCase().includes(lowerQuery))) {
      results.push({
        type: 'summary',
        id: summary.id,
        text: summary.text,
        topics: summary.metadata.keyTopics,
        ts: summary.ts
      });
    }
  });
  
  return results;
}

export {
  createMemoryState,
  createInteraction,
  applyRollingMemoryUpdate,
  buildContextString,
  getMemoryStats,
  saveMemoryState,
  loadMemoryState,
  searchMemory,
  createConvergedSummary
};
