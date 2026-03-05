// =============================================================================
// popup/ui.js
// DOM element references and UI state helpers (loading / login / user cards).
// Imported first by voice.html   all other popup scripts depend on these refs.
// =============================================================================

// -- DOM refs -----------------------------------------------------------------
const statusPill       = document.getElementById('statusPill');
const statusDot        = document.getElementById('statusDot');
const statusPillText   = document.getElementById('statusPillText');
const loadingCard      = document.getElementById('loadingCard');
const userCard         = document.getElementById('userCard');
const loginCard        = document.getElementById('loginCard');
const userAvatar       = document.getElementById('userAvatar');
const userNameEl       = document.getElementById('userName');
const creditsLabel     = document.getElementById('creditsLabel');
const voiceStatus      = document.getElementById('voiceStatus');
const recordingRing    = document.getElementById('recordingRing');
const loginBtn         = document.getElementById('loginBtn');
const logoutBtn        = document.getElementById('logoutBtn');
const gestureToggleBtn = document.getElementById('gestureToggleBtn');
const gesturePanel     = document.getElementById('gesturePanel');
const camVideo         = document.getElementById('camVideo');
const camCanvas        = document.getElementById('camCanvas');
const camCtx           = camCanvas.getContext('2d');
const gestureLabel     = document.getElementById('gestureLabel');
const gesturePill      = document.getElementById('gesturePill');
const camStartBtn      = document.getElementById('camStartBtn');
const camStopBtn       = document.getElementById('camStopBtn');

// -- UI state helpers ---------------------------------------------------------

function showLoading() {
  loadingCard.style.display = 'flex';
  userCard.style.display    = 'none';
  loginCard.style.display   = 'none';
}

function showLoginUI() {
  loadingCard.style.display  = 'none';
  userCard.style.display     = 'none';
  loginCard.style.display    = 'flex';
  statusPill.className       = 'status-pill inactive';
  statusPillText.textContent = 'Offline';
  statusDot.classList.remove('pulse');
  stopListening();   // defined in voice.js
  stopCamera();      // defined in camera.js
}

function showUserUI(name, credits) {
  loadingCard.style.display  = 'none';
  loginCard.style.display    = 'none';
  userCard.style.display     = 'flex';
  userAvatar.textContent     = (name || 'U')[0].toUpperCase();
  userNameEl.textContent     = name || 'User';
  creditsLabel.textContent   = (credits !== undefined && credits !== null ? credits : '-') + ' cr';
  statusPill.className       = 'status-pill active';
  statusPillText.textContent = 'Active';
  statusDot.classList.add('pulse');
  startListening();  // defined in voice.js
}
