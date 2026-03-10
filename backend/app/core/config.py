import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATABASE_URL:             str = os.getenv("DATABASE_URL")
    CLERK_JWKS_URL:           str = os.getenv("CLERK_JWKS_URL")

    # Used to sign extension JWTs
    SECRET_KEY:               str = os.getenv("SECRET_KEY", "dev-secret-change")
    EXT_TOKEN_EXPIRE_SECONDS: int = int(os.getenv("EXT_TOKEN_EXPIRE_SECONDS", 3600))

    # Chrome extension ID — find it at chrome://extensions after loading unpacked.
    # Required for CORS to allow cookie-credentialed requests from the extension.

    EXTENSION_ID:             str = os.getenv("EXTENSION_ID", "")

    # Used to fetch user display names. Starts with sk_live_ or sk_test_
    CLERK_SECRET_KEY:         str = os.getenv("CLERK_SECRET_KEY", "")

    # Faster-Whisper
    # Model size: tiny | base | small | medium | large-v2
    # "base" = ~200ms on M1, "small" = ~400ms better accents
    WHISPER_MODEL:            str = os.getenv("WHISPER_MODEL", "base")

    # "cpu" for M1 Mac (CoreML path), "cuda" for GPU server
    WHISPER_DEVICE:           str = os.getenv("WHISPER_DEVICE", "cpu")

    WHISPER_COMPUTE_TYPE:     str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")


settings = Settings()