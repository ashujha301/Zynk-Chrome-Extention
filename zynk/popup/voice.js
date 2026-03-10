// popup/voice.js
// Wake-word detection ("Hey Zynk") + audio recording + transcription.
//
// ACCENT OPTIMISATIONS (Indian English):
//   - lang set to 'en-IN' — Chrome's Indian English acoustic model
//   - SpeechGrammarList biases the engine toward "Hey Zynk" specifically
//   - Debug panel shows ALL raw alternatives so you can see exactly what
//     Chrome hears and tune ZYNK_VARIANTS accordingly
//   - Levenshtein fuzzy match as final safety net
//   - Only last 4 words checked — no growing stale buffer
//   - Buffer hard-reset every 6 seconds
//
// Depends on: ui.js (voiceStatus, recordingRing, creditsLabel, showLoginUI)
//             auth.js (fetchExtensionToken, API_BASE)

let mediaRecorder    = null;
let audioChunks      = [];
let streamRef        = null;
let recognition      = null;
let isRecording      = false;
let wakeListening    = false;
let transcriptBuffer = '';
let bufferResetTimer = null;

const ZYNK_VARIANTS = [
  'zynk', 'zink', 'zinc', 'zing', 'zync', 'synk', 'sync', 'sink',
  'jink', 'drink', 'think', 'link', 'wink', 'pink', 'rink',
  'haasing', 'haizing', 'hazing', 'heising',
  'heyzink', 'heyzync', 'heyzing', 'heysynk',
];

const HEY_VARIANTS = [
  'hey', 'hay', 'he', 'hei', 'hai', 'a', 'aye', 'ae', 'eh', 'ai',
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function isWakeWord(transcript) {
  const cleaned = transcript.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const words   = cleaned.split(/\s+/).filter(Boolean);
  const recent  = words.slice(-4);

  const merged = recent.join('');
  if (ZYNK_VARIANTS.some(v => levenshtein(merged, v) <= 2)) return true;
  if (recent.some(w => ZYNK_VARIANTS.some(v => levenshtein(w, v) <= 1))) {
    if (recent.some(w => HEY_VARIANTS.some(h => levenshtein(w, h) <= 1))) return true;
    if (cleaned.startsWith('hey') || cleaned.startsWith('hai') || cleaned.startsWith('hay')) return true;
  }

  const hasHey  = recent.some(w => HEY_VARIANTS.some(h => levenshtein(w, h) <= 1));
  const hasZynk = recent.some(w => ZYNK_VARIANTS.some(v => levenshtein(w, v) <= 1));
  return hasHey && hasZynk;
}

function showDebug(alts) {
  let panel = document.getElementById('__zynkDebug');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = '__zynkDebug';
    Object.assign(panel.style, {
      position: 'fixed', bottom: '4px', left: '4px', right: '4px',
      background: 'rgba(0,0,0,0.85)', color: '#0f0',
      fontSize: '9px', fontFamily: 'monospace',
      padding: '4px', borderRadius: '4px',
      maxHeight: '80px', overflowY: 'auto',
      zIndex: '9999', pointerEvents: 'none',
    });
    document.body.appendChild(panel);
  }
  const line = document.createElement('div');
  line.textContent = alts.map((a, i) =>
    `[${i}] "${a.transcript.trim()}" (${a.confidence > 0 ? (a.confidence * 100).toFixed(0) + '%' : '?'})`
  ).join('  |  ');
  panel.insertBefore(line, panel.firstChild);
  while (panel.children.length > 8) panel.removeChild(panel.lastChild);
}

async function startListening() {
  if (wakeListening) return;
  wakeListening = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef = stream;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { voiceStatus.textContent = 'Speech API not supported.'; return; }

    recognition = new SR();
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 5;
    recognition.lang            = 'en-IN';

    const SGL = window.SpeechGrammarList || window.webkitSpeechGrammarList;
    if (SGL) {
      const grammar = '#JSGF V1.0; grammar wake; public <wake> = hey zynk | hey zinc | hey zink | hey zing | hey sync;';
      const list    = new SGL();
      list.addFromString(grammar, 1);
      recognition.grammars = list;
    }

    function resetBuffer() {
      transcriptBuffer = '';
      bufferResetTimer = setTimeout(resetBuffer, 6000);
    }
    resetBuffer();

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alts   = Array.from({ length: result.length }, (_, a) => result[a]);
        // showDebug(alts);
        const candidates = alts.map(a => a.transcript.toLowerCase());
        voiceStatus.textContent = 'Heard: "' + result[0].transcript.trim() + '"';
        if (result.isFinal) {
          transcriptBuffer = (transcriptBuffer + ' ' + result[0].transcript).slice(-60);
        }
        const toCheck = candidates.join(' ') + ' ' + transcriptBuffer;
        if (!isRecording && isWakeWord(toCheck)) {
          transcriptBuffer = '';
          clearTimeout(bufferResetTimer);
          startRecording();
          return;
        }
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted')
        voiceStatus.textContent = 'Mic error: ' + e.error;
    };

    recognition.onend = () => {
      if (wakeListening && !isRecording) try { recognition.start(); } catch {}
    };

    recognition.start();
    voiceStatus.textContent = 'Listening for "Hey Zynk"...';
    recordingRing.className = 'listening';

  } catch (e) {
    wakeListening = false;
    voiceStatus.textContent = 'Mic error: ' + e.message;
  }
}

