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
    # Example: abcdefghijklmnopabcdefghijklmnop
    EXTENSION_ID:             str = os.getenv("EXTENSION_ID", "")


settings = Settings()