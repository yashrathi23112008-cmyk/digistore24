// lib/pricing.js
// Central place for the credit-cost rules, so the price shown in the UI and the
// price actually charged on the server can never drift apart.

const BASE_COST = {
  '60s': 1,
  '5m': 5,
  '10m': 10,
  '15m': 15,
};

const DURATION_LABELS = {
  '60s': '60 seconds',
  '5m': '5 minutes',
  '10m': '10 minutes',
  '15m': '15 minutes',
};

function calculateCost(durationKey, imagePromptsOn) {
  const base = BASE_COST[durationKey];
  if (!base) return null;
  return imagePromptsOn ? base * 2 : base;
}

module.exports = { BASE_COST, DURATION_LABELS, calculateCost };
