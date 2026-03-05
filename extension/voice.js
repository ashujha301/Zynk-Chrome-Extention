// =============================================================================
// ZYNK AI - voice.js  (Voice + Gesture Control)
// =============================================================================

// -- DOM refs ------------------------------------------------------------------
const statusPill      = document.getElementById('statusPill');
const statusDot       = document.getElementById('statusDot');
const statusPillText  = document.getElementById('statusPillText');
const loadingCard     = document.getElementById('loadingCard');
const userCard        = document.getElementById('userCard');
const loginCard       = document.getElementById('loginCard');
const userAvatar      = document.getElementById('userAvatar');
const userNameEl      = document.getElementById('userName');
const creditsLabel    = document.getElementById('creditsLabel');
const voiceStatus     = document.getElementById('voiceStatus');
const recordingRing   = document.getElementById('recordingRing');
const loginBtn        = document.getElementById('loginBtn');
const logoutBtn       = document.getElementById('logoutBtn');
const gestureToggleBtn = document.getElementById('gestureToggleBtn');
const gesturePanel     = document.getElementById('gesturePanel');
const camVideo         = document.getElementById('camVideo');
const camCanvas        = document.getElementById('camCanvas');
const camCtx           = camCanvas.getContext('2d');
const gestureLabel     = document.getElementById('gestureLabel');
const gesturePill      = document.getElementById('gesturePill');
const camStartBtn      = document.getElementById('camStartBtn');
const camStopBtn       = document.getElementById('camStopBtn');

// =============================================================================
// VOICE STATE
// =============================================================================
let mediaRecorder;
let audioChunks           = [];
let streamRef             = null;
let recognition           = null;
let isRecording           = false;
let accumulatedTranscript = '';

// =============================================================================
// GESTURE STATE
// =============================================================================
let camStream     = null;
let handsModel    = null;
let animFrameId   = null;
let gestureActive = false;
let panelOpen     = false;

// Pinch / click - works any time thumb+index are close
let isPinching          = false;
let pinchStartX         = 0;
let pinchStartY         = 0;
let pinchDragActive     = false;

// Cursor smoothing (EMA) + range remapping
// Hand typically appears in 20%-80% of camera frame.
// We remap that range to 0-1 so small movements cover the full screen.
let cursorSmX           = 0.5;
let cursorSmY           = 0.5;
const CURSOR_SMOOTH     = 0.30;  // 0=frozen 1=raw. 0.3 = responsive but not jittery
const CURSOR_IN_MIN     = 0.18;  // camera normalised value that maps to screen edge 0
const CURSOR_IN_MAX     = 0.82;  // camera normalised value that maps to screen edge 1

// Scroll: we send START/STOP to content.js which runs the interval inside the page
// This avoids the popup->background->content round-trip latency per tick
let scrollDir           = 0;     // 'up', 'down', or 0
const SCROLL_PX         = 110;   // pixels per tick (tuned in content.js)
const SCROLL_MS         = 55;    // ms between ticks

// Thumb direction for thumbs-up / thumbs-down
// Thumbs-down: thumb tip clearly BELOW the wrist
// Thumbs-up:   thumb tip clearly ABOVE the wrist

// Gesture debounce
const GESTURE_COOLDOWN  = 900;

// One-finger cursor: track if cursor is being shown
let cursorVisible = false;

// Tab switcher state machine
//  idle      : no tab mode
//  browsing  : open hand shown, overlay visible, waiting for fist
//  selecting : fist held, moving left/right navigates tabs
//  confirm   : open hand shown again -> selects highlighted tab
let tabMode          = 'idle';  // 'idle' | 'browsing' | 'selecting'
let tabList          = [];      // [{id, title, url, index}]
let tabHighlight     = 0;       // index of currently highlighted tab
let tabFistXSmooth   = 0.5;     // smoothed wrist X while fist navigating
let tabFistXPrev     = 0.5;     // previous smoothed X to detect direction
const TAB_SMOOTH     = 0.18;    // EMA for fist X smoothing
const TAB_STEP_DIST  = 0.07;    // how far fist must travel to move one tab