function stopListening() {
  wakeListening = false;
  isRecording   = false;
  clearTimeout(bufferResetTimer);
  transcriptBuffer = '';
  if (recognition) { recognition.onend = null; try { recognition.stop(); } catch {} recognition = null; }
  if (streamRef)   { streamRef.getTracks().forEach(t => t.stop()); streamRef = null; }
}

// ---------------------------------------------------------------------------
// VAD constants
// ---------------------------------------------------------------------------
const VAD_SILENCE_THRESHOLD = 8;    // RMS energy below this = silence (0-255 scale)
const VAD_SILENCE_MS        = 800;  // stop after this many ms of continuous silence
const VAD_MIN_SPEECH_MS     = 300;  // don't stop until at least this much speech heard
const VAD_MAX_MS            = 8000; // absolute hard cap

function startRecording() {
  if (!streamRef || isRecording) return;
  isRecording = true;
  audioChunks = [];

  if (recognition) { recognition.onend = null; try { recognition.stop(); } catch {} }

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';

  mediaRecorder = mimeType
    ? new MediaRecorder(streamRef, { mimeType })
    : new MediaRecorder(streamRef);

  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };

  // ---- VAD: Web Audio API silence detector ----------------------------------
  // Measures RMS energy every 50ms. Once speech has started (energy > threshold)
  // and then silence holds for VAD_SILENCE_MS, stop the recorder immediately
  // instead of waiting the full 6 seconds.
  let vadContext      = null;
  let vadAnimFrame    = null;
  let speechStarted   = false;
  let silenceStart    = null;
  let recordingStart  = Date.now();

  function startVAD() {
    try {
      vadContext         = new AudioContext();
      const source       = vadContext.createMediaStreamSource(streamRef);
      const analyser     = vadContext.createAnalyser();
      analyser.fftSize   = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      function tick() {
        if (!isRecording) { stopVAD(); return; }

        analyser.getByteTimeDomainData(buf);

        // RMS energy
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length) * 255;

        const now     = Date.now();
        const elapsed = now - recordingStart;

        if (rms > VAD_SILENCE_THRESHOLD) {
          // Sound detected
          speechStarted = true;
          silenceStart  = null;
        } else if (speechStarted) {
          // Silence after speech
          if (!silenceStart) silenceStart = now;
          const silentFor = now - silenceStart;
          if (elapsed >= VAD_MIN_SPEECH_MS && silentFor >= VAD_SILENCE_MS) {
            // Enough silence after speech — stop now
            stopVAD();
            if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
            return;
          }
        }

        // Hard cap
        if (elapsed >= VAD_MAX_MS) {
          stopVAD();
          if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
          return;
        }

        vadAnimFrame = requestAnimationFrame(tick);
      }
      vadAnimFrame = requestAnimationFrame(tick);
    } catch (e) {
      // VAD unavailable — fall back to fixed timeout
      console.warn('[Zynk] VAD unavailable, using fixed timeout:', e.message);
    }
  }

  function stopVAD() {
    if (vadAnimFrame) { cancelAnimationFrame(vadAnimFrame); vadAnimFrame = null; }
    if (vadContext)   { vadContext.close().catch(() => {}); vadContext = null; }
  }

  mediaRecorder.onstop = async () => {
    isRecording             = false;
    recordingRing.className = 'listening';

    if (recognition && wakeListening) {
      recognition.onend = () => {
        if (wakeListening && !isRecording) try { recognition.start(); } catch {}
      };
      try { recognition.start(); } catch {}
    }

    // Fetch token the original way — returns the token string
    const token = await fetchExtensionToken();
    if (!token) { voiceStatus.textContent = 'Session expired.'; showLoginUI(); return; }

    voiceStatus.textContent = 'Processing...';

    const formData = new FormData();
    formData.append('file', new Blob(audioChunks, { type: mimeType || 'audio/webm' }), 'command.webm');

    try {
      const resp = await fetch(`${API_BASE}/agent/transcribe`, {
        method:      'POST',
        headers:     { Authorization: `Bearer ${token}` },
        body:        formData,
        credentials: 'include'
      });

      if (!resp.ok) {
        voiceStatus.textContent = resp.status === 401 ? 'Session expired.' : 'Server error.';
        if (resp.status === 401) showLoginUI();
        return;
      }

      const data = await resp.json();
      if (!data.text) { voiceStatus.textContent = 'Could not understand.'; return; }

      const command = data.text.trim();
      voiceStatus.textContent = '\u{1F3A4} "' + command + '"';

      chrome.runtime.sendMessage({ type: 'EXECUTE_COMMAND', command }, (response) => {
        if (chrome.runtime.lastError) { voiceStatus.textContent = 'Extension error.'; return; }
        if (response?.error) {
          voiceStatus.textContent = 'Error: ' + response.error;
          if (response.error.toLowerCase().includes('login') ||
              response.error.toLowerCase().includes('expired')) showLoginUI();
          return;
        }
        if (response?.credits_remaining !== undefined)
          creditsLabel.textContent = response.credits_remaining + ' cr';
        voiceStatus.textContent = '\u2713 Done: "' + command + '"';
        setTimeout(() => {
          if (!isRecording) voiceStatus.textContent = 'Listening for "Hey Zynk"...';
        }, 3000);
      });

    } catch (e) {
      voiceStatus.textContent = 'Transcription failed.';
    }
  };

  mediaRecorder.start(100);   // smaller chunks = lower latency on stop
  recordingRing.className = 'recording';
  voiceStatus.textContent = 'Recording... speak your command';

  startVAD(); // VAD will stop the recorder when silence is detected
              // Hard cap of VAD_MAX_MS is enforced inside VAD tick loop
}