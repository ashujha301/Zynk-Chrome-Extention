# app/services/user_services.py
import logging
import requests
from sqlalchemy.orm import Session
from app.db.models.user import User
from app.core.config import settings

logger = logging.getLogger(__name__)


# =============================================================================
# Clerk API — fetch user's display name
# =============================================================================

def _fetch_clerk_name(clerk_id: str) -> str | None:
    """
    Calls Clerk Backend API to get first_name + last_name.
    Falls back to username, then email prefix, then None.
    Requires CLERK_SECRET_KEY in .env.
    """
    if not settings.CLERK_SECRET_KEY:
        logger.warning("CLERK_SECRET_KEY not set — display_name will be null")
        return None

    try:
        resp = requests.get(
            f"https://api.clerk.com/v1/users/{clerk_id}",
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            timeout=5,
        )
        if resp.status_code != 200:
            logger.warning("Clerk API returned %s for user %s", resp.status_code, clerk_id)
            return None

        data = resp.json()

        # Priority: full name → username → first email prefix
        first = (data.get("first_name") or "").strip()
        last  = (data.get("last_name")  or "").strip()
        if first or last:
            return f"{first} {last}".strip()

        if data.get("username"):
            return data["username"]

        emails = data.get("email_addresses", [])
        if emails:
            return emails[0]["email_address"].split("@")[0]

        return None

    except Exception as e:
        logger.error("Clerk name fetch failed for %s: %s", clerk_id, e)
        return None


# =============================================================================
# User CRUD
# =============================================================================

def get_or_create_user(db: Session, clerk_id: str) -> User:
    user = db.query(User).filter(User.clerk_id == clerk_id).first()

    if not user:
        # New user — fetch their name from Clerk right now
        display_name = _fetch_clerk_name(clerk_id)
        user = User(clerk_id=clerk_id, credits=100, display_name=display_name)
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Created user %s (%s)", clerk_id, display_name)

    elif not user.display_name:
        # Existing user created before we added display_name — backfill it
        display_name = _fetch_clerk_name(clerk_id)
        if display_name:
            user.display_name = display_name
            db.commit()
            db.refresh(user)
            logger.info("Backfilled name for %s: %s", clerk_id, display_name)

    return user


def deduct_credits(db: Session, clerk_id: str, amount: int = 1):
    user = db.query(User).filter(User.clerk_id == clerk_id).first()

    if not user:
        return None

    if user.credits < amount:
        return "INSUFFICIENT_CREDITS"

    user.credits -= amount
    db.commit()
    db.refresh(user)
    return user