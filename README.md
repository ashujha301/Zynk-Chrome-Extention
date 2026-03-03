# Zynk-Chrome-Extention
Zynk is an AI-powered Chrome extension that enables secure voice and gesture controlled browser automation using LLMs.

## Development notes

The backend authenticates users via a JWT stored in an httpOnly cookie named
`access_token`. To allow the extension to use the same cookie, it is set with
`SameSite=None`. Most browsers now **require** such cookies to be marked
`Secure` (i.e. only sent over HTTPS).

For local development you have two options:

1. **HTTP with insecure cookies** (easiest):
   Add `SECURE_COOKIES=False` to your `.env` file. The backend will then set the
   cookie without the `Secure` flag and the extension will work over plain
   `http://localhost:8000`. This is safe for local use but never use it in
   production.

2. **HTTPS with secure cookies** (more realistic):
   - Generate a self-signed certificate (for example with
     `openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days
     365 -nodes -subj "/C=US/ST=State/L=City/O=Org/OU=Unit/CN=localhost"`).
   - Start the backend with Uvicorn using `--ssl-keyfile key.pem --ssl-certfile
     cert.pem`.
   - Accept the browser warning for the self-signed cert.

   The extension and web app will then communicate over `https://localhost:8000`.

Once the cookie is visible to Chrome the extension popup will correctly show
"Logged in" and no longer open the login page repeatedly.
