from __future__ import annotations

from flask import request
from flask_jwt_extended import get_current_user, jwt_required

from ...services import investment_service as svc
from ...utils.responses import created, error, ok
from . import bp


@bp.get("/catalogues")
@jwt_required()
def catalogues():
    user = get_current_user()
    return ok(svc.get_catalogues(user.id))


@bp.get("/portfolio")
@jwt_required()
def portfolio():
    user = get_current_user()
    return ok(svc.portfolio(
        user.id,
        request.args.get("wallet_id"),
        request.args.get("platform_id"),
        request.args.get("type"),
        request.args.get("ticker"),
    ))


@bp.get("/portfolio/timeseries")
@jwt_required()
def portfolio_timeseries():
    user = get_current_user()
    return ok(svc.portfolio_timeseries(
        user.id,
        request.args.get("wallet_id"),
        request.args.get("granularity", "month"),
        request.args.get("range", "max"),
        request.args.get("platform_id"),
        request.args.get("type"),
        request.args.get("ticker"),
    ))


@bp.get("/wallets/summary")
@jwt_required()
def wallets_summary():
    user = get_current_user()
    return ok(svc.wallets_summary(user.id))


@bp.get("/platforms/summary")
@jwt_required()
def platforms_summary():
    user = get_current_user()
    return ok(svc.platforms_summary(
        user.id, request.args.get("wallet_id"),
        request.args.get("type"), request.args.get("ticker")))


@bp.get("/types/summary")
@jwt_required()
def types_summary():
    user = get_current_user()
    return ok(svc.types_summary(
        user.id, request.args.get("wallet_id"),
        request.args.get("platform_id"), request.args.get("ticker")))


@bp.get("/symbols/<path:ticker>")
@jwt_required()
def symbol_detail(ticker):
    user = get_current_user()
    range_key = request.args.get("range", "1y")
    detail = svc.symbol_detail(user.id, ticker, range_key)
    if not detail:
        return error("NOT_FOUND", "Símbolo no encontrado", 404)
    return ok(detail)


@bp.get("/operations")
@jwt_required()
def list_operations():
    user = get_current_user()
    filters = {
        "wallet_id": request.args.get("wallet_id"),
        "platform_id": request.args.get("platform_id"),
        "type": request.args.get("type"),
        "ticker": request.args.get("ticker"),
        "page": request.args.get("page", 1),
        "per_page": request.args.get("per_page", 50),
    }
    result = svc.list_operations(user.id, filters)
    return ok(result["items"], meta={
        "total": result["total"], "page": result["page"],
        "per_page": result["per_page"], "pages": result["pages"],
    })


@bp.post("/operations")
@jwt_required()
def create_operation():
    user = get_current_user()
    body = request.get_json(silent=True) or {}
    for f in ("wallet_id", "platform_id", "ticker", "op_date"):
        if not body.get(f):
            return error("MISSING_FIELDS", f"{f} es obligatorio")
    op = svc.create_operation(user.id, body)
    return created(svc.op_to_dict(op))


@bp.post("/operations/bulk")
@jwt_required()
def create_operations_bulk():
    user = get_current_user()
    body = request.get_json(silent=True) or {}
    items = body.get("operations") or []
    if not items:
        return error("MISSING_FIELDS", "No hay operaciones que guardar")
    result = svc.create_operations_bulk(user.id, items)
    return created(result)


@bp.put("/operations/<op_id>")
@jwt_required()
def update_operation(op_id):
    user = get_current_user()
    op = svc.get_operation(user.id, op_id)
    if not op:
        return error("NOT_FOUND", "Operación no encontrada", 404)
    body = request.get_json(silent=True) or {}
    op = svc.update_operation(op, body)
    return ok(svc.op_to_dict(op))


@bp.delete("/operations/<op_id>")
@jwt_required()
def delete_operation(op_id):
    user = get_current_user()
    op = svc.get_operation(user.id, op_id)
    if not op:
        return error("NOT_FOUND", "Operación no encontrada", 404)
    svc.delete_operation(op)
    return ok({"message": "Operación eliminada"})
