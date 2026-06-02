from __future__ import annotations

import uuid
from datetime import datetime, timezone, date as date_type
from decimal import Decimal

from sqlalchemy import (
    String, Boolean, DateTime, Date, Numeric, Text,
    ForeignKey, Integer,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db


class Vehicle(db.Model):
    __tablename__ = "vehicles"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    nickname: Mapped[str] = mapped_column(String(128), nullable=False)
    make: Mapped[str | None] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(64))
    year: Mapped[int | None] = mapped_column(Integer)
    plate: Mapped[str | None] = mapped_column(String(16))
    vin: Mapped[str | None] = mapped_column(String(17))
    fuel_type: Mapped[str | None] = mapped_column(String(16))  # gasoline/diesel/electric/hybrid
    current_km: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active/stored/sold/restoration
    notes: Mapped[str | None] = mapped_column(Text)
    photo_url: Mapped[str | None] = mapped_column(String(512))

    fuel_logs: Mapped[list["FuelLog"]] = relationship("FuelLog", back_populates="vehicle")
    service_records: Mapped[list["ServiceRecord"]] = relationship(
        "ServiceRecord", back_populates="vehicle"
    )
    maintenance_alerts: Mapped[list["MaintenanceAlert"]] = relationship(
        "MaintenanceAlert", back_populates="vehicle"
    )
    restoration_projects: Mapped[list["RestorationProject"]] = relationship(
        "RestorationProject", back_populates="vehicle"
    )


class FuelLog(db.Model):
    __tablename__ = "fuel_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    vehicle_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vehicles.id"), nullable=False
    )
    log_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    liters: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    price_per_liter: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    odometer_km: Mapped[int | None] = mapped_column(Integer)
    consumption_l100: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    station: Mapped[str | None] = mapped_column(String(255))
    full_tank: Mapped[bool] = mapped_column(Boolean, default=True)

    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="fuel_logs")


class MaintenanceType(db.Model):
    __tablename__ = "maintenance_types"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    category: Mapped[str | None] = mapped_column(
        String(32)
    )  # engine/brakes/electrical/bodywork/fluids/tires/inspection
    interval_km: Mapped[int | None] = mapped_column(Integer)
    interval_months: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(Text)
    prescriptive: Mapped[bool] = mapped_column(Boolean, default=True)


class ServiceRecord(db.Model):
    __tablename__ = "service_records"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    vehicle_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vehicles.id"), nullable=False
    )
    maintenance_type_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("maintenance_types.id"), nullable=False
    )
    transaction_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("transactions.id")
    )
    service_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    odometer_km: Mapped[int | None] = mapped_column(Integer)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    workshop: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    next_due_date: Mapped[date_type | None] = mapped_column(Date)
    next_due_km: Mapped[int | None] = mapped_column(Integer)

    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="service_records")
    maintenance_type: Mapped["MaintenanceType"] = relationship("MaintenanceType")


class MaintenanceAlert(db.Model):
    __tablename__ = "maintenance_alerts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    vehicle_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vehicles.id"), nullable=False
    )
    maintenance_type_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("maintenance_types.id"), nullable=False
    )
    alert_type: Mapped[str] = mapped_column(String(8))  # km/date/both
    due_date: Mapped[date_type | None] = mapped_column(Date)
    due_km: Mapped[int | None] = mapped_column(Integer)
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    notified: Mapped[bool] = mapped_column(Boolean, default=False)

    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="maintenance_alerts")
    maintenance_type: Mapped["MaintenanceType"] = relationship("MaintenanceType")


class RestorationProject(db.Model):
    __tablename__ = "restoration_projects"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    vehicle_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vehicles.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="planning")  # planning/active/paused/completed
    budget_target: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    budget_spent: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    start_date: Mapped[date_type | None] = mapped_column(Date)
    end_date: Mapped[date_type | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)

    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="restoration_projects")
    tasks: Mapped[list["RestorationTask"]] = relationship(
        "RestorationTask", back_populates="project"
    )
    parts: Mapped[list["Part"]] = relationship("Part", back_populates="project")


class RestorationTask(db.Model):
    __tablename__ = "restoration_tasks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("restoration_projects.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="todo")  # todo/in_progress/done/blocked
    priority: Mapped[str] = mapped_column(String(8), default="medium")  # low/medium/high/critical
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    due_date: Mapped[date_type | None] = mapped_column(Date)
    cost_estimate: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    project: Mapped["RestorationProject"] = relationship(
        "RestorationProject", back_populates="tasks"
    )
    parts: Mapped[list["Part"]] = relationship("Part", back_populates="task")


class Part(db.Model):
    __tablename__ = "parts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("restoration_projects.id"), nullable=False
    )
    task_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("restoration_tasks.id"))
    transaction_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("transactions.id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    part_number: Mapped[str | None] = mapped_column(String(64))
    supplier: Mapped[str | None] = mapped_column(String(255))
    price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(16), default="needed")  # needed/ordered/received/installed
    notes: Mapped[str | None] = mapped_column(Text)

    project: Mapped["RestorationProject"] = relationship(
        "RestorationProject", back_populates="parts"
    )
    task: Mapped["RestorationTask | None"] = relationship(
        "RestorationTask", back_populates="parts"
    )
