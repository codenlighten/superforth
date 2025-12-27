/**
 * Memory Session Manager
 * 
 * Lightweight conversational memory with rolling summaries.
 * - Keeps last `maxInteractions` stripped-down interactions (default 21)
 * - Keeps up to `maxSummaries` summaries (default 3)
 * - Uses in-memory Map with TTL (default 24 hours)
 * - Summarization is delegated to a provided summarizeFn (e.g. summarizeAgent)
 * - Optional persistence adapter for MongoDB (paid users)
 */

/**
 * @typedef {Object} StrippedInteraction
 * @property {string} role - Typically "user" | "assistant" | "system" | "tool"
 * @property {string} content - The message content, stripped of signatures/large metadata
 * @property {number} [timestamp] - Unix ms timestamp. If not provided, will be set automatically.
 */

/**
 * @typedef {Object} MemorySummary
 * @property {number} index - 1-based index of the summary (1..maxSummaries)
 * @property {string} summary - The actual summary text
 * @property {number} createdAt - Unix ms timestamp when summary was created
 * @property {{ from: number, to: number }} window -
 *   Approximate global interaction index range covered by this summary.
 */

/**
 * @typedef {Object} MemoryState
 * @property {string} sessionId
 * @property {StrippedInteraction[]} interactions - Last N stripped interactions
 * @property {MemorySummary[]} summaries - Up to maxSummaries summaries
 * @property {number} totalInteractions - Count of all interactions ever added
 * @property {number} createdAt - Unix ms timestamp
 * @property {number} updatedAt - Unix ms timestamp
 * @property {number} expiresAt - Unix ms timestamp
 */

const DEFAULT_MAX_INTERACTIONS = 21;
const DEFAULT_MAX_SUMMARIES = 3;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * MemorySession manages state for a single session (user, conversation, etc.)
 */
export class MemorySession {
  /**
   * @param {Object} options
   * @param {string} options.sessionId
   * @param {number} [options.maxInteractions]
   * @param {number} [options.maxSummaries]
   * @param {number} [options.ttlMs]
   * @param {number} [options.initialTotalInteractions]
   */
  constructor({
    sessionId,
    maxInteractions = DEFAULT_MAX_INTERACTIONS,
    maxSummaries = DEFAULT_MAX_SUMMARIES,
    ttlMs = DEFAULT_TTL_MS,
    initialTotalInteractions = 0
  }) {
    this.sessionId = sessionId;
    this.maxInteractions = maxInteractions;
    this.maxSummaries = maxSummaries;
    this.ttlMs = ttlMs;

    /** @type {StrippedInteraction[]} */
    this.interactions = [];
    /** @type {MemorySummary[]} */
    this.summaries = [];
    this.totalInteractions = initialTotalInteractions;

    const now = Date.now();
    this.createdAt = now;
    this.updatedAt = now;
    this.expiresAt = now + ttlMs;
  }

  /**
   * Returns true if this session is expired based on TTL.
   */
  isExpired() {
    return Date.now() > this.expiresAt;
  }

  /**
   * Touch the session (extend TTL and update timestamp).
   */
  touch() {
    const now = Date.now();
    this.updatedAt = now;
    this.expiresAt = now + this.ttlMs;
  }

  /**
   * Add a new stripped interaction and optionally trigger a summary.
   *
   * @param {StrippedInteraction} interaction
   * @param {function({ interactions: StrippedInteraction[], summaries: MemorySummary[], sessionId: string }): Promise<string>} [summarizeFn]
   *   summarizeFn is responsible for calling summarizeAgent or equivalent.
   *   It should return a summary string.
   */
  async addInteraction(interaction, summarizeFn) {
    this.touch();
    const now = Date.now();

    const cleanInteraction = {
      role: interaction.role,
      content: interaction.content,
      timestamp: interaction.timestamp || now
    };

    // Update counters first
    this.totalInteractions += 1;

    // Append interaction
    this.interactions.push(cleanInteraction);

    // Enforce maxInteractions window (keep last N)
    if (this.interactions.length > this.maxInteractions) {
      this.interactions.shift();
    }

    // Decide whether to create a new summary
    if (typeof summarizeFn === "function") {
      await this.maybeSummarize(summarizeFn);
    }
  }

