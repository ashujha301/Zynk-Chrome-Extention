# app/db/models/user.py
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id           = Column(Integer,  primary_key=True, index=True)
    clerk_id     = Column(String,   unique=True, index=True, nullable=False)
    display_name = Column(String,   nullable=True)   # fetched from Clerk on first login
    credits      = Column(Integer,  default=100)

    # When credits were last reset — used by the monthly renewal job (task 2)
    # Null means user was created before renewal tracking was added
    credits_reset_at = Column(DateTime(timezone=True), server_default=func.now())