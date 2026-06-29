'use strict';

/**
 * Per-model circuit breaker.
 * Each Gemini model has its own quota pool, so a 429 on gemini-2.0-flash
 * must NOT block gemini-2.5-flash (which has a separate pool).
 */
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes per model

const _modelCooldowns = {}; // modelName -> expiresAt timestamp

module.exports = {
  /** True if this specific model is in cooldown */
  isExhausted(model) {
    return Date.now() < (_modelCooldowns[model] || 0);
  },

  /** Put this specific model on cooldown */
  markExhausted(model) {
    _modelCooldowns[model] = Date.now() + COOLDOWN_MS;
    const reset       = new Date(_modelCooldowns[model]).toLocaleTimeString();
    const displayName = model.includes(':') ? model.split(':').pop() : model;
    console.warn(`[LiquidAI] ${displayName} quota exhausted — skipping until ${reset}`);
  },

  /** Reset a specific model (e.g. after a successful call) */
  reset(model) {
    delete _modelCooldowns[model];
  },

  /** True if EVERY model in the given list is on cooldown */
  allExhausted(models) {
    return models.every(m => module.exports.isExhausted(m));
  },

  /** ISO string when first model resets, or null */
  resetsAt(models) {
    const active = (models || []).filter(m => _modelCooldowns[m]);
    if (!active.length) return null;
    const earliest = Math.min(...active.map(m => _modelCooldowns[m]));
    return earliest > Date.now() ? new Date(earliest).toISOString() : null;
  },
};