// =============================================================================
// UI HELPERS
// =============================================================================
function showLoading() {
  loadingCard.style.display = 'flex';
  userCard.style.display    = 'none';
  loginCard.style.display   = 'none';
}
function showLoginUI() {
  loadingCard.style.display = 'none';
  userCard.style.display    = 'none';
  loginCard.style.display   = 'flex';
  statusPill.className       = 'status-pill inactive';
  statusPillText.textContent = 'Offline';
  statusDot.classList.remove('pulse');
  stopListening();
  stopCamera();
}
function showUserUI(name, credits) {
  loadingCard.style.display = 'none';
  loginCard.style.display   = 'none';
  userCard.style.display    = 'flex';
  userAvatar.textContent     = (name || 'U')[0].toUpperCase();
  userNameEl.textContent     = name || 'User';
  creditsLabel.textContent   = `${credits ?? '-'} cr`;
  statusPill.className       = 'status-pill active';
  statusPillText.textContent = 'Active';
  statusDot.classList.add('pulse');
  startListening();
}

// =============================================================================
// AUTH
// =============================================================================
async function checkAuth() {
  showLoading();
  try {
    const resp = await fetch('https://localhost:8000/auth/ensure-extension-token', { credentials: 'include' });
    if (resp.status !== 200) { showLoginUI(); return; }
    const json = await resp.json();
    if (!json.access_token) { showLoginUI(); return; }
    const userResp = await fetch('https://localhost:8000/user/me', {
      headers: { Authorization: `Bearer ${json.access_token}` }
    });
    if (!userResp.ok) { showLoginUI(); return; }
    const user = await userResp.json();
    showUserUI(user.name || user.email || user.user_id || 'User', user.credits);
  } catch (e) { showLoginUI(); }
}

async function fetchExtensionToken() {
  try {
    const resp = await fetch('https://localhost:8000/auth/ensure-extension-token', { credentials: 'include' });
    if (resp.status !== 200) return null;
    return (await resp.json()).access_token || null;
  } catch { return null; }
}

loginBtn.addEventListener('click', () => chrome.tabs.create({ url: 'https://localhost:3000' }));
logoutBtn.addEventListener('click', async () => {
  try { await fetch('https://localhost:8000/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
  showLoginUI();
});

// =============================================================================
// VOICE - Wake-word recognition loop
// =============================================================================
async function startListening() {
  if (recognition) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef = stream;
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous     = true;
    recognition.interimResults = true;
    recognition.lang           = 'en-US';
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) accumulatedTranscript += transcript;
        const full = (accumulatedTranscript + (result.isFinal ? '' : transcript)).toLowerCase();
        voiceStatus.textContent = `Heard: "${transcript.trim()}"`;
        if ((full.includes('hey zynk') || full.includes('hey zink')) && !isRecording) {
          accumulatedTranscript = '';
          startRecording();
        }
      }
    };
    recognition.onerror = (e) => { if (e.error !== 'aborted') voiceStatus.textContent = 'Mic error: ' + e.error; };
    recognition.onend   = () => { if (!isRecording && recognition) try { recognition.start(); } catch {} };
    recognition.start();
    voiceStatus.textContent = 'Listening for "Hey Zynk"...';
    recordingRing.className = 'listening';
  } catch (e) {
    voiceStatus.textContent = 'Mic error: ' + e.message;
  }
}

function stopListening() {
  isRecording = false;
  if (recognition) { recognition.onend = null; try { recognition.stop(); } catch {} recognition = null; }
  if (streamRef)   { streamRef.getTracks().forEach(t => t.stop()); streamRef = null; }
  accumulatedTranscript = '';
}