  /**
   * Logic for when to create a new summary.
   * Strategy:
   *  - When the number of completed 21-interaction segments
   *    exceeds the current number of summaries, and we still
   *    have room (< maxSummaries), we generate a new summary.
   *  - This approximates: summary1 after ~21 msgs, summary2 after ~42, etc.
   *
   * @param {function({ interactions: StrippedInteraction[], summaries: MemorySummary[], sessionId: string }): Promise<string>} summarizeFn
   */
  async maybeSummarize(summarizeFn) {
    if (this.interactions.length === 0) return;
    if (this.summaries.length >= this.maxSummaries) return;

    const segmentsCompleted = Math.floor(
      this.totalInteractions / this.maxInteractions
    );

    if (segmentsCompleted <= this.summaries.length) {
      // No new full segment to summarize yet
      return;
    }

    const summaryIndex = this.summaries.length + 1;

    // Use the current interactions window as the basis for the next summary.
    // You could instead track exact ranges per segment if you want.
    const summaryText = await summarizeFn({
      interactions: this.interactions.slice(),
      summaries: this.summaries.slice(),
      sessionId: this.sessionId
    });

    const now = Date.now();
    const newSummary = {
      index: summaryIndex,
      summary: summaryText,
      createdAt: now,
      window: {
        // Approximate global index range covered by this summary
        from: (summaryIndex - 1) * this.maxInteractions + 1,
        to: summaryIndex * this.maxInteractions
      }
    };

    this.summaries.push(newSummary);
    this.updatedAt = now;

    // We DO NOT clear interactions here; we still keep the last N (21) for
    // immediate local context. The summaries act as compressed older context.
  }

  /**
   * Get a serializable snapshot of this session's state.
   *
   * @returns {MemoryState}
   */
  toJSON() {
    return {
      sessionId: this.sessionId,
      interactions: this.interactions.slice(),
      summaries: this.summaries.slice(),
      totalInteractions: this.totalInteractions,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      expiresAt: this.expiresAt
    };
  }

  /**
   * Build context string for AI prompts (utility method)
   */
  buildContextString() {
    let contextStr = '';

    // Add summaries first (historical context)
    if (this.summaries.length > 0) {
      contextStr += '=== Previous Conversation Summaries ===\n\n';
      this.summaries.forEach((summary) => {
        contextStr += `Summary ${summary.index} (interactions ${summary.window.from}-${summary.window.to}):\n${summary.summary}\n\n`;
      });
    }

    // Add recent interactions
    if (this.interactions.length > 0) {
      contextStr += '=== Recent Interactions ===\n\n';
      this.interactions.forEach((inter, idx) => {
        const date = new Date(inter.timestamp).toISOString();
        contextStr += `${idx + 1}. [${inter.role}] ${date}\n${inter.content}\n\n`;
      });
    }

    return contextStr;
  }
}

/**
 * MemorySessionStore manages multiple MemorySession instances in-process.
 * - Uses a Map keyed by sessionId
 * - Performs lazy cleanup of expired sessions
 * - Ready to be extended with Mongo or other persistence for paid users
 */
