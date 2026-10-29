from __future__ import annotations

import json
import os
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, Header, HTTPException
from sqlalchemy import DateTime, ForeignKey, String, Text, create_engine, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class AccountRow(Base):
    __tablename__ = "accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class AnalysisRow(Base):
    __tablename__ = "analyses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True)


database_url = os.getenv("DATABASE_URL", "").strip()
engine = create_engine(database_url, pool_pre_ping=True) if database_url else None
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False) if engine else None
if engine:
    Base.metadata.create_all(engine)

password_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
memory_accounts: dict[str, dict[str, str]] = {}
memory_analyses: dict[str, dict[str, Any]] = {}
SECRET = os.getenv("JWT_SECRET", "")
jwt_ready = len(SECRET) >= 32 and not SECRET.lower().startswith("replace")


def mode() -> str:
    return "postgres" if engine else "demo"


def _account_view(account: dict[str, str]) -> dict[str, str]:
    return {"id": account["id"], "name": account["name"], "email": account["email"], "role": "user"}


def register_account(name: str, email: str, password: str) -> dict[str, str]:
    email = email.lower().strip()
    account = {"id": str(uuid4()), "name": name.strip(), "email": email, "password_hash": password_hasher.hash(password)}
    if SessionLocal:
        with SessionLocal() as db:
            row = AccountRow(**account)
            db.add(row)
            try:
                db.commit()
            except IntegrityError as exc:
                db.rollback()
                raise HTTPException(status_code=409, detail="An account with this email already exists.") from exc
    elif any(saved["email"] == email for saved in memory_accounts.values()):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    else:
        memory_accounts[account["id"]] = account
    return _account_view(account)


def authenticate_account(email: str, password: str) -> dict[str, str]:
    if SessionLocal:
        with SessionLocal() as db:
            row = db.scalar(select(AccountRow).where(AccountRow.email == email.lower().strip()))
            account = {"id": row.id, "name": row.name, "email": row.email, "password_hash": row.password_hash} if row else None
    else:
        account = next((saved for saved in memory_accounts.values() if saved["email"] == email.lower().strip()), None)
    if not account:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    try:
        password_hasher.verify(account["password_hash"], password)
    except VerifyMismatchError as exc:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.") from exc
    return _account_view(account)


def issue_token(account: dict[str, str]) -> str:
    if not jwt_ready:
        raise HTTPException(status_code=503, detail="Authentication is not configured. Set a unique JWT_SECRET of at least 32 characters.")
    return jwt.encode(
        {"sub": account["id"], "email": account["email"], "role": account["role"], "exp": datetime.now(UTC) + timedelta(hours=8)},
        SECRET,
        algorithm="HS256",
    )


async def optional_account(authorization: str | None = Header(default=None)) -> dict[str, str] | None:
    if not authorization:
        return None
    if not authorization.startswith("Bearer ") or not jwt_ready:
        raise HTTPException(status_code=401, detail="Your session is invalid. Sign in again.")
    try:
        claims = jwt.decode(authorization[7:], SECRET, algorithms=["HS256"])
        account_id = str(claims["sub"])
    except (jwt.PyJWTError, KeyError) as exc:
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.") from exc
    if SessionLocal:
        with SessionLocal() as db:
            row = db.get(AccountRow, account_id)
            if not row:
                raise HTTPException(status_code=401, detail="Your account is no longer available.")
            return _account_view({"id": row.id, "name": row.name, "email": row.email})
    account = memory_accounts.get(account_id)
    if not account:
        raise HTTPException(status_code=401, detail="Your account is no longer available.")
    return _account_view(account)


async def owner_key(
    x_guest_id: str | None = Header(default=None, alias="X-Guest-ID"),
    account: dict[str, str] | None = Depends(optional_account),
) -> str:
    if account:
        return f"user:{account['id']}"
    if not x_guest_id or len(x_guest_id) > 80 or not all(char.isalnum() or char in "-_" for char in x_guest_id):
        raise HTTPException(status_code=400, detail="Start a valid guest session or sign in before managing analysis history.")
    return f"guest:{x_guest_id}"


def save_analysis(owner: str, payload: dict[str, Any], result: dict[str, Any]) -> None:
    analysis_id = result["analysis_id"]
    row = {
        "id": analysis_id,
        "owner_id": owner,
        "payload": json.dumps(payload, ensure_ascii=False),
        "result": json.dumps(result, ensure_ascii=False),
        "created_at": datetime.now(UTC),
    }
    if SessionLocal:
        with SessionLocal() as db:
            db.add(AnalysisRow(**row))
            db.commit()
    else:
        memory_analyses[analysis_id] = row


def get_analysis(owner: str, analysis_id: str) -> dict[str, Any]:
    if SessionLocal:
        with SessionLocal() as db:
            row = db.scalar(select(AnalysisRow).where(AnalysisRow.id == analysis_id, AnalysisRow.owner_id == owner))
            if row:
                return {"payload": json.loads(row.payload), "result": json.loads(row.result), "created_at": row.created_at.isoformat()}
    else:
        row = memory_analyses.get(analysis_id)
        if row and row["owner_id"] == owner:
            return {"payload": json.loads(row["payload"]), "result": json.loads(row["result"]), "created_at": row["created_at"].isoformat()}
    raise HTTPException(status_code=404, detail="This analysis was not found in your account.")


def list_analyses(owner: str) -> list[dict[str, Any]]:
    if SessionLocal:
        with SessionLocal() as db:
            rows = db.scalars(select(AnalysisRow).where(AnalysisRow.owner_id == owner).order_by(AnalysisRow.created_at.desc()).limit(100))
            saved = [{"payload": json.loads(row.payload), "result": json.loads(row.result), "created_at": row.created_at.isoformat()} for row in rows]
    else:
        saved = [
            {"payload": json.loads(row["payload"]), "result": json.loads(row["result"]), "created_at": row["created_at"].isoformat()}
            for row in sorted(memory_analyses.values(), key=lambda item: item["created_at"], reverse=True)
            if row["owner_id"] == owner
        ][:100]
    return saved


def delete_analysis(owner: str, analysis_id: str) -> None:
    if SessionLocal:
        with SessionLocal() as db:
            result = db.execute(delete(AnalysisRow).where(AnalysisRow.id == analysis_id, AnalysisRow.owner_id == owner))
            db.commit()
            if result.rowcount:
                return
    else:
        row = memory_analyses.get(analysis_id)
        if row and row["owner_id"] == owner:
            del memory_analyses[analysis_id]
            return
    raise HTTPException(status_code=404, detail="This analysis was not found in your account.")
