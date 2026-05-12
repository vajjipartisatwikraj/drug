from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, Enum):
    ADMIN = "admin"
    AUDITOR = "auditor"


class UserInDB(BaseModel):
    username: str
    role: UserRole
    employee_details: dict[str, Any] = Field(default_factory=dict)
    audited_document_ids: list[str] = Field(default_factory=list)
    password_hash: str
    created_at: datetime = Field(default_factory=utc_now)


class AdminModel(UserInDB):
    role: UserRole = UserRole.ADMIN


class AuditorModel(UserInDB):
    role: UserRole = UserRole.AUDITOR


class PageModel(BaseModel):
    document_id: str
    page_number: int
    status: str = "unknown"
    numeric_calc: list[str] = Field(default_factory=list)
    signatures: list[str] = Field(default_factory=list)
    dates: list[str] = Field(default_factory=list)
    information: list[str] = Field(default_factory=list)
    summary_text: str = ""
    auditor_id: str
    created_at: datetime = Field(default_factory=utc_now)


class ReportModel(BaseModel):
    document_id: str
    total_passed: int = 0
    total_failed: int = 0
    summary_text: str = ""
    pipeline_validation: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)


class DocumentModel(BaseModel):
    filename: str
    file_path: str
    size_mb: float
    status: str = "uploaded"
    auditor_id: str
    page_ids: list[str] = Field(default_factory=list)
    report_id: str | None = None
    result: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    upload_ts: float
