// lib/openrouter.js
// The ONLY place in the whole app that talks to OpenRouter.
// The API key is read from process.env — it is loaded from your .env file on the
// SERVER and is never sent to, or visible in, the browser.

const DURATION_WORDS = {
  '60s': 'about 150 words (roughly 60 seconds spoken)',
  '5m': 'about 750 words (roughly 5 minutes spoken)',
  '10m': 'about 1500 words (roughly 10 minutes spoken)',
  '15m': 'about 2250 words (roughly 15 minutes spoken)',
};

function buildSystemPrompt({ tone, durationKey, language, videoType, imagePromptsOn }) {
  const length = DURATION_WORDS[durationKey] || DURATION_WORDS['60s'];

  let instructions = `You are a professional video-script writer.
Write a video script in ${language}.
Tone/style: ${tone}.
Video type/category: ${videoType}.
Target length: ${length}.
Write only the script itself — no extra commentary, no markdown headers about your process.`;

  if (imagePromptsOn) {
    instructions += `

The script must be split into numbered SCENES. For every scene, output exactly this structure so the
scene narration and its image prompt are never mixed together:

[SCENE n]
SCRIPT: <the narration / dialogue for this scene>
IMAGE PROMPT: <a single, detailed, visual, English-language prompt suitable for an AI image generator,
describing exactly what should be shown on screen during this scene>

Keep going scene by scene until the full script length target is reached.`;
  } else {
    instructions += `

Output plain narration only, in natural paragraphs or numbered scenes if that fits the video type
better. Do NOT include any image prompts.`;
  }

  return instructions;
}

async function generateScript({ tone, durationKey, language, videoType, imagePromptsOn, details }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set on the server.');

  const model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3.2';

  const systemPrompt = buildSystemPrompt({ tone, durationKey, language, videoType, imagePromptsOn });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Optional but recommended by OpenRouter for attribution/rate-limit purposes:
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'AI Script Generator',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: details },
      ],
      temperature: 0.85,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenRouter request failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned an empty response.');
  return content;
}

// Turns the raw "[SCENE n] SCRIPT: ... IMAGE PROMPT: ..." text into structured
// data so the frontend can render script and image prompts in two separate columns.
function parseScenes(rawText) {
  const sceneRegex = /\[SCENE\s*(\d+)\]\s*SCRIPT:\s*([\s\S]*?)\s*IMAGE PROMPT:\s*([\s\S]*?)(?=\[SCENE\s*\d+\]|$)/gi;
  const scenes = [];
  let match;
  while ((match = sceneRegex.exec(rawText)) !== null) {
    scenes.push({
      scene: Number(match[1]),
      script: match[2].trim(),
      imagePrompt: match[3].trim(),
    });
  }
  return scenes;
}

module.exports = { generateScript, parseScenes };
