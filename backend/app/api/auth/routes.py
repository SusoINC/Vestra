from __future__ import annotations

from flask import request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    jwt_required,
)

from ...services import auth_service
from ...utils.responses import created, error, ok
from . import bp


# ── Serializer ─────────────────────────────────────────────────────────────────

def _user_out(user) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "currency": user.currency,
        "timezone": user.timezone,
        "created_at": user.created_at.isoformat(),
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@bp.post("/register")
def register():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""

    if not name or not email or not password:
        return error("MISSING_FIELDS", "name, email y password son obligatorios")
    if len(password) < 8:
        return error("PASSWORD_TOO_SHORT", "La contraseña debe tener al menos 8 caracteres")

    try:
        user = auth_service.register_user(name, email, password)
    except ValueError as exc:
        code = str(exc)
        msg = {
            "EMAIL_TAKEN": "Este email ya está registrado",
        }.get(code, "Error al crear la cuenta")
        return error(code, msg)

    return created({
        "user": _user_out(user),
        "access_token": create_access_token(identity=user),
        "refresh_token": create_refresh_token(identity=user),
    })


@bp.post("/login")
def login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""

    try:
        user = auth_service.login_user(email, password)
    except ValueError:
        return error("INVALID_CREDENTIALS", "Email o contraseña incorrectos", 401)

    return ok({
        "user": _user_out(user),
        "access_token": create_access_token(identity=user),
        "refresh_token": create_refresh_token(identity=user),
    })


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    user = get_current_user()
    return ok({"access_token": create_access_token(identity=user)})


@bp.get("/me")
@jwt_required()
def me():
    user = get_current_user()
    if not user:
        return error("USER_NOT_FOUND", "Usuario no encontrado", 404)
    return ok({"user": _user_out(user)})


@bp.post("/logout")
@jwt_required()
def logout():
    # Sin blacklist por ahora; el cliente descarta los tokens
    return ok({"message": "Sesión cerrada"})
