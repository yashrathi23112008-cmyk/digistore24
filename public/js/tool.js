// public/js/tool.js

const COST_TABLE = {
  '60s': { off: 1, on: 2 },
  '5m': { off: 5, on: 10 },
  '10m': { off: 10, on: 20 },
  '15m': { off: 15, on: 30 },
};

const durationEl = document.getElementById('duration');
const imagePromptsToggle = document.getElementById('imagePromptsToggle');
const generateBtnLabel = document.getElementById('generate-btn-label');
const generateBtn = document.getElementById('generate-btn');
const detailsEl = document.getElementById('details');
const wordCountEl = document.getElementById('word-count');
const generateError = document.getElementById('generate-error');
const resultPanel = document.getElementById('result-panel');
const resultContent = document.getElementById('result-content');
const headerCredits = document.getElementById('header-credits');

let currentUser = null;

function currentCost() {
  const table = COST_TABLE[durationEl.value];
  return imagePromptsToggle.checked ? table.on : table.off;
}

function updateCostLabel() {
  generateBtnLabel.textContent = `Generate script — costs ${currentCost()} credit${currentCost() > 1 ? 's' : ''}`;
}
durationEl.addEventListener('change', updateCostLabel);
imagePromptsToggle.addEventListener('change', updateCostLabel);
updateCostLabel();

detailsEl.addEventListener('input', () => {
  const words = detailsEl.value.trim().split(/\s+/).filter(Boolean);
  wordCountEl.textContent = `${words.length} / 1000 words`;
  wordCountEl.classList.toggle('over', words.length > 1000);
});

async function loadMe() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/login.html'; return; }
    const data = await res.json();
    currentUser = data.user;
    renderHeader();
  } catch (err) {
    window.location.href = '/login.html';
  }
}

function renderHeader() {
  headerCredits.textContent = currentUser.credits;
  const avatarImg = document.getElementById('header-avatar');
  const initialsEl = document.getElementById('header-initials');
  if (currentUser.avatarUrl) {
    avatarImg.src = currentUser.avatarUrl;
    avatarImg.style.display = 'block';
    initialsEl.style.display = 'none';
  } else {
    initialsEl.textContent = (currentUser.name || '?').trim().charAt(0).toUpperCase();
    initialsEl.style.display = 'block';
    avatarImg.style.display = 'none';
  }
}

document.getElementById('profile-btn').addEventListener('click', () => {
  window.location.href = '/profile.html';
});

generateBtn.addEventListener('click', async () => {
  generateError.style.display = 'none';
  const details = detailsEl.value.trim();
  if (!details) {
    generateError.textContent = 'Please describe your video first.';
    generateError.style.display = 'block';
    return;
  }
  const wordCount = details.split(/\s+/).filter(Boolean).length;
  if (wordCount > 1000) {
    generateError.textContent = 'Please keep the description to 1000 words or fewer.';
    generateError.style.display = 'block';
    return;
  }

  generateBtn.disabled = true;
  const originalLabel = generateBtnLabel.textContent;
  generateBtnLabel.innerHTML = '<span class="spinner"></span> Generating…';

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tone: document.getElementById('tone').value,
        duration: durationEl.value,
        language: document.getElementById('language').value,
        videoType: document.getElementById('videoType').value,
        imagePromptsOn: imagePromptsToggle.checked,
        details,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation failed.');

    currentUser.credits = data.remainingCredits;
    renderHeader();
    renderResult(data);
  } catch (err) {
    generateError.textContent = err.message;
    generateError.style.display = 'block';
  } finally {
    generateBtn.disabled = false;
    generateBtnLabel.textContent = originalLabel;
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderResult(data) {
  resultPanel.style.display = 'block';
  resultContent.innerHTML = '';

  if (data.scenes && data.scenes.length) {
    data.scenes.forEach(scene => {
      const card = document.createElement('div');
      card.className = 'scene-card';
      card.innerHTML = `
        <div class="scene-header">Scene ${scene.scene}</div>
        <div class="scene-body">
          <div class="scene-col script">
            <div class="scene-col-label">Script</div>
            <div>${escapeHtml(scene.script)}</div>
          </div>
          <div class="scene-col image">
            <div class="scene-col-label">Image prompt</div>
            <div>${escapeHtml(scene.imagePrompt)}</div>
          </div>
        </div>`;
      resultContent.appendChild(card);
    });
    if (data.scenes.length === 0) {
      resultContent.innerHTML = `<div class="plain-script">${escapeHtml(data.raw)}</div>`;
    }
  } else {
    resultContent.innerHTML = `<div class="plain-script">${escapeHtml(data.raw)}</div>`;
  }

  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

loadMe();
