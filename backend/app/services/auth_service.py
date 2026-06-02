from __future__ import annotations

import bcrypt
from sqlalchemy import select

from ..extensions import db
from ..models.user import User


# ── Password helpers ───────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ── Auth logic ─────────────────────────────────────────────────────────────────

def register_user(name: str, email: str, password: str) -> User:
    """Crea un nuevo usuario. Lanza ValueError si el email ya existe."""
    existing = db.session.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()

    if existing:
        raise ValueError("EMAIL_TAKEN")

    user = User(
        name=name,
        email=email.lower(),
        password_hash=hash_password(password),
    )
    db.session.add(user)
    db.session.commit()
    return user


def login_user(email: str, password: str) -> User:
    """Verifica credenciales. Lanza ValueError si son incorrectas."""
    user = db.session.execute(
        select(User).where(User.email == email.lower())
    ).scalar_one_or_none()

    if not user or not verify_password(password, user.password_hash):
        raise ValueError("INVALID_CREDENTIALS")

    return user


def get_user_by_id(user_id: str) -> User | None:
    return db.session.get(User, user_id)
