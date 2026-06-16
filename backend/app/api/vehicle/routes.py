from __future__ import annotations

from flask import request
from flask_jwt_extended import get_current_user, jwt_required

from ...services import vehicle_service as svc
from ...utils.responses import created, error, ok
from . import bp


# ── Vehículos ────────────────────────────────────────────────────────────────

@bp.get("")
@jwt_required()
def list_vehicles():
    user = get_current_user()
    return ok(svc.list_vehicles(user.id))


@bp.post("")
@jwt_required()
def create_vehicle():
    user = get_current_user()
    body = request.get_json(silent=True) or {}
    if not body.get("nickname"):
        return error("MISSING_FIELDS", "El nombre del vehículo es obligatorio")
    v = svc.create_vehicle(user.id, body)
    return created(svc._vehicle_summary(v))


@bp.get("/<vehicle_id>")
@jwt_required()
def get_vehicle(vehicle_id):
    user = get_current_user()
    stats = svc.vehicle_stats(user.id, vehicle_id)
    if not stats:
        return error("NOT_FOUND", "Vehículo no encontrado", 404)
    return ok(stats)


@bp.put("/<vehicle_id>")
@jwt_required()
def update_vehicle(vehicle_id):
    user = get_current_user()
    v = svc.get_vehicle(user.id, vehicle_id)
    if not v:
        return error("NOT_FOUND", "Vehículo no encontrado", 404)
    v = svc.update_vehicle(v, request.get_json(silent=True) or {})
    return ok(svc._vehicle_summary(v))


@bp.delete("/<vehicle_id>")
@jwt_required()
def delete_vehicle(vehicle_id):
    user = get_current_user()
    v = svc.get_vehicle(user.id, vehicle_id)
    if not v:
        return error("NOT_FOUND", "Vehículo no encontrado", 404)
    svc.delete_vehicle(v)
    return ok({"message": "Vehículo eliminado"})


# ── Repostajes ───────────────────────────────────────────────────────────────

@bp.get("/<vehicle_id>/fuel")
@jwt_required()
def list_fuel(vehicle_id):
    user = get_current_user()
    if not svc.get_vehicle(user.id, vehicle_id):
        return error("NOT_FOUND", "Vehículo no encontrado", 404)
    return ok(svc.list_fuel_logs(user.id, vehicle_id))


@bp.post("/<vehicle_id>/fuel")
@jwt_required()
def create_fuel(vehicle_id):
    user = get_current_user()
    body = request.get_json(silent=True) or {}
    if not body.get("log_date"):
        return error("MISSING_FIELDS", "La fecha es obligatoria")
    log = svc.create_fuel_log(user.id, vehicle_id, body)
    if not log:
        return error("NOT_FOUND", "Vehículo no encontrado", 404)
    return created({"id": log.id})


@bp.put("/fuel/<log_id>")
@jwt_required()
def update_fuel(log_id):
    user = get_current_user()
    log = svc.get_fuel_log(user.id, log_id)
    if not log:
        return error("NOT_FOUND", "Repostaje no encontrado", 404)
    svc.update_fuel_log(log, request.get_json(silent=True) or {})
    return ok({"id": log.id})


@bp.delete("/fuel/<log_id>")
@jwt_required()
def delete_fuel(log_id):
    user = get_current_user()
    log = svc.get_fuel_log(user.id, log_id)
    if not log:
        return error("NOT_FOUND", "Repostaje no encontrado", 404)
    svc.delete_fuel_log(log)
    return ok({"message": "Repostaje eliminado"})
