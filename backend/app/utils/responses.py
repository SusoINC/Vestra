from __future__ import annotations

from flask import jsonify


def ok(data, meta: dict | None = None, status: int = 200):
    """200 OK con datos."""
    return jsonify({"data": data, "meta": meta, "error": None}), status


def created(data, meta: dict | None = None):
    """201 Created."""
    return ok(data, meta, 201)


def error(code: str, message: str, status: int = 400):
    """Error con código semántico."""
    return (
        jsonify({"data": None, "meta": None, "error": {"code": code, "message": message}}),
        status,
    )
