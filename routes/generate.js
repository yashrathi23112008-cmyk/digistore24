// routes/generate.js
const express = require('express');
const { db, uuid, nowISO } = require('../db');
const { requireAuth } = require('../lib/auth');
const { calculateCost, DURATION_LABELS } = require('../lib/pricing');
const { generateScript, parseScenes } = require('../lib/openrouter');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const { tone, duration, language, videoType, imagePromptsOn, details } = req.body || {};

    if (!tone || !duration || !language || !videoType || !details || !details.trim()) {
      return res.status(400).json({ error: 'Tone, duration, language, video type and script details are all required.' });
    }
    if (details.trim().split(/\s+/).length > 1000) {
      return res.status(400).json({ error: 'Script details must be 1000 words or fewer.' });
    }
    if (!DURATION_LABELS[duration]) {
      return res.status(400).json({ error: 'Invalid duration option.' });
    }

    const cost = calculateCost(duration, !!imagePromptsOn);

    // Re-check credits and expiry straight from the DB right before charging —
    // never trust a balance the browser might have cached.
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (fresh.expiry_date && new Date(fresh.expiry_date) < new Date()) {
      db.prepare('UPDATE users SET credits = 0, updated_at = ? WHERE id = ?').run(nowISO(), fresh.id);
      return res.status(402).json({ error: 'Your plan has expired. Please repurchase to continue.' });
    }
    if (fresh.credits < cost) {
      return res.status(402).json({ error: `Not enough credits. This script costs ${cost}, you have ${fresh.credits}.` });
    }

    const rawText = await generateScript({
      tone,
      durationKey: duration,
      language,
      videoType,
      imagePromptsOn: !!imagePromptsOn,
      details: details.trim(),
    });

    // Deduct credits only after a successful generation.
    db.prepare('UPDATE users SET credits = credits - ?, updated_at = ? WHERE id = ?')
      .run(cost, nowISO(), req.user.id);

    db.prepare(`
      INSERT INTO generations (id, user_id, tone, duration, language, video_type, image_prompts, cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuid(), req.user.id, tone, duration, language, videoType, imagePromptsOn ? 1 : 0, cost, nowISO());

    const updatedUser = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);

    const scenes = imagePromptsOn ? parseScenes(rawText) : null;

    res.json({
      raw: rawText,
      scenes,                         // structured [{scene, script, imagePrompt}] when image prompts are ON, else null
      cost,
      remainingCredits: updatedUser.credits,
    });
  } catch (err) {
    console.error('Generation error:', err);
    res.status(500).json({ error: 'Script generation failed. Please try again.' });
  }
});

module.exports = router;
