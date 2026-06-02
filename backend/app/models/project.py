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


class Attachment(db.Model):
    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    entity_type: Mapped[str] = mapped_column(
        String(32)
    )  # service_record/restoration_task/part/diy_task
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(128))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class DiyProject(db.Model):
    __tablename__ = "diy_projects"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(
        String(16)
    )  # home/garden/workshop/electronics/other
    status: Mapped[str] = mapped_column(String(16), default="planning")  # planning/active/paused/completed
    budget_target: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    budget_spent: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    start_date: Mapped[date_type | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)

    tasks: Mapped[list["DiyTask"]] = relationship("DiyTask", back_populates="project")


class DiyTask(db.Model):
    __tablename__ = "diy_tasks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("diy_projects.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="todo")  # todo/in_progress/done
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    due_date: Mapped[date_type | None] = mapped_column(Date)

    project: Mapped["DiyProject"] = relationship("DiyProject", back_populates="tasks")