// =============================================================================
// VOICE - Recording (after wake word)
// =============================================================================
function startRecording() {
  if (!streamRef) return;
  isRecording = true;
  audioChunks = [];
  if (recognition) { recognition.onend = null; try { recognition.stop(); } catch {} }
  mediaRecorder = new MediaRecorder(streamRef);
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    isRecording = false;
    recordingRing.className = 'listening';
    if (recognition) {
      recognition.onend = () => { if (!isRecording && recognition) try { recognition.start(); } catch {} };
      try { recognition.start(); } catch {}
    }
    const token = await fetchExtensionToken();
    if (!token) { voiceStatus.textContent = 'Session expired.'; showLoginUI(); return; }
    voiceStatus.textContent = 'Transcribing...';
    const formData = new FormData();
    formData.append('file', new Blob(audioChunks, { type: 'audio/webm' }));
    try {
      const resp = await fetch('https://localhost:8000/agent/transcribe', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
        body: formData, credentials: 'include'
      });
      const data = await resp.json();
      if (!data.text) { voiceStatus.textContent = 'Could not understand.'; return; }
      const command = data.text;
      voiceStatus.textContent = `Command: "${command}"`;
      chrome.runtime.sendMessage({ type: 'EXECUTE_COMMAND', command }, (response) => {
        if (response?.error) {
          voiceStatus.textContent = 'Error: ' + response.error;
          if (response.error.toLowerCase().includes('login') || response.error.toLowerCase().includes('expired')) showLoginUI();
          return;
        }
        if (response?.credits_remaining !== undefined) creditsLabel.textContent = `${response.credits_remaining} cr`;
        voiceStatus.textContent = `OK Done: "${command}"`;
        setTimeout(() => { voiceStatus.textContent = 'Listening for "Hey Zynk"...'; }, 3000);
      });
    } catch (e) { voiceStatus.textContent = 'Transcription failed.'; }
  };
  mediaRecorder.start();
  recordingRing.className = 'recording';
  voiceStatus.textContent = 'Recording... (speak your command)';
  setTimeout(() => { if (isRecording && mediaRecorder?.state === 'recording') mediaRecorder.stop(); }, 4000);
}

// =============================================================================
// GESTURE PANEL - toggle
// =============================================================================
gestureToggleBtn.addEventListener('click', () => {
  panelOpen = !panelOpen;
  gesturePanel.classList.toggle('open', panelOpen);
  gestureToggleBtn.classList.toggle('active', panelOpen);
  const label = gestureToggleBtn.querySelector('.btn-label');
  if (label) label.textContent = panelOpen ? 'Disable Camera' : 'Enable Camera';
});

camStartBtn.addEventListener('click', startCamera);
camStopBtn.addEventListener('click',  stopCamera);

// =============================================================================
// CAMERA - start / stop
// =============================================================================
async function startCamera() {
  if (gestureActive) return;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' }
    });
    camVideo.srcObject = camStream;
    await new Promise(r => { camVideo.onloadedmetadata = r; });
    camCanvas.width  = camVideo.videoWidth;
    camCanvas.height = camVideo.videoHeight;
    gestureActive        = true;
    camStartBtn.disabled = true;
    camStopBtn.disabled  = false;
    gesturePill.textContent = 'ACTIVE';
    await initHandLandmarker();
    renderLoop();
  } catch (e) {
    gestureLabel.textContent = 'Camera error: ' + e.message;
    console.error('[Zynk] Camera error:', e);
  }
}