export class MemorySessionStore {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxInteractions]
   * @param {number} [options.maxSummaries]
   * @param {number} [options.ttlMs]
   * @param {Object} [options.persistenceAdapter] - Optional for paid users / Mongo, etc.
   * @param {function(string): Promise<MemoryState|null>} [options.persistenceAdapter.load]
   * @param {function(MemoryState): Promise<void>} [options.persistenceAdapter.save]
   */
  constructor({
    maxInteractions = DEFAULT_MAX_INTERACTIONS,
    maxSummaries = DEFAULT_MAX_SUMMARIES,
    ttlMs = DEFAULT_TTL_MS,
    persistenceAdapter = null
  } = {}) {
    this.sessions = new Map();
    this.maxInteractions = maxInteractions;
    this.maxSummaries = maxSummaries;
    this.ttlMs = ttlMs;
    this.persistenceAdapter = persistenceAdapter;

    // Start cleanup interval (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60 * 60 * 1000);
  }

  /**
   * Clean up expired sessions from the Map.
   */
  cleanupExpired() {
    const now = Date.now();
    let cleaned = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired memory sessions`);
    }
  }

  /**
   * Get or create a MemorySession for a given sessionId.
   * If a persistence adapter is present, this can be extended
   * to load from Mongo/DB when not found in memory.
   *
   * @param {string} sessionId
   * @returns {Promise<MemorySession>}
   */
  async getOrCreateSession(sessionId) {
    this.cleanupExpired();

    if (this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId);
      if (!existing.isExpired()) {
        existing.touch();
        return existing;
      }
      this.sessions.delete(sessionId);
    }

    // Optionally load from persistence (e.g., Mongo) for paid users
    if (this.persistenceAdapter && typeof this.persistenceAdapter.load === "function") {
      const loaded = await this.persistenceAdapter.load(sessionId);
      if (loaded) {
        const session = new MemorySession({
          sessionId: loaded.sessionId,
          maxInteractions: this.maxInteractions,
          maxSummaries: this.maxSummaries,
          ttlMs: this.ttlMs,
          initialTotalInteractions: loaded.totalInteractions || 0
        });
        session.interactions = loaded.interactions || [];
        session.summaries = loaded.summaries || [];
        session.createdAt = loaded.createdAt || Date.now();
        session.updatedAt = loaded.updatedAt || Date.now();
        session.expiresAt = Date.now() + this.ttlMs;

        this.sessions.set(sessionId, session);
        return session;
      }
    }

    // Create new in-memory session
    const session = new MemorySession({
      sessionId,
      maxInteractions: this.maxInteractions,
      maxSummaries: this.maxSummaries,
      ttlMs: this.ttlMs
    });

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Add an interaction to a session and handle summarization.
   *
   * @param {string} sessionId
   * @param {StrippedInteraction} interaction
   * @param {function({ interactions: StrippedInteraction[], summaries: MemorySummary[], sessionId: string }): Promise<string>} [summarizeFn]
   */
  async addInteraction(sessionId, interaction, summarizeFn) {
    const session = await this.getOrCreateSession(sessionId);
    await session.addInteraction(interaction, summarizeFn);

    // Optionally persist updated state for paid users
    if (this.persistenceAdapter && typeof this.persistenceAdapter.save === "function") {
      await this.persistenceAdapter.save(session.toJSON());
    }

    return session.toJSON();
  }

  /**
   * Get a snapshot of a session's memory state.
   *
   * @param {string} sessionId
   * @returns {Promise<MemoryState|null>}
   */
  async getSessionState(sessionId) {
    const session = await this.getOrCreateSession(sessionId);
    if (!session || session.isExpired()) return null;
    return session.toJSON();
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId) {
    this.sessions.delete(sessionId);
    return true;
  }

  /**
   * Get all active sessions (admin/debug)
   */
  getActiveSessions() {
    const sessions = [];
    for (const [sessionId, session] of this.sessions.entries()) {
      sessions.push({
        sessionId,
        summaryCount: session.summaries.length,
        interactionCount: session.interactions.length,
        totalInteractions: session.totalInteractions,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt
      });
    }
    return sessions;
  }

  /**
   * Clear all sessions (admin/debug)
   */
  clearAllSessions() {
    const count = this.sessions.size;
    this.sessions.clear();
    return count;
  }

  /**
   * Stop cleanup interval
   */
  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export default MemorySessionStore;
