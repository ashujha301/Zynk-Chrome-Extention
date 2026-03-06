# Zynk — AI-Powered Browser Automation

> Voice and gesture controlled browser automation, powered by LLMs.

Zynk is a Chrome extension that lets you control your browser hands-free using natural voice commands and gestures. It connects to a secure backend powered by large language models to interpret your intent and execute actions directly in the browser.

---

## Features

- **Voice Control** — WakeUp word detection, OpenAI API to execute voice commands with chrome enabled usage
- **Gesture Control** — Trigger browser actions through hand gestures via your webcam
- **LLM-Powered** — Commands are interpreted by an LLM for flexible, context-aware automation
- **Secure Auth** — Clerk JWT-based authentication via httpOnly cookies with `SameSite=None` and `Secure` flag support

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome Extension (Manifest V3) |
| Backend | Python / FastAPI + Uvicorn |
| Frontend | Next.JS |
| Auth | Clerk Auth |
| Voice | LLM integration |
| Gesture | MediaPipe |

---

## Installation

### Prerequisites

- Python 3.9+
- Node.js (for extension bundling)
- Google Chrome

### 1. Clone the repo

```bash
git clone https://github.com/your-username/zynk-chrome-extension.git
cd zynk-chrome-extension
```

### 2. Set up the backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
```

### 3. Load the extension in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` folder

---

## Local Development

The backend authenticates users via a JWT stored in an `httpOnly` cookie named `access_token`. To allow the extension to read this cookie, it is set with `SameSite=None`. Most browsers require such cookies to also be marked `Secure` (HTTPS only).

You have two options for local development:

### Option 1 — HTTP with insecure cookies (easiest)

Add the following to your `.env` file:

```env
SECURE_COOKIES=False
```

The backend will set the cookie without the `Secure` flag, so the extension works over plain HTTP. **Never use this in production.**

Start the backend:

```bash
uvicorn main:app --reload --port 8000
```

### Option 2 — HTTPS with secure cookies (recommended)

Generate a self-signed certificate:

```bash
mkcert ( file name )
```

Start the backend with SSL:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 \
  --ssl-keyfile filename-key.pem --ssl-certfile filename.pem
```

Then visit `https://localhost:8000` in Chrome and accept the self-signed certificate warning. The extension and web app will communicate over HTTPS.

> Once the cookie is visible to Chrome, the extension popup will show **"Logged in"** and will no longer open the login page repeatedly.

---

## Usage

1. Start the backend (see above)
2. Click the **Zynk** icon in your Chrome toolbar
3. Log in via the popup
4. Use voice commands or gestures to control your browser

---