function stopCamera() {
  gestureActive = false;
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (camStream)   { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  camVideo.srcObject = null;
  camCtx.clearRect(0, 0, camCanvas.width, camCanvas.height);
  gestureLabel.textContent = 'Camera off';
  gesturePill.textContent  = 'READY';
  gesturePill.classList.remove('triggered');
  camStartBtn.disabled = false;
  camStopBtn.disabled  = true;
  sendToTab({ type: 'GESTURE_CURSOR_HIDE' });
}

// =============================================================================
// MEDIAPIPE TASKS VISION - Hand Landmarker
// This is the MODERN MediaPipe API (not the old @0.4 legacy).
// Uses wasm-unsafe-eval (allowed in MV3 via manifest CSP).
// Files needed in mediapipe/ folder:
//   - vision_bundle.js          (the main library)
//   - hand_landmarker.task      (the model ~8MB)
// =============================================================================
async function initHandLandmarker() {
  if (handsModel) return;
  gestureLabel.textContent = 'Loading hand model...';

  try {
    const { HandLandmarker, FilesetResolver } = await import(
      chrome.runtime.getURL('mediapipe/vision_bundle.mjs')
    );

    const vision = await FilesetResolver.forVisionTasks(
      chrome.runtime.getURL('mediapipe/wasm')   // folder with wasm files
    );

    handsModel = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: chrome.runtime.getURL('mediapipe/hand_landmarker.task'),
        delegate: 'GPU'   // uses WebGL - no WASM streaming, very fast
      },
      runningMode:        'VIDEO',
      numHands:           1,
      minHandDetectionConfidence: 0.7,
      minHandPresenceConfidence:  0.7,
      minTrackingConfidence:      0.6
    });

    gestureLabel.textContent = 'Show your hand ';
  } catch (e) {
    console.error('[Zynk] HandLandmarker init failed:', e);
    gestureLabel.textContent = 'Model load failed - see console';
    handsModel    = null;
    gestureActive = false;
    camStartBtn.disabled = false;
    camStopBtn.disabled  = true;
  }
}

// =============================================================================
// RENDER LOOP
// =============================================================================
let lastVideoTime = -1;

function renderLoop() {
  if (!gestureActive) return;
  animFrameId = requestAnimationFrame(() => {
    if (handsModel && camVideo.readyState >= 2) {
      const nowMs = performance.now();
      // Tasks Vision requires detectForVideo - only process new frames
      if (camVideo.currentTime !== lastVideoTime) {
        lastVideoTime = camVideo.currentTime;
        const results = handsModel.detectForVideo(camVideo, nowMs);
        onHandResults(results);
      }
    }
    renderLoop();
  });
}

// =============================================================================
// HAND CONNECTIONS - skeleton drawing
// =============================================================================
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

// =============================================================================
// PROCESS RESULTS - Tasks Vision format
// results.landmarks[0] = array of 21 {x,y,z} already normalised 0..1
// =============================================================================
function onHandResults(results) {
  camCtx.clearRect(0, 0, camCanvas.width, camCanvas.height);

  if (!results.landmarks || results.landmarks.length === 0) {
    gestureLabel.textContent = 'No hand detected';
    if (cursorVisible) { cursorVisible = false; sendToTab({ type: 'GESTURE_CURSOR_HIDE' }); }
    if (isPinching)    { isPinching = false; pinchDragActive = false; sendToTab({ type: 'GESTURE_DRAG_END' }); }
    return;
  }

  // landmarks[0] = first hand, already normalised {x,y,z} 0..1
  const lm = results.landmarks[0];
  drawSkeleton(lm);
  processFrame(lm);
}

// =============================================================================
// DRAW SKELETON
// =============================================================================
function drawSkeleton(lm) {
  const W = camCanvas.width, H = camCanvas.height;
  camCtx.strokeStyle = 'rgba(124,106,255,0.65)';
  camCtx.lineWidth   = 2;
  for (const [a, b] of CONNECTIONS) {
    camCtx.beginPath();
    camCtx.moveTo(lm[a].x * W, lm[a].y * H);
    camCtx.lineTo(lm[b].x * W, lm[b].y * H);
    camCtx.stroke();
  }
  for (const p of lm) {
    camCtx.beginPath();
    camCtx.arc(p.x * W, p.y * H, 3, 0, Math.PI * 2);
    camCtx.fillStyle = '#7c6aff';
    camCtx.fill();
  }
  for (const i of [4, 8, 12, 16, 20]) {
    camCtx.beginPath();
    camCtx.arc(lm[i].x * W, lm[i].y * H, 5, 0, Math.PI * 2);
    camCtx.fillStyle = 'rgba(255,255,255,0.9)';
    camCtx.fill();
  }
}

