// =============================================================================
// popup/camera.js
// Camera lifecycle, MediaPipe Tasks Vision init, render loop, skeleton draw.
// Depends on: ui.js (camVideo, camCanvas, camCtx, gestureLabel, gesturePill,
//                    camStartBtn, camStopBtn, gestureToggleBtn, gesturePanel)
//             gesture-actions.js (sendToTab)
//             gesture-detection.js (onHandResults is called from here)
// =============================================================================

// -- State --------------------------------------------------------------------
let camStream     = null;
let handsModel    = null;
let animFrameId   = null;
let gestureActive = false;
let panelOpen     = false;
let lastVideoTime = -1;

// -- Skeleton connections (MediaPipe 21-landmark layout) ----------------------
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

// =============================================================================
// GESTURE PANEL TOGGLE
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
// CAMERA START / STOP
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

    gestureActive           = true;
    camStartBtn.disabled    = true;
    camStopBtn.disabled     = false;
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

  sendToTab({ type: 'GESTURE_CURSOR_HIDE' }); // defined in gesture-actions.js
}

// =============================================================================
// MEDIAPIPE TASKS VISION INIT
// Requires files in extension mediapipe/ folder:
//   vision_bundle.mjs, hand_landmarker.task, wasm/ folder
// CSP: manifest must have "wasm-unsafe-eval" in extension_pages.
// =============================================================================
async function initHandLandmarker() {
  if (handsModel) return;
  gestureLabel.textContent = 'Loading hand model...';

  try {
    const { HandLandmarker, FilesetResolver } = await import(
      chrome.runtime.getURL('mediapipe/vision_bundle.mjs')
    );

    const vision = await FilesetResolver.forVisionTasks(
      chrome.runtime.getURL('mediapipe/wasm')
    );

    handsModel = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: chrome.runtime.getURL('mediapipe/hand_landmarker.task'),
        delegate: 'GPU'
      },
      runningMode:                'VIDEO',
      numHands:                   1,
      minHandDetectionConfidence: 0.7,
      minHandPresenceConfidence:  0.7,
      minTrackingConfidence:      0.6
    });

    gestureLabel.textContent = 'Show your hand';

  } catch (e) {
    console.error('[Zynk] HandLandmarker init failed:', e);
    gestureLabel.textContent = 'Model load failed - see console';
    handsModel           = null;
    gestureActive        = false;
    camStartBtn.disabled = false;
    camStopBtn.disabled  = true;
  }
}

// =============================================================================
// RENDER LOOP
// Calls handsModel.detectForVideo each new frame, feeds results to pipeline.
// =============================================================================
function renderLoop() {
  if (!gestureActive) return;
  animFrameId = requestAnimationFrame(() => {
    if (handsModel && camVideo.readyState >= 2) {
      const nowMs = performance.now();
      if (camVideo.currentTime !== lastVideoTime) {
        lastVideoTime = camVideo.currentTime;
        const results = handsModel.detectForVideo(camVideo, nowMs);
        onHandResults(results); // defined in gesture-detection.js
      }
    }
    renderLoop();
  });
}

// =============================================================================
// HAND RESULTS DISPATCHER
// Clears canvas, draws skeleton, calls gesture pipeline.
// =============================================================================
function onHandResults(results) {
  camCtx.clearRect(0, 0, camCanvas.width, camCanvas.height);

  if (!results.landmarks || results.landmarks.length === 0) {
    gestureLabel.textContent = 'No hand detected';
    // Force-hide cursor and stop scroll
    sendToTab({ type: 'GESTURE_CURSOR_HIDE' });
    sendToTab({ type: 'GESTURE_SCROLL_STOP' });
    // If tab overlay was open, close it now - overlay must ONLY show while palm visible
    if (tabMode !== 'idle') {
      exitTabMode(); // defined in gesture-actions.js - hides overlay + resets state
    }
    // Reset gesture-detection.js state vars
    cursorVisible   = false;
    cursorFrozen    = false;
    pinchHeld       = false;
    pinchDragActive = false;
    scrollActive    = false;
    return;
  }

  const lm = results.landmarks[0]; // normalised {x,y,z} 0..1
  drawSkeleton(lm);
  processFrame(lm); // defined in gesture-detection.js
}

// =============================================================================
// DRAW SKELETON
// =============================================================================
function drawSkeleton(lm) {
  const W = camCanvas.width;
  const H = camCanvas.height;

  // Bones
  camCtx.strokeStyle = 'rgba(124,106,255,0.65)';
  camCtx.lineWidth   = 2;
  for (const [a, b] of CONNECTIONS) {
    camCtx.beginPath();
    camCtx.moveTo(lm[a].x * W, lm[a].y * H);
    camCtx.lineTo(lm[b].x * W, lm[b].y * H);
    camCtx.stroke();
  }
  // All joints
  for (const p of lm) {
    camCtx.beginPath();
    camCtx.arc(p.x * W, p.y * H, 3, 0, Math.PI * 2);
    camCtx.fillStyle = '#7c6aff';
    camCtx.fill();
  }
  // Fingertips highlighted
  for (const i of [4, 8, 12, 16, 20]) {
    camCtx.beginPath();
    camCtx.arc(lm[i].x * W, lm[i].y * H, 5, 0, Math.PI * 2);
    camCtx.fillStyle = 'rgba(255,255,255,0.9)';
    camCtx.fill();
  }
}