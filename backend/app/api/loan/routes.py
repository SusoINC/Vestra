from __future__ import annotations

from flask import request
from flask_jwt_extended import get_current_user, jwt_required

from ...services import loan_service as svc
from ...utils.responses import created, error, ok
from . import bp


@bp.get("")
@jwt_required()
def list_loans():
    user = get_current_user()
    return ok(svc.list_loans(user.id))


@bp.get("/euribor/history")
@jwt_required()
def euribor_history():
    return ok(svc.euribor_history())


@bp.post("")
@jwt_required()
def create_loan():
    user = get_current_user()
    body = request.get_json(silent=True) or {}
    for f in ("name", "principal", "start_date", "term_months"):
        if not body.get(f):
            return error("MISSING_FIELDS", f"{f} es obligatorio")
    loan = svc.create_loan(user.id, body)
    return created(svc.loan_dict(loan))


@bp.get("/<loan_id>")
@jwt_required()
def get_loan(loan_id):
    user = get_current_user()
    scenario = request.args.get("scenario", type=float) or 0.0
    d = svc.detail(user.id, loan_id, scenario)
    if not d:
        return error("NOT_FOUND", "Préstamo no encontrado", 404)
    return ok(d)


@bp.put("/<loan_id>")
@jwt_required()
def update_loan(loan_id):
    user = get_current_user()
    loan = svc.get_loan(user.id, loan_id)
    if not loan:
        return error("NOT_FOUND", "Préstamo no encontrado", 404)
    svc.update_loan(loan, request.get_json(silent=True) or {})
    return ok(svc.loan_dict(loan))


@bp.delete("/<loan_id>")
@jwt_required()
def delete_loan(loan_id):
    user = get_current_user()
    loan = svc.get_loan(user.id, loan_id)
    if not loan:
        return error("NOT_FOUND", "Préstamo no encontrado", 404)
    svc.delete_loan(loan)
    return ok({"message": "Préstamo eliminado"})


@bp.get("/<loan_id>/simulate")
@jwt_required()
def simulate(loan_id):
    user = get_current_user()
    amount = request.args.get("amount", type=float)
    if not amount:
        return error("MISSING_FIELDS", "amount es obligatorio")
    mode = request.args.get("mode", "plazo")            # plazo | cuota
    annual_return = request.args.get("return", type=float) or 0.0
    res = svc.simulate_early(user.id, loan_id, amount, mode, annual_return)
    if res is None:
        return error("NOT_FOUND", "Préstamo no encontrado", 404)
    return ok(res)