// =============================================================================
// LANDMARK HELPERS
// =============================================================================
// LANDMARK HELPERS
// =============================================================================
function dist(a, b)     { return Math.hypot(a.x - b.x, a.y - b.y); }

// finger extended: tip must be above its MCP knuckle by threshold
// tip above knuckle = finger extended
function isUp(lm, t, m) {
  return lm[t].y < lm[m].y - 0.03;
}

// tip clearly below knuckle = finger curled
function isDown(lm, t, m) {
  return lm[t].y > lm[m].y + 0.02;
}

// tip near knuckle level = half folded
function isHalf(lm, t, m) {
  const dy = lm[m].y - lm[t].y;
  return dy > -0.01 && dy < 0.05;
}

function fingerStates(lm) {
  return {
    // Extended: tip well above its MCP knuckle
    index:       isUp(lm, 8,  5),
    middle:      isUp(lm, 12, 9),
    ring:        isUp(lm, 16, 13),
    pinky:       isUp(lm, 20, 17),
    // Curled: tip below its MCP knuckle (looser check for supporting fingers)
    indexDown:   isDown(lm, 8,  5),
    middleDown:  isDown(lm, 12, 9),
    ringDown:    isDown(lm, 16, 13),
    pinkyDown:   isDown(lm, 20, 17),
    // Half folded
    indexHalf:   isHalf(lm, 8,  5),
    middleHalf:  isHalf(lm, 12, 9),
    // Thumb: compare tip Y to wrist Y
    thumbUp:   lm[4].y < lm[0].y - 0.08,
    thumbDown: lm[4].y > lm[0].y + 0.05
  };
}

// Pinch: thumb tip close to index tip - works regardless of other fingers
function getPinchDist(lm) { return dist(lm[4], lm[8]); }

// Smooth + amplify: maps finger position to full screen
function smoothCursor(rawX, rawY) {
  // Flip X because video is mirrored
  const fx = 1.0 - rawX;
  // Remap from [CURSOR_IN_MIN, CURSOR_IN_MAX] -> [0, 1]
  // This means you don't need to move your finger to the extreme camera edges
  function remap(v) {
    return Math.max(0, Math.min(1,
      (v - CURSOR_IN_MIN) / (CURSOR_IN_MAX - CURSOR_IN_MIN)
    ));
  }
  const mx = remap(fx);
  const my = remap(rawY);
  // EMA smoothing - reduces jitter while keeping responsiveness
  cursorSmX += (mx - cursorSmX) * CURSOR_SMOOTH;
  cursorSmY += (my - cursorSmY) * CURSOR_SMOOTH;
  return { x: cursorSmX, y: cursorSmY };
}

