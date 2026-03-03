import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    CLERK_JWKS_URL: str = os.getenv("CLERK_JWKS_URL")

    # Used to sign extension JWTs
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change")
    EXT_TOKEN_EXPIRE_SECONDS: int = int(
        os.getenv("EXT_TOKEN_EXPIRE_SECONDS", 300)
    )


settings = Settings()