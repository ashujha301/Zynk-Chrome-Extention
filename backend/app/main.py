from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import user, agent, auth
from app.core.config import settings

app = FastAPI(title="Zynk API")

# =============================================================================
# CORS
#
# credentials=True is required for cookies (httpOnly ext_token) to be sent
# cross-origin from the Chrome extension and the web frontend.
#
# allow_origins must list each origin explicitly — wildcard "*" is forbidden
# by browsers when credentials=True.
#
# The Chrome extension origin is:  chrome-extension://<EXTENSION_ID>
# Set EXTENSION_ID in your .env file. You can find it at chrome://extensions
# after loading the extension unpacked.
# =============================================================================

_extension_origin = (
    f"chrome-extension://{settings.EXTENSION_ID}"
    if settings.EXTENSION_ID
    else None
)

_allowed_origins = [
    "https://localhost:3000",   # web frontend
    "https://localhost:8000",   # backend (Swagger UI)
]
if _extension_origin:
    _allowed_origins.append(_extension_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,          # required for cookies
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Set-Cookie"],   # lets the browser see Set-Cookie on preflight
)


# Routes
app.include_router(auth.router,  prefix="/auth",  tags=["auth"])
app.include_router(user.router,  prefix="/user",  tags=["user"])
app.include_router(agent.router, prefix="/agent", tags=["agent"])


@app.get("/health")
def health():
    return {"status": "ok"}