// =============================================================================
// PER-FRAME GESTURE PIPELINE
//
// Priority order (highest first):
//   1. PINCH (thumb+index close) -> click or drag  [always checked first]
//   2. ONE FINGER UP, others down -> cursor arrow
//   3. TWO FINGERS fully up -> scroll UP continuously
//   4. TWO FINGERS half-folded -> scroll DOWN continuously
//   5. THUMBS UP (all fingers down, thumb clearly up) -> copy
//   6. THUMBS DOWN (all fingers down, thumb clearly down) -> paste
// =============================================================================
function processFrame(lm) {
  const f      = fingerStates(lm);
  const pinch  = getPinchDist(lm) < 0.07;  // ~7% frame width

  // Index tip position (smoothed + amplified) for cursor and click target
  const pos    = smoothCursor(lm[8].x, lm[8].y);

  // --- Gesture classification ---

  // ONE FINGER pointing = index clearly up, middle not extended
  const pointing     = f.index && !f.middle;

  // TWO FINGERS fully up = index + middle up, ring+pinky down, NOT in tab mode
  const twoFull      = f.index && f.middle && !f.ring && !f.pinky && tabMode === 'idle';

  // TWO FINGERS half = index + middle both half-folded
  const twoHalf      = f.indexHalf && f.middleHalf && !f.ring && !f.pinky;

  // OPEN HAND = all four fingers extended (any thumb state)
  const openHand     = f.index && f.middle && f.ring && f.pinky;

  // INDEX + RING (skip middle) = new tab gesture
  // Index up, middle DOWN, ring up, pinky down
  const indexRing    = f.index && !f.middle && f.ring && !f.pinky;

  // THUMBS UP = thumb tip well above wrist, all fingers curled
  const thumbsUp     = f.thumbUp  && !f.index && !f.middle && !f.ring && !f.pinky;

  // THUMBS DOWN = thumb tip well below wrist, all fingers curled
  const thumbsDown   = f.thumbDown && !f.index && !f.middle && !f.ring && !f.pinky;

  // =========================================================================
  // 1. PINCH -> CLICK (takes priority, works alongside pointing or two-finger)
  //    Thumb+index pinch fires a click at the current cursor position.
  //    Works even while the user is in pointing mode.
  // =========================================================================
  if (pinch) {
    if (!isPinching) {
      isPinching      = true;
      pinchStartX     = pos.x;
      pinchStartY     = pos.y;
      pinchDragActive = false;
    } else {
      const dx = Math.abs(pos.x - pinchStartX);
      const dy = Math.abs(pos.y - pinchStartY);
      if (!pinchDragActive && (dx > 0.04 || dy > 0.04)) {
        pinchDragActive = true;
        sendToTab({ type: 'GESTURE_DRAG_START', nx: pinchStartX, ny: pinchStartY });
        gestureLabel.textContent = 'DRAG SELECT';
      }
      if (pinchDragActive) {
        sendToTab({ type: 'GESTURE_DRAG_MOVE', nx: pos.x, ny: pos.y });
      }
    }
    // While pinching still show cursor at pinch point
    sendToTab({ type: 'GESTURE_CURSOR_MOVE', nx: pos.x, ny: pos.y });
    gestureLabel.textContent = pinchDragActive ? 'DRAG SELECT' : 'PINCHING...';
    stopScroll();
    return;
  } else if (isPinching) {
    if (pinchDragActive) {
      sendToTab({ type: 'GESTURE_DRAG_END' });
      gestureLabel.textContent = 'SELECT DONE';
    } else {
      // Simple click at cursor position
      debounce('PINCH_CLICK', () => {
        sendToTab({ type: 'GESTURE_PINCH_CLICK', nx: pos.x, ny: pos.y });
        showGestureFeedback('CLICK');
      });
    }
    isPinching      = false;
    pinchDragActive = false;
  }

  // =========================================================================
  // NEW TAB: index + ring (middle curled, pinky curled)
  // Hold index up, curl middle finger down, hold ring up, pinky down
  // =========================================================================
  if (indexRing && tabMode === 'idle') {
    debounce('NEW_TAB', () => {
      chrome.runtime.sendMessage({ type: 'TAB_ACTION', action: 'new_tab' });
      showGestureFeedback('NEW TAB');
    });
    gestureLabel.textContent = 'NEW TAB';
    stopScroll();
    return;
  }

  // =========================================================================
  // TAB SWITCHER - 3-step flow:
  //   STEP 1: Show open hand  -> enter browsing mode, overlay appears
  //   STEP 2: Close to fist   -> move fist left/right to navigate tabs
  //   STEP 3: Open hand again -> confirm and switch to highlighted tab
  //           (or show index finger to cancel)
  // =========================================================================

  // Classify fist: all four fingers curled (regardless of thumb)
  const isFist = f.indexDown && f.middleDown && f.ringDown && f.pinkyDown;

  if (tabMode === 'idle') {
    // ---- STEP 1: open hand triggers tab mode entry ----
    if (openHand) {
      stopScroll();
      tabMode        = 'browsing';
      tabFistXSmooth = 1 - lm[0].x;  // init to current wrist X
      tabFistXPrev   = tabFistXSmooth;
      chrome.runtime.sendMessage({ type: 'TAB_ACTION', action: 'get_tabs' }, (resp) => {
        if (resp && resp.tabs) {
          tabList      = resp.tabs;
          tabHighlight = resp.activeIndex || 0;
          showTabOverlay(tabList, tabHighlight);
        }
      });
      gestureLabel.textContent = 'TABS: open - close fist to browse';
      return;
    }
    // Not in tab mode - fall through to normal gestures

  } else if (tabMode === 'browsing') {
    // ---- Waiting for fist or cancel ----
    if (openHand) {
      // Still showing open hand - just hold, waiting
      gestureLabel.textContent = 'TABS: close fist to browse';
      stopScroll();
      return;
    }
    if (isFist) {
      // Closed to fist - enter selecting mode
      tabMode        = 'selecting';
      tabFistXSmooth = 1 - lm[0].x;
      tabFistXPrev   = tabFistXSmooth;
      gestureLabel.textContent = 'TABS: move fist left/right';
      stopScroll();
      return;
    }
    // Any other gesture cancels
    exitTabMode();

  } else if (tabMode === 'selecting') {
    // ---- Fist held: move left/right to navigate ----
    if (isFist) {
      // Smooth wrist X position (flipped because mirror)
      const rawX = 1 - lm[0].x;
      tabFistXSmooth += (rawX - tabFistXSmooth) * TAB_SMOOTH;

      const delta = tabFistXSmooth - tabFistXPrev;

      if (delta > TAB_STEP_DIST && tabHighlight < tabList.length - 1) {
        // Moved right -> next tab
        tabHighlight++;
        tabFistXPrev = tabFistXSmooth;
        updateTabOverlay(tabHighlight);
        gestureLabel.textContent = 'TAB ' + (tabHighlight + 1) + '/' + tabList.length;
      } else if (delta < -TAB_STEP_DIST && tabHighlight > 0) {
        // Moved left -> previous tab
        tabHighlight--;
        tabFistXPrev = tabFistXSmooth;
        updateTabOverlay(tabHighlight);
        gestureLabel.textContent = 'TAB ' + (tabHighlight + 1) + '/' + tabList.length;
      } else {
        gestureLabel.textContent = 'TAB ' + (tabHighlight + 1) + '/' + tabList.length + ' - open hand to select';
      }
      stopScroll();
      return;
    }
    if (openHand) {
      // Opened hand again = CONFIRM selection
      const t = tabList[tabHighlight];
      if (t) {
        chrome.runtime.sendMessage({ type: 'TAB_ACTION', action: 'switch_tab', tabId: t.id });
        showGestureFeedback('SWITCHED TO TAB ' + (tabHighlight + 1));
      }
      exitTabMode();
      return;
    }
    // pointing finger = cancel
    if (pointing) {
      exitTabMode();
      // Fall through to cursor handling
    } else {
      // Any other non-fist gesture: stay in selecting so accidental
      // gesture doesn't bail out - only pointing/open cancels
      gestureLabel.textContent = 'TAB ' + (tabHighlight + 1) + '/' + tabList.length;
      stopScroll();
      return;
    }
  }

  // =========================================================================
  // 2. ONE FINGER -> CURSOR ARROW
  // =========================================================================
  if (pointing) {
    cursorVisible = true;
    sendToTab({ type: 'GESTURE_CURSOR_MOVE', nx: pos.x, ny: pos.y });
    gestureLabel.textContent = 'CURSOR';
    stopScroll();
    return;
  } else if (cursorVisible && !pointing) {
    cursorVisible = false;
    sendToTab({ type: 'GESTURE_CURSOR_HIDE' });
  }

  // =========================================================================
  // 3. TWO FINGERS FULLY UP -> SCROLL UP (continuous)
  // =========================================================================
  if (twoFull) {
    startScroll('up');
    gestureLabel.textContent = 'SCROLL UP';
    return;
  }

  // =========================================================================
  // 4. TWO FINGERS HALF-FOLDED -> SCROLL DOWN (continuous)
  // =========================================================================
  if (twoHalf) {
    startScroll('down');
    gestureLabel.textContent = 'SCROLL DOWN';
    return;
  }

  // Neither scroll pose - stop scrolling
  stopScroll();

  // =========================================================================
  // 5. THUMBS UP -> COPY
  // =========================================================================
  if (thumbsUp) {
    debounce('THUMBS_UP', () => {
      sendToTab({ type: 'GESTURE_COPY' });
      showGestureFeedback('COPY');
    });
    gestureLabel.textContent = 'COPY';
    return;
  }

  // =========================================================================
  // 6. THUMBS DOWN -> PASTE
  // =========================================================================
  if (thumbsDown) {
    debounce('THUMBS_DOWN', () => {
      sendToTab({ type: 'GESTURE_PASTE' });
      showGestureFeedback('PASTE');
    });
    gestureLabel.textContent = 'PASTE';
    return;
  }

  gestureLabel.textContent = 'Hand detected';
}

