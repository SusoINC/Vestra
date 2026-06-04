from __future__ import annotations

from flask import request
from flask_jwt_extended import get_current_user, jwt_required

from ...services import finance_service, import_service
from ...utils.responses import created, error, ok
from . import bp


# ── Catalogues ─────────────────────────────────────────────────────────────────

@bp.get("/catalogues")
@jwt_required()
def catalogues():
    user = get_current_user()
    return ok(finance_service.get_catalogues(user.id))


# ── Accounts ───────────────────────────────────────────────────────────────────

@bp.get("/accounts")
@jwt_required()
def list_accounts():
    user = get_current_user()
    accounts = finance_service.list_accounts(user.id)
    return ok([finance_service.account_to_dict(a) for a in accounts])


@bp.post("/accounts")
@jwt_required()
def create_account():
    user = get_current_user()
    body = request.get_json(silent=True) or {}
    if not body.get("name"):
        return error("MISSING_FIELDS", "name es obligatorio")
    account = finance_service.create_account(user.id, body)
    return created(finance_service.account_to_dict(account))


@bp.put("/accounts/<account_id>")
@jwt_required()
def update_account(account_id):
    user = get_current_user()
    account = finance_service.get_account(user.id, account_id)
    if not account:
        return error("NOT_FOUND", "Cuenta no encontrada", 404)
    body = request.get_json(silent=True) or {}
    account = finance_service.update_account(account, body)
    return ok(finance_service.account_to_dict(account))


@bp.delete("/accounts/<account_id>")
@jwt_required()
def delete_account(account_id):
    user = get_current_user()
    account = finance_service.get_account(user.id, account_id)
    if not account:
        return error("NOT_FOUND", "Cuenta no encontrada", 404)
    finance_service.delete_account(account)
    return ok({"message": "Cuenta eliminada"})


# ── Import ─────────────────────────────────────────────────────────────────────

@bp.post("/import/excel")
@jwt_required()
def import_excel():
    user = get_current_user()
    if "file" not in request.files:
        return error("MISSING_FILE", "Se requiere un fichero en el campo 'file'")
    f = request.files["file"]
    if not f.filename:
        return error("MISSING_FILE", "Fichero vacío")

    try:
        result = import_service.import_ing_excel(f.read(), user.id)
    except Exception as exc:
        return error("IMPORT_ERROR", f"Error procesando el fichero: {exc}", 422)

    return ok(result)


# ── Transactions ───────────────────────────────────────────────────────────────

@bp.get("/transactions")
@jwt_required()
def list_transactions():
    user = get_current_user()
    filters = {
        "account_id": request.args.get("account_id"),
        "type_id":    request.args.get("type_id"),
        "category_id":request.args.get("category_id"),
        "date_from":  request.args.get("date_from"),
        "date_to":    request.args.get("date_to"),
        "page":       request.args.get("page", 1),
        "per_page":   request.args.get("per_page", 50),
    }
    result = finance_service.list_transactions(user.id, filters)
    return ok(result["items"], meta={
        "total": result["total"],
        "page": result["page"],
        "per_page": result["per_page"],
        "pages": result["pages"],
    })


@bp.get("/transactions/all")
@jwt_required()
def list_all_transactions():
    user = get_current_user()
    filters = {
        "q":           request.args.get("q", "").strip(),
        "status":      request.args.get("status", "all"),
        "account_id":  request.args.get("account_id"),
        "type_id":     request.args.get("type_id"),
        "category_id": request.args.get("category_id"),
        "date_from":   request.args.get("date_from"),
        "date_to":     request.args.get("date_to"),
        "page":        request.args.get("page", 1),
        "per_page":    request.args.get("per_page", 50),
    }
    result = finance_service.list_all_transactions(user.id, filters)
    return ok(result["items"], meta={
        "total": result["total"],
        "page": result["page"],
        "per_page": result["per_page"],
        "pages": result["pages"],
    })


@bp.get("/transactions/pending")
@jwt_required()
def list_pending():
    user = get_current_user()
    pending = finance_service.list_pending(user.id)
    count = finance_service.count_pending(user.id)
    return ok(
        [finance_service.tx_to_dict(t) for t in pending],
        meta={"total": count},
    )


@bp.put("/transactions/<tx_id>/categorize")
@jwt_required()
def categorize(tx_id):
    user = get_current_user()
    tx = finance_service.get_transaction(user.id, tx_id)
    if not tx:
        return error("NOT_FOUND", "Transacción no encontrada", 404)

    body = request.get_json(silent=True) or {}
    for field in ("type_id", "class_id", "category_id"):
        if not body.get(field):
            return error("MISSING_FIELDS", f"{field} es obligatorio")

    tx = finance_service.categorize_transaction(tx, body)
    return ok(finance_service.tx_to_dict(tx))


@bp.post("/transactions/<tx_id>/split")
@jwt_required()
def split(tx_id):
    user = get_current_user()
    tx = finance_service.get_transaction(user.id, tx_id)
    if not tx:
        return error("NOT_FOUND", "Transacción no encontrada", 404)
    if tx.is_split:
        return error("ALREADY_SPLIT", "Esta transacción ya está spliteada")

    body = request.get_json(silent=True) or {}
    splits = body.get("splits", [])
    if len(splits) < 2:
        return error("INVALID_SPLIT", "Se necesitan al menos 2 splits")

    try:
        children = finance_service.split_transaction(tx, splits)
    except ValueError as exc:
        return error(str(exc), "Los importes de los splits no cuadran con el total")

    return created({
        "parent": finance_service.tx_to_dict(tx),
        "splits": [finance_service.tx_to_dict(c) for c in children],
    })


@bp.put("/transactions/<tx_id>")
@jwt_required()
def update_transaction(tx_id):
    user = get_current_user()
    tx = finance_service.get_transaction(user.id, tx_id)
    if not tx:
        return error("NOT_FOUND", "Transacción no encontrada", 404)
    if tx.is_split:
        return error("IS_SPLIT_PARENT", "Edita directamente cada split, no el padre")
    body = request.get_json(silent=True) or {}
    tx = finance_service.update_transaction(tx, body)
    return ok(finance_service.tx_to_dict(tx))


@bp.post("/transactions/<tx_id>/unsplit")
@jwt_required()
def unsplit(tx_id):
    user = get_current_user()
    tx = finance_service.get_transaction(user.id, tx_id)
    if not tx:
        return error("NOT_FOUND", "Transacción no encontrada", 404)
    try:
        tx = finance_service.unsplit_transaction(tx)
    except ValueError:
        return error("NOT_SPLIT", "Esta transacción no está spliteada")
    return ok(finance_service.tx_to_dict(tx))


@bp.delete("/transactions/<tx_id>")
@jwt_required()
def delete_transaction(tx_id):
    user = get_current_user()
    tx = finance_service.get_transaction(user.id, tx_id)
    if not tx:
        return error("NOT_FOUND", "Transacción no encontrada", 404)
    finance_service.delete_transaction(tx)
    return ok({"message": "Transacción eliminada"})
