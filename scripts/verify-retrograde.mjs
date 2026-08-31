import assert from 'node:assert/strict';
import {
  RETROGRADE_VERSION,
  RGC_SYMBOL,
  USD_TO_RGC,
  STANDARD_TOKEN_UNITS_PER_RGC,
  allowanceForTier,
  quoteRetrograde,
  usdToRgc,
} from '../retrograde.js';

assert.match(RETROGRADE_VERSION, /^2026-/);
assert.equal(RGC_SYMBOL, 'RGC');
assert.equal(USD_TO_RGC, 50);
assert.equal(STANDARD_TOKEN_UNITS_PER_RGC, 2);
assert.equal(usdToRgc(1), 50);
assert.equal(usdToRgc(10), 500);
assert.equal(allowanceForTier('trial'), 250);
assert.equal(allowanceForTier('free'), 250);
assert.equal(allowanceForTier('personal'), 1000);
assert.equal(allowanceForTier('pro'), 2500);
assert.equal(allowanceForTier('owner'), 'unlimited');

assert.equal(quoteRetrograde('/api/tae', { prompt: 'USER: Open Interweb.' }).cost_rgc, 0);
assert.equal(quoteRetrograde('/api/tae', { prompt: 'USER: Explain this simply.' }).cost_rgc, 4);
assert.equal(quoteRetrograde('/api/tae', { prompt: 'USER: Deep research this and verify sources.', mode: 'deepsearch' }).cost_rgc, 45);
assert.equal(quoteRetrograde('/api/runtime', { capability: 'code', operation: 'generate', payload: { goal: 'Build an app' } }).cost_rgc, 25);
assert.equal(quoteRetrograde('/api/runtime', { capability: 'code', operation: 'deploy', payload: { goal: 'Deploy production' } }).cost_rgc, 100);
assert.equal(quoteRetrograde('/api/runtime', { capability: 'optics', operation: 'analyze' }).cost_rgc, 18);
assert.equal(quoteRetrograde('/api/voice/token', {}).cost_rgc, 5);

console.log('[RGC] authoritative Retrograde invariants verified');
