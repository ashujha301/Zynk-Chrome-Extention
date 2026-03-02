from sqlalchemy.orm import Session
from app.db.models.user import User


def get_or_create_user(db: Session, clerk_id: str):
    user = db.query(User).filter(User.clerk_id == clerk_id).first()

    if not user:
        user = User(clerk_id=clerk_id, credits=100)
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


# Credit deduction -logic -------------------------------------------------
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