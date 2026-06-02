from __future__ import annotations

import os

from flask import Flask, jsonify
from flask_cors import CORS

from .config import config_map
from .extensions import db, jwt, migrate, scheduler


def create_app(env: str | None = None) -> Flask:
    env = env or os.environ.get("FLASK_ENV", "development")
    app = Flask(__name__)
    app.config.from_object(config_map.get(env, config_map["default"]))

    # ── Extensions ────────────────────────────────────────────────────
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ── Import models (needed by Alembic + JWT loaders) ───────────────
    with app.app_context():
        from .models import user, finance, investment, vehicle, project  # noqa: F401
        from .models.user import User

        # JWT: cómo extraer el identity del objeto User
        @jwt.user_identity_loader
        def user_identity_lookup(user_obj):
            return user_obj.id if hasattr(user_obj, "id") else user_obj

        # JWT: cómo reconstruir el User a partir del identity (sub)
        @jwt.user_lookup_loader
        def user_lookup_callback(_jwt_header, jwt_data):
            identity = jwt_data["sub"]
            return db.session.get(User, identity)

        # JWT error handlers — responden en formato estándar
        @jwt.unauthorized_loader
        def missing_token(reason):
            return jsonify({
                "data": None, "meta": None,
                "error": {"code": "MISSING_TOKEN", "message": reason},
            }), 401

        @jwt.invalid_token_loader
        def invalid_token(reason):
            return jsonify({
                "data": None, "meta": None,
                "error": {"code": "INVALID_TOKEN", "message": reason},
            }), 422

        @jwt.expired_token_loader
        def expired_token(_header, _data):
            return jsonify({
                "data": None, "meta": None,
                "error": {"code": "TOKEN_EXPIRED", "message": "El token ha expirado"},
            }), 401

    # ── Global HTTP error handlers ────────────────────────────────────
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"data": None, "meta": None,
                        "error": {"code": "BAD_REQUEST", "message": str(e)}}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"data": None, "meta": None,
                        "error": {"code": "NOT_FOUND", "message": "Recurso no encontrado"}}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"data": None, "meta": None,
                        "error": {"code": "METHOD_NOT_ALLOWED", "message": str(e)}}), 405

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"data": None, "meta": None,
                        "error": {"code": "SERVER_ERROR", "message": "Error interno del servidor"}}), 500

    # ── Blueprints ────────────────────────────────────────────────────
    from .api import register_blueprints
    register_blueprints(app)

    # ── Scheduler ─────────────────────────────────────────────────────
    if not scheduler.running:
        from .tasks import register_jobs
        register_jobs(scheduler)
        scheduler.start()

    return app
