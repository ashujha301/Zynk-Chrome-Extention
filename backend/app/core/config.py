import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    CLERK_JWKS_URL: str = os.getenv("CLERK_JWKS_URL")


settings = Settings()