// =============================================================================
// CONTINUOUS SCROLL HELPERS
// Instead of firing a message every tick from the popup (which causes
// popup -> background -> content round-trip latency), we send one
// GESTURE_SCROLL_START message and let content.js run the interval
// entirely inside the page. Much lower latency, no dropped frames.
// =============================================================================
function startScroll(dir) {
  if (scrollDir === dir) return; // already scrolling this direction
  stopScroll();
  scrollDir = dir;
  sendToTab({ type: 'GESTURE_SCROLL_START', dir: dir, px: SCROLL_PX, ms: SCROLL_MS });
}

function stopScroll() {
  if (!scrollDir) return;
  scrollDir = 0;
  sendToTab({ type: 'GESTURE_SCROLL_STOP' });
}

// =============================================================================
// HELPERS
// =============================================================================
const _debounceTimes = {};
function debounce(key, fn, cooldown) {
  cooldown = cooldown === undefined ? GESTURE_COOLDOWN : cooldown;
  const now = Date.now();
  if (now - (_debounceTimes[key] || 0) < cooldown) return;
  _debounceTimes[key] = now;
  fn();
}

function showGestureFeedback(label) {
  gesturePill.textContent = label;
  gesturePill.classList.add('triggered');
  setTimeout(function() {
    gesturePill.classList.remove('triggered');
    gesturePill.textContent = 'ACTIVE';
  }, 800);
}

function sendToTab(msg) {
  chrome.runtime.sendMessage({ type: 'GESTURE_TO_TAB', payload: msg });
}

// =============================================================================
// TAB SWITCHER OVERLAY
// Injected into the active Chrome tab via background -> executeScript
// =============================================================================
function showTabOverlay(tabs, activeIdx) {
  chrome.runtime.sendMessage({
    type: 'TAB_OVERLAY',
    action: 'show',
    tabs: tabs,
    activeIdx: activeIdx
  });
}

function updateTabOverlay(activeIdx) {
  // Must send full tabList so background can rebuild pills with new highlight
  chrome.runtime.sendMessage({
    type: 'TAB_OVERLAY',
    action: 'update',
    tabs: tabList,
    activeIdx: activeIdx
  });
}

function exitTabMode() {
  tabMode    = 'idle';
  tabList    = [];
  chrome.runtime.sendMessage({ type: 'TAB_OVERLAY', action: 'hide' });
  gestureLabel.textContent = 'Hand detected';
}

// =============================================================================
// BOOT
// =============================================================================
window.onload = checkAuth;