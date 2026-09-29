from __future__ import annotations

import io
import base64
import csv
import threading
import time
import logging
from contextlib import asynccontextmanager
from urllib.parse import urlparse
import hashlib
import hmac
import secrets
import json
import os
import re
import shutil
import sqlite3
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import fitz
import pytesseract
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from pydantic import BaseModel
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils as asym_utils
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
import httpx

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("AUTOSALONE_DATA_DIR", str(BASE_DIR / "data"))).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
BACKUP_DIR = DATA_DIR / "backups"
EXTERNAL_BACKUP_DIR = Path(os.environ["AUTOSALONE_EXTERNAL_BACKUP_DIR"]).expanduser().resolve() if os.environ.get("AUTOSALONE_EXTERNAL_BACKUP_DIR") else None
DB_PATH = DATA_DIR / "autosalone_one.db"
STATIC_DIR = BASE_DIR / "app" / "static"

for p in (DATA_DIR, UPLOAD_DIR, BACKUP_DIR):
    p.mkdir(parents=True, exist_ok=True)
if EXTERNAL_BACKUP_DIR:
    EXTERNAL_BACKUP_DIR.mkdir(parents=True, exist_ok=True)

APP_VERSION = "1.13.1-malu23"
logger = logging.getLogger("malu23")
SCHEDULER_STOP = threading.Event()
_SECRET_CACHE: str | None = None


def _secret() -> str:
    """Return a stable, strong session secret.

    Production can inject AUTOSALONE_SECRET. When omitted, MALÙ23 CARS
    generates a random secret once and persists it inside the data directory
    so sessions stay valid across restarts without shipping a weak default.
    """
    global _SECRET_CACHE
    if _SECRET_CACHE:
        return _SECRET_CACHE
    configured = os.environ.get("AUTOSALONE_SECRET", "").strip()
    if configured:
        _SECRET_CACHE = configured
        return _SECRET_CACHE
    secret_path = DATA_DIR / ".session_secret"
    try:
        if secret_path.exists():
            value = secret_path.read_text(encoding="utf-8").strip()
            if len(value) >= 32:
                _SECRET_CACHE = value
                return value
        value = secrets.token_urlsafe(48)
        secret_path.write_text(value, encoding="utf-8")
        try:
            os.chmod(secret_path, 0o600)
        except OSError:
            logger.warning("Impossibile restringere i permessi del secret di sessione")
        _SECRET_CACHE = value
        return value
    except OSError:
        # Last-resort in-memory secret. It is still random/strong, but sessions
        # will expire on restart; readiness reports this condition separately.
        _SECRET_CACHE = secrets.token_urlsafe(48)
        logger.exception("Impossibile persistere il secret di sessione")
        return _SECRET_CACHE


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    SCHEDULER_STOP.clear()
    worker = None
    if os.environ.get("AUTOSALONE_DISABLE_SCHEDULER", "0") != "1":
        worker = threading.Thread(target=_notification_worker, name="malu23-notifications", daemon=True)
        worker.start()
    try:
        yield
    finally:
        SCHEDULER_STOP.set()
        if worker and worker.is_alive():
            worker.join(timeout=2.0)


app = FastAPI(title="MALÙ23 CARS", version=APP_VERSION, lifespan=app_lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


LOGIN_ATTEMPTS: dict[str, list[float]] = {}


def _password_hash(password: str, salt_hex: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 240_000).hex()


def _database_has_users() -> bool:
    try:
        if not DB_PATH.exists():
            return False
        conn = sqlite3.connect(DB_PATH)
        try:
            row = conn.execute("SELECT COUNT(*) FROM users WHERE active=1").fetchone()
            return bool(row and row[0])
        finally:
            conn.close()
    except sqlite3.Error:
        return False


def auth_enabled() -> bool:
    # As soon as at least one app user exists, login becomes mandatory
    # automatically. This prevents a configured installation from remaining
    # accidentally open because an environment flag was forgotten.
    return (
        _database_has_users()
        or bool(os.environ.get("AUTOSALONE_USERNAME") and os.environ.get("AUTOSALONE_PASSWORD"))
        or os.environ.get("AUTOSALONE_REQUIRE_LOGIN", "0") == "1"
    )


def _make_session(username: str, role: str, session_version: str = "0") -> str:
    exp = int(time.time()) + 60 * 60 * 24 * 7
    payload = f"{username}|{role}|{session_version}|{exp}"
    sig = hmac.new(_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}|{sig}".encode()).decode().rstrip("=")


def _parse_session(token: str) -> dict[str, str] | None:
    if not token:
        return None
    try:
        raw = base64.urlsafe_b64decode(token + "=" * ((4-len(token)%4)%4)).decode()
        username, role, version_s, exp_s, sig = raw.split("|", 4)
        payload = f"{username}|{role}|{version_s}|{exp_s}"
        expected = hmac.new(_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not secrets.compare_digest(sig, expected) or int(exp_s) < int(time.time()):
            return None
        return {"username": username, "role": role, "session_version": version_s, "expires": exp_s}
    except Exception:
        return None


def _current_session_identity(parsed: dict[str, str]) -> dict[str, str] | None:
    """Revalidate active status, role and session version on every request."""
    try:
        with db() as conn:
            row = conn.execute(
                "SELECT username,display_name,role,active,session_version FROM users WHERE username=?",
                (parsed["username"],),
            ).fetchone()
            if row:
                if not row["active"] or str(row["session_version"]) != str(parsed.get("session_version", "")):
                    return None
                return {
                    "username": row["username"],
                    "display_name": row["display_name"] or row["username"],
                    "role": row["role"],
                }
    except sqlite3.Error:
        logger.exception("Errore database durante la validazione sessione")
        return None

    # Environment credentials are kept for bootstrap/cloud demo compatibility.
    env_user = os.environ.get("AUTOSALONE_USERNAME", "")
    if not _database_has_users() and env_user and secrets.compare_digest(parsed["username"], env_user) and parsed.get("session_version") == "env":
        return {"username": env_user, "display_name": env_user, "role": "OWNER"}
    return None


def _verify_login(username: str, password: str) -> dict[str, str] | None:
    try:
        with db() as conn:
            row = conn.execute("SELECT username,display_name,role,password_salt,password_hash,session_version FROM users WHERE username=? AND active=1", (username,)).fetchone()
            if row and secrets.compare_digest(_password_hash(password, row["password_salt"]), row["password_hash"]):
                conn.execute("UPDATE users SET last_login_at=? WHERE username=?", (now_iso(), username))
                return {"username": row["username"], "display_name": row["display_name"], "role": row["role"], "session_version": str(row["session_version"])}
    except sqlite3.Error:
        logger.exception("Errore database durante la verifica login")
    expected_u = os.environ.get("AUTOSALONE_USERNAME", "")
    expected_p = os.environ.get("AUTOSALONE_PASSWORD", "")
    if not _database_has_users() and expected_u and secrets.compare_digest(username, expected_u) and secrets.compare_digest(password, expected_p):
        return {"username": username, "display_name": username, "role": "OWNER", "session_version": "env"}
    return None


def _login_rate_limited(ip: str) -> bool:
    now = time.time()
    bucket = [x for x in LOGIN_ATTEMPTS.get(ip, []) if now-x < 600]
    LOGIN_ATTEMPTS[ip] = bucket
    return len(bucket) >= 8


def _record_login_failure(ip: str) -> None:
    LOGIN_ATTEMPTS.setdefault(ip, []).append(time.time())


def _request_user(request: Request) -> dict[str, str]:
    return getattr(request.state, "auth_user", {"username": "locale", "display_name": "Accesso locale", "role": "OWNER"})


@app.middleware("http")
async def security_auth_audit(request: Request, call_next):
    path = request.url.path
    public = path in {"/login", "/healthz", "/manifest.webmanifest", "/sw.js", "/install", "/launch"} or path.startswith("/static/")
    user = {"username": "locale", "display_name": "Accesso locale", "role": "OWNER"}
    if auth_enabled() and not public:
        parsed = _parse_session(request.cookies.get("autosalone_session", ""))
        identity = _current_session_identity(parsed) if parsed else None
        if not identity:
            if path.startswith("/api/"):
                return JSONResponse({"detail": "Accesso richiesto"}, status_code=401)
            return RedirectResponse("/login", status_code=303)
        user = identity
        # Sensitive production operations are owner-only.
        owner_only = (
            path.startswith("/api/users")
            or path.startswith("/api/audit")
            or path.startswith("/api/backups")
            or path.startswith("/api/readiness")
            or path == "/api/settings"
        )
        if owner_only and user["role"] != "OWNER":
            return JSONResponse({"detail": "Operazione riservata al titolare"}, status_code=403)
    request.state.auth_user = user
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    if path.startswith("/api/") or path in {"/login", "/logout"}:
        response.headers["Cache-Control"] = "no-store"
    if request.headers.get("x-forwarded-proto", "").lower() == "https" or request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and path.startswith("/api/") and response.status_code < 400:
        try:
            with db() as conn:
                conn.execute("INSERT INTO audit_log(username,role,method,path,status_code,ip_address,created_at) VALUES(?,?,?,?,?,?,?)",
                             (user.get("username",""), user.get("role",""), request.method, path, response.status_code, request.client.host if request.client else "", now_iso()))
        except sqlite3.Error:
            logger.exception("Impossibile scrivere audit log per %s %s", request.method, path)
    return response


@app.get("/login", response_class=HTMLResponse)
def login_page() -> str:
    if not auth_enabled():
        return '<meta http-equiv="refresh" content="0;url=/">'
    return """<!doctype html>
<html lang='it'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>
<meta name='theme-color' content='#0d0d0e'>
<title>Malù23 Cars — Accesso gestionale</title>
<style>
:root{--navy:#0d0d0e;--gold:#d51f25;--paper:#fff;--ivory:#f4f4f4;--ink:#171717;--muted:#717171;--line:#dedede}
*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:var(--ink);background:radial-gradient(circle at 74% 9%,rgba(213,31,37,.16),transparent 28%),linear-gradient(145deg,#0a0a0b 0 44%,#f4f4f4 44% 100%);display:grid;place-items:center;padding:24px}
.shell{width:min(930px,96vw);min-height:550px;background:rgba(255,253,249,.98);border:1px solid rgba(255,255,255,.6);border-radius:30px;box-shadow:0 35px 110px rgba(7,20,32,.28);overflow:hidden;display:grid;grid-template-columns:1.05fr .95fr}
.hero{background:linear-gradient(160deg,#151516,#080809);color:white;padding:46px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}.hero:after{content:"";position:absolute;width:320px;height:320px;border-radius:50%;right:-170px;top:-130px;background:rgba(213,31,37,.10)}
.mark{width:58px;height:58px;border-radius:18px;background:linear-gradient(145deg,#dfbd7d,#b9873f);display:flex;align-items:baseline;justify-content:center;gap:1px;color:#132435;font-weight:950;box-shadow:inset 0 1px rgba(255,255,255,.65),0 15px 32px rgba(0,0,0,.24);letter-spacing:-2px}.mark span{font-size:25px}.mark b{font-size:16px}
.hero h1{font-size:40px;line-height:1.02;letter-spacing:-1.8px;margin:28px 0 12px;max-width:390px}.hero p{max-width:380px;color:#bcc8d2;font-size:14px;line-height:1.65;margin:0}.promise{font-size:12px;color:#d9c39d;padding-top:26px;border-top:1px solid rgba(255,255,255,.09)}
.login{padding:52px 48px;display:flex;flex-direction:column;justify-content:center}.chip{align-self:flex-start;padding:6px 9px;border-radius:999px;background:#fde8e9;color:#a7181d;font-size:9px;font-weight:900;letter-spacing:.8px;margin-bottom:18px}.login h2{margin:0;font-size:29px;letter-spacing:-.9px}.login>p{color:var(--muted);font-size:13px;line-height:1.5;margin:8px 0 24px}.field{display:grid;gap:7px;margin:11px 0}.field label{font-size:10px;font-weight:900;letter-spacing:.55px;color:#647384}.field input{width:100%;padding:14px 15px;border:1px solid var(--line);background:#fffefa;border-radius:13px;font-size:16px;color:var(--ink);outline:none}.field input:focus{border-color:#d65a60;box-shadow:0 0 0 3px rgba(210,31,38,.10)}button{width:100%;padding:14px;border:0;border-radius:13px;background:linear-gradient(145deg,#e12b32,#b7161b);color:#fff;font-size:14px;font-weight:900;margin-top:13px;box-shadow:0 11px 28px rgba(210,31,38,.22);cursor:pointer}.safe{display:flex;align-items:center;gap:7px;color:#7a8795;font-size:10px;margin-top:15px}.safe i{width:7px;height:7px;border-radius:50%;background:#42a779}
@media(max-width:720px){body{padding:0;background:linear-gradient(180deg,#0d0d0e 0 25%,#f4f4f4 25%)}.shell{width:100%;min-height:100vh;border-radius:0;display:block;box-shadow:none}.hero{min-height:225px;padding:calc(26px + env(safe-area-inset-top)) 24px 25px}.mark{width:48px;height:48px;border-radius:15px}.mark span{font-size:21px}.mark b{font-size:14px}.hero h1{font-size:29px;margin:22px 0 8px}.hero p{font-size:12px;max-width:330px}.promise{display:none}.login{padding:30px 22px calc(30px + env(safe-area-inset-bottom))}.login h2{font-size:25px}.chip{margin-bottom:13px}}
</style>
</head>
<body>
<div class='shell'>
<section class='hero'>
  <div><img src='/static/brand/malu23_logo.png' alt='Malù23 Cars' style='width:210px;max-width:76%;height:auto;filter:drop-shadow(0 8px 22px rgba(0,0,0,.30))'><h1>La concessionaria, sempre sotto controllo.</h1><p>Garage, clienti, lavori, documenti, AutoScout e consegne. Un solo gestionale operativo per Malù23 Cars.</p></div>
  <div class='promise'>MALÙ23 CARS · powered by AUTOSALONE ONE</div>
</section>
<form class='login' method='post'>
  <span class='chip'>ACCESSO RISERVATO</span>
  <h2>Bentornato in Malù23 Cars.</h2>
  <p>Accedi al gestionale riservato della concessionaria. Garage, clienti, documenti e scadenze restano in un unico posto.</p>
  <div class='field'><label>UTENTE</label><input name='username' autocomplete='username' placeholder='Nome utente' required autofocus></div>
  <div class='field'><label>PASSWORD</label><input type='password' name='password' autocomplete='current-password' placeholder='Password' required></div>
  <button>ENTRA NEL GESTIONALE</button>
  <div class='safe'><i></i><span>Accesso riservato · sessione protetta</span></div>
</form>
</div>
</body></html>"""


@app.post("/login")
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    ip = request.client.host if request.client else "unknown"
    if _login_rate_limited(ip):
        return HTMLResponse("Troppi tentativi. Riprova tra qualche minuto.", status_code=429)
    identity = _verify_login(username.strip(), password)
    if not identity:
        _record_login_failure(ip)
        return HTMLResponse("Credenziali non valide. <a href='/login'>Riprova</a>", status_code=401)
    LOGIN_ATTEMPTS.pop(ip, None)
    response = RedirectResponse("/", status_code=303)
    secure = os.environ.get("AUTOSALONE_COOKIE_SECURE", "0") == "1" or request.headers.get("x-forwarded-proto", "").lower() == "https" or request.url.scheme == "https"
    response.set_cookie("autosalone_session", _make_session(identity["username"], identity["role"], identity.get("session_version", "0")), httponly=True, secure=secure, samesite="lax", max_age=60*60*24*7)
    return response


@app.get("/logout")
def logout():
    response = RedirectResponse("/login", status_code=303)
    response.delete_cookie("autosalone_session")
    return response


@app.get("/healthz")
def healthz():
    ok, msg = database_integrity()
    return JSONResponse({"ok": ok, "version": APP_VERSION, "database": msg}, status_code=200 if ok else 503)

VEHICLE_STATES = [
    "IN_ARRIVO", "DA_CONTROLLARE", "IN_PREPARAZIONE", "DA_FOTOGRAFARE",
    "DA_PUBBLICARE", "IN_VENDITA", "PRENOTATA", "VENDUTA",
    "DA_CONSEGNARE", "CONSEGNATA"
]
PHOTO_REQUIRED = [
    "anteriore", "posteriore", "laterale_destro", "laterale_sinistro",
    "anteriore_3_4", "posteriore_3_4", "plancia", "sedili_anteriori",
    "sedili_posteriori", "bagagliaio", "quadro_km", "motore", "chiavi"
]

DELIVERY_CHECKLISTS = {
    7: [
        ("lavori_meccanici", "Lavori meccanici completati"),
        ("carrozzeria", "Carrozzeria completata"),
        ("documentazione", "Documentazione presente"),
        ("pagamento_caparra", "Pagamento / caparra verificati"),
        ("pratica_in_corso", "Passaggio / pratica in corso"),
        ("seconda_chiave", "Seconda chiave presente"),
    ],
    5: [
        ("lavaggio_interno", "Lavaggio interno"),
        ("lavaggio_esterno", "Lavaggio esterno"),
        ("carburante_carica", "Carburante / carica"),
        ("pressione_gomme", "Pressione gomme"),
        ("controllo_livelli", "Controllo livelli"),
        ("adesivi_cartellini", "Rimossi adesivi / cartellini"),
        ("documenti_veicolo", "Documenti nel veicolo"),
    ],
    3: [
        ("contratto", "Contratto pronto"),
        ("fattura", "Fattura pronta"),
        ("garanzia", "Garanzia pronta"),
        ("documenti_cliente", "Documenti cliente presenti"),
        ("saldo", "Saldo verificato"),
        ("pratica_passaggio", "Pratica / passaggio verificati"),
        ("chiavi", "Chiavi presenti"),
    ],
    1: [
        ("auto_presente", "Auto presente"),
        ("auto_pulita", "Auto pulita"),
        ("nessuna_spia", "Nessuna spia accesa"),
        ("km_registrati", "Chilometri registrati"),
        ("carburante", "Carburante / carica verificati"),
        ("documenti", "Documenti presenti"),
        ("due_chiavi", "Due chiavi presenti"),
        ("accessori", "Accessori previsti presenti"),
        ("appuntamento", "Appuntamento confermato"),
    ],
    0: [
        ("auto_pronta", "Auto pronta"),
        ("documenti_finali", "Documenti finali presenti"),
        ("saldo_finale", "Saldo acquisito"),
        ("chiavi_finali", "Chiavi consegnabili"),
        ("lavaggio_finale", "Lavaggio verificato"),
        ("pratica_finale", "Pratica verificata"),
    ],
}


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def validate_iso_date(value: str, field_name: str, allow_empty: bool = True) -> str:
    value = (value or "").strip()
    if not value and allow_empty:
        return ""
    try:
        date.fromisoformat(value)
    except ValueError as e:
        raise HTTPException(422, f"{field_name}: data non valida") from e
    return value


def validate_nonnegative(value: float | int, field_name: str) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError) as e:
        raise HTTPException(422, f"{field_name}: valore non valido") from e
    if n < 0:
        raise HTTPException(422, f"{field_name}: non può essere negativo")
    return n


def validate_vehicle_identity(plate: str, vin: str) -> tuple[str, str]:
    plate_n = normalize_plate(plate)
    vin_n = re.sub(r"[^A-HJ-NPR-Z0-9]", "", (vin or "").upper())
    if plate_n and not re.fullmatch(r"[A-Z0-9]{5,8}", plate_n):
        raise HTTPException(422, "Targa non valida")
    if vin_n and len(vin_n) != 17:
        raise HTTPException(422, "Il telaio/VIN deve contenere 17 caratteri")
    return plate_n, vin_n


def database_integrity(path: Path = DB_PATH) -> tuple[bool, str]:
    if not path.exists():
        return False, "Database non trovato"
    try:
        conn = sqlite3.connect(path)
        try:
            result = conn.execute("PRAGMA integrity_check").fetchone()[0]
            required = {"vehicles", "tasks", "clients", "client_interactions", "documents", "photos", "deliveries", "delivery_items", "listings", "contracts", "notifications", "push_subscriptions"}
            present = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        finally:
            conn.close()
        missing = sorted(required - present)
        if result != "ok":
            return False, f"integrity_check: {result}"
        if missing:
            return False, "Tabelle mancanti: " + ", ".join(missing)
        return True, "ok"
    except sqlite3.Error as e:
        return False, str(e)


def init_db() -> None:
    schema = """
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      acquisition_type TEXT NOT NULL DEFAULT 'acquisto',
      brand TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '',
      plate TEXT NOT NULL DEFAULT '', vin TEXT NOT NULL DEFAULT '', registration_date TEXT NOT NULL DEFAULT '',
      fuel TEXT NOT NULL DEFAULT '', engine_cc INTEGER NOT NULL DEFAULT 0, transmission TEXT NOT NULL DEFAULT '', mileage INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '', purchase_price REAL NOT NULL DEFAULT 0,
      expected_sale_price REAL NOT NULL DEFAULT 0, sale_price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'IN_ARRIVO', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_plate ON vehicles(plate) WHERE plate <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_vin ON vehicles(vin) WHERE vin <> '';

    CREATE TABLE IF NOT EXISTS status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL,
      old_status TEXT, new_status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS works (
      id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL,
      category TEXT NOT NULL, title TEXT NOT NULL, due_date TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '', expected_cost REAL NOT NULL DEFAULT 0, actual_cost REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0, completed_at TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL,
      category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', supplier TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0, expense_date TEXT NOT NULL,
      source_document_id INTEGER, source TEXT NOT NULL DEFAULT 'manuale', created_at TEXT NOT NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY(source_document_id) REFERENCES documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER,
      client_id INTEGER, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '', due_time TEXT NOT NULL DEFAULT '', reminder_minutes INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'DA_FARE', source TEXT NOT NULL DEFAULT 'manuale', completed INTEGER NOT NULL DEFAULT 0, completed_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', fiscal_code TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '', interested_vehicle_id INTEGER, tradein_notes TEXT NOT NULL DEFAULT '',
      offer REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'INTERESSATO',
      last_contact TEXT NOT NULL DEFAULT '', next_step TEXT NOT NULL DEFAULT '', next_contact_date TEXT NOT NULL DEFAULT '',
      next_contact_time TEXT NOT NULL DEFAULT '', reminder_minutes INTEGER NOT NULL DEFAULT 30,
      notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      FOREIGN KEY(interested_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS client_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL,
      action TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', happened_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS document_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT, original_name TEXT NOT NULL, stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '', page_count INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'ANALYZED', created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER, client_id INTEGER, batch_id INTEGER,
      doc_type TEXT NOT NULL DEFAULT 'altro', detected_doc_type TEXT NOT NULL DEFAULT 'altro',
      original_name TEXT NOT NULL, stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '', ocr_text TEXT NOT NULL DEFAULT '', detected_fields TEXT NOT NULL DEFAULT '{}',
      confidence REAL NOT NULL DEFAULT 0, auto_linked INTEGER NOT NULL DEFAULT 0,
      analysis_state TEXT NOT NULL DEFAULT 'READY',
      page_from INTEGER NOT NULL DEFAULT 1, page_to INTEGER NOT NULL DEFAULT 1, review_reason TEXT NOT NULL DEFAULT '',
      confirmed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY(batch_id) REFERENCES document_batches(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS document_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER NOT NULL, action_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'PENDING',
      result_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL,
      category TEXT NOT NULL, original_name TEXT NOT NULL, stored_name TEXT NOT NULL,
      is_cover INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL UNIQUE,
      delivery_date TEXT NOT NULL, delivery_time TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS delivery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, delivery_id INTEGER NOT NULL, vehicle_id INTEGER NOT NULL,
      phase_days_before INTEGER NOT NULL, code TEXT NOT NULL, label TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, completed_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      UNIQUE(delivery_id, code),
      FOREIGN KEY(delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'AutoScout24', url TEXT NOT NULL DEFAULT '', published_date TEXT NOT NULL DEFAULT '',
      initial_price REAL NOT NULL DEFAULT 0, current_price REAL NOT NULL DEFAULT 0,
      market_low REAL NOT NULL DEFAULT 0, market_median REAL NOT NULL DEFAULT 0, market_high REAL NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL, client_id INTEGER NOT NULL,
      sale_price REAL NOT NULL DEFAULT 0, deposit REAL NOT NULL DEFAULT 0, financing REAL NOT NULL DEFAULT 0,
      tradein INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', pdf_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER, vehicle_id INTEGER, client_id INTEGER,
      event_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'DA_FARE', due_at TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'UNREAD', sent_at TEXT NOT NULL DEFAULT '', read_at TEXT NOT NULL DEFAULT '',
      snoozed_until TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'STAFF', password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, session_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, last_login_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL, path TEXT NOT NULL, status_code INTEGER NOT NULL DEFAULT 0,
      ip_address TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    """
    with db() as conn:
        conn.executescript(schema)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_tasks_due_open ON tasks(completed,due_date);
        CREATE INDEX IF NOT EXISTS idx_works_vehicle_open ON works(vehicle_id,completed);
        CREATE INDEX IF NOT EXISTS idx_documents_vehicle ON documents(vehicle_id);
        CREATE INDEX IF NOT EXISTS idx_clients_next_contact ON clients(next_contact_date);
        CREATE INDEX IF NOT EXISTS idx_client_interactions_client ON client_interactions(client_id,happened_at DESC);
        """)
        # V1.2 migration: link generated work tasks to the exact work record.
        # Linking by title was unsafe when two works had the same name.
        task_columns = {r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()}
        if "work_id" not in task_columns:
            conn.execute("ALTER TABLE tasks ADD COLUMN work_id INTEGER")
        vehicle_columns = {r[1] for r in conn.execute("PRAGMA table_info(vehicles)").fetchall()}
        if "engine_cc" not in vehicle_columns:
            conn.execute("ALTER TABLE vehicles ADD COLUMN engine_cc INTEGER NOT NULL DEFAULT 0")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_work ON tasks(work_id)")
        task_columns = {r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()}
        if "delivery_phase" not in task_columns:
            conn.execute("ALTER TABLE tasks ADD COLUMN delivery_phase INTEGER")
        if "reminder_minutes" not in task_columns:
            conn.execute("ALTER TABLE tasks ADD COLUMN reminder_minutes INTEGER NOT NULL DEFAULT 0")
        user_columns = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "session_version" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0")
        client_columns = {r[1] for r in conn.execute("PRAGMA table_info(clients)").fetchall()}
        if "next_contact_time" not in client_columns:
            conn.execute("ALTER TABLE clients ADD COLUMN next_contact_time TEXT NOT NULL DEFAULT ''")
        if "reminder_minutes" not in client_columns:
            conn.execute("ALTER TABLE clients ADD COLUMN reminder_minutes INTEGER NOT NULL DEFAULT 30")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_delivery_phase ON tasks(vehicle_id,source,delivery_phase)")
        notification_columns = {r[1] for r in conn.execute("PRAGMA table_info(notifications)").fetchall()}
        if "push_attempts" not in notification_columns:
            conn.execute("ALTER TABLE notifications ADD COLUMN push_attempts INTEGER NOT NULL DEFAULT 0")
        if "last_push_attempt_at" not in notification_columns:
            conn.execute("ALTER TABLE notifications ADD COLUMN last_push_attempt_at TEXT NOT NULL DEFAULT ''")
        if "last_push_error" not in notification_columns:
            conn.execute("ALTER TABLE notifications ADD COLUMN last_push_error TEXT NOT NULL DEFAULT ''")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notifications_status_due ON notifications(status,due_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notifications_push_retry ON notifications(status,sent_at,last_push_attempt_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_seen ON push_subscriptions(last_seen_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_delivery_items_vehicle ON delivery_items(vehicle_id,phase_days_before,completed)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_active ON users(active,role)")
        # V1.12 Document Brain: smart OCR, PDF splitting, auto-link and one-tap actions.
        document_columns = {r[1] for r in conn.execute("PRAGMA table_info(documents)").fetchall()}
        for col, ddl in [
            ("batch_id", "ALTER TABLE documents ADD COLUMN batch_id INTEGER"),
            ("detected_doc_type", "ALTER TABLE documents ADD COLUMN detected_doc_type TEXT NOT NULL DEFAULT 'altro'"),
            ("confidence", "ALTER TABLE documents ADD COLUMN confidence REAL NOT NULL DEFAULT 0"),
            ("auto_linked", "ALTER TABLE documents ADD COLUMN auto_linked INTEGER NOT NULL DEFAULT 0"),
            ("page_from", "ALTER TABLE documents ADD COLUMN page_from INTEGER NOT NULL DEFAULT 1"),
            ("page_to", "ALTER TABLE documents ADD COLUMN page_to INTEGER NOT NULL DEFAULT 1"),
            ("review_reason", "ALTER TABLE documents ADD COLUMN review_reason TEXT NOT NULL DEFAULT ''"),
            ("analysis_state", "ALTER TABLE documents ADD COLUMN analysis_state TEXT NOT NULL DEFAULT 'READY'"),
        ]:
            if col not in document_columns:
                conn.execute(ddl)
        expense_columns = {r[1] for r in conn.execute("PRAGMA table_info(expenses)").fetchall()}
        if "source_document_id" not in expense_columns:
            conn.execute("ALTER TABLE expenses ADD COLUMN source_document_id INTEGER")
        if "supplier" not in expense_columns:
            conn.execute("ALTER TABLE expenses ADD COLUMN supplier TEXT NOT NULL DEFAULT ''")
        if "source" not in expense_columns:
            conn.execute("ALTER TABLE expenses ADD COLUMN source TEXT NOT NULL DEFAULT 'manuale'")
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS document_batches (
          id INTEGER PRIMARY KEY AUTOINCREMENT, original_name TEXT NOT NULL, stored_name TEXT NOT NULL,
          mime_type TEXT NOT NULL DEFAULT '', page_count INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'ANALYZED', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS document_actions (
          id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER NOT NULL, action_type TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'PENDING',
          result_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT '',
          FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_documents_batch ON documents(batch_id,page_from);
        CREATE INDEX IF NOT EXISTS idx_documents_review ON documents(confirmed,vehicle_id,client_id);
        CREATE INDEX IF NOT EXISTS idx_document_actions_status ON document_actions(status,created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_source_document ON expenses(source_document_id) WHERE source_document_id IS NOT NULL;
        """)
        conn.execute(
            """UPDATE tasks
               SET work_id=(
                 SELECT MIN(w.id) FROM works w
                 WHERE w.vehicle_id=tasks.vehicle_id AND w.title=tasks.title
               )
               WHERE source='lavoro' AND work_id IS NULL
                 AND 1=(SELECT COUNT(*) FROM works w WHERE w.vehicle_id=tasks.vehicle_id AND w.title=tasks.title)"""
        )
        conn.execute("INSERT INTO app_meta(key,value) VALUES('schema_version','12') ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        defaults = {
            "dealer_name": "Malù23 Cars",
            "dealer_owner": "Luca Stefana",
            "dealer_address": "Via Brescia, 4 - 25065 Lumezzane (BS)",
            "dealer_vat": "",
            "dealer_phone": "+39 351 953 8688",
            "dealer_phone_secondary": "+39 345 0671666",
            "dealer_email": "lucastefana00@gmail.com",
            "dealer_email_secondary": "silvano975@gmail.com",
            "dealer_tagline": "Acquistiamo e vendiamo auto usate di tutti i tipi",
            "dealer_guarantee": "12 mesi",
            "dealer_services": "Valutazione immediata|Permute|Finanziamenti personalizzati",
            "autoscout_bio": "Malù23 Cars è una concessionaria plurimarche con sede a Lumezzane, in provincia di Brescia, specializzata nella vendita di auto usate, seminuove, sportive, economiche e veicoli commerciali.",
            "notify_default_minutes": "30",
            "notify_day_start": "08:30",
            "dealer_tax_code": "",
            "dealer_pec": "",
            "dealer_sdi": "",
            "dealer_iban": "",
            "contract_terms": "",
            "privacy_note": "",
            "contract_reviewed": "0",
            "backup_auto_enabled": "1",
            "backup_time": "02:30",
            "backup_retention_days": "14",
        }
        for k, v in defaults.items():
            conn.execute("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", (k, v))


init_db()


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def normalize_plate(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def normalize_eu_date(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return validate_iso_date(value, "Data")
    m = re.fullmatch(r"([0-3]?\d)[./-]([01]?\d)[./-]((?:19|20)?\d{2})", value)
    if not m:
        return ""
    day, month, year = m.groups()
    if len(year) == 2:
        year = ("19" if int(year) > 40 else "20") + year
    try:
        return date(int(year), int(month), int(day)).isoformat()
    except ValueError:
        return ""


def extract_registration_fields(text: str) -> dict[str, str]:
    """Best-effort parser for EU/Italian registration-certificate OCR.

    It deliberately returns proposals only. Nothing is persisted until the user confirms.
    """
    fields: dict[str, str] = {}
    raw_lines = [re.sub(r"\s+", " ", line).strip() for line in (text or "").splitlines() if line.strip()]
    upper_lines = [line.upper() for line in raw_lines]
    upper = " ".join(upper_lines)

    plate = re.search(r"\b[A-Z]{2}\s*\d{3}\s*[A-Z]{2}\b", upper)
    vin = re.search(r"\b[A-HJ-NPR-Z0-9]{17}\b", upper)
    cf = re.search(r"\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b", upper)
    if plate:
        fields["plate"] = normalize_plate(plate.group(0))
    if vin:
        fields["vin"] = vin.group(0)
    if cf:
        fields["fiscal_code"] = cf.group(0)

    # EU registration certificate fields: B=first registration, D.1=make,
    # D.3=commercial description/model, P.1=engine cc, P.3=fuel.
    patterns = {
        "brand": r"^\(?D[. ]?1\)?\s*[:\-]?\s*(.+)$",
        "model": r"^\(?D[. ]?3\)?\s*[:\-]?\s*(.+)$",
        "registration_date": r"^\(?B\)?\s*[:\-]?\s*([0-3]?\d[./-][01]?\d[./-](?:19|20)?\d{2})\b",
        "engine_cc": r"^\(?P[. ]?1\)?\s*[:\-]?\s*(\d{3,5})\b",
        "fuel": r"^\(?P[. ]?3\)?\s*[:\-]?\s*([A-ZÀ-ÖØ-Ý0-9 /+-]{2,30})$",
    }
    for key, pattern in patterns.items():
        for line in upper_lines:
            m = re.match(pattern, line)
            if not m:
                continue
            value = m.group(1).strip(" :-")
            if key == "registration_date":
                value = normalize_eu_date(value)
            if value:
                fields[key] = value
            break
    return fields




def _parse_eu_money(value: str) -> float:
    """Parse common Italian/European money forms without guessing wildly."""
    raw = re.sub(r"[^0-9,.-]", "", value or "").strip()
    if not raw:
        return 0.0
    # 1.234,56 -> 1234.56 ; 1234,56 -> 1234.56 ; 1234.56 -> 1234.56
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    try:
        return round(float(raw), 2)
    except ValueError:
        return 0.0


def extract_smart_fields(text: str) -> dict[str, Any]:
    """Extract vehicle, client and accounting proposals from generic OCR text.

    These are proposals only; financial/identity changes still require a user action.
    """
    fields: dict[str, Any] = dict(extract_registration_fields(text))
    lines = [re.sub(r"\s+", " ", x).strip() for x in (text or "").splitlines() if x.strip()]
    upper_lines = [x.upper() for x in lines]
    upper = "\n".join(upper_lines)

    # Prefer clearly labelled totals over arbitrary numeric values.
    labelled_amounts: list[float] = []
    generic_amounts: list[float] = []
    money_rx = re.compile(r"(?:€\s*|EUR\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2}))\s*(?:€|EUR)?", re.I)
    for line in lines:
        vals = [_parse_eu_money(m.group(1)) for m in money_rx.finditer(line)]
        vals = [v for v in vals if 0 < v < 2_000_000]
        if not vals:
            continue
        generic_amounts.extend(vals)
        if re.search(r"\b(TOTALE|TOTAL|IMPORTO\s+TOTALE|DA\s+PAGARE|NETTO\s+A\s+PAGARE|PAGATO)\b", line, re.I):
            labelled_amounts.extend(vals)
    if labelled_amounts:
        fields["amount"] = max(labelled_amounts)
    elif generic_amounts and re.search(r"FATTURA|RICEVUTA|SCONTRINO|BONIFICO", upper):
        # For expense-like documents the largest plausible amount is usually the total.
        fields["amount"] = max(generic_amounts)

    for line in lines:
        m = re.search(r"\b(?:DATA|DATE|EMESS[AO]|DEL)\s*[:\-]?\s*([0-3]?\d[./-][01]?\d[./-](?:19|20)?\d{2})\b", line, re.I)
        if m:
            normalized = normalize_eu_date(m.group(1))
            if normalized:
                fields["document_date"] = normalized
                break
    if "document_date" not in fields:
        for match in re.finditer(r"\b([0-3]?\d[./-][01]?\d[./-](?:19|20)\d{2})\b", upper):
            normalized = normalize_eu_date(match.group(1))
            if normalized:
                fields["document_date"] = normalized
                break

    km = re.search(r"\b(?:KM|CHILOMETRI|KILOMETRAGGIO)\s*[:\-]?\s*([0-9][0-9.\s]{2,9})\b", upper)
    if km:
        try:
            fields["mileage"] = int(re.sub(r"\D", "", km.group(1)))
        except ValueError:
            pass

    inv = re.search(r"\b(?:FATTURA|FATT\.?|INVOICE)\s*(?:N[°º.]?|NUMERO|NO\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/._-]{1,30})", upper)
    if inv:
        fields["document_number"] = inv.group(1).strip(".-")

    # Useful client identifiers beyond the Italian fiscal code.
    vat = re.search(r"\b(?:P\.?\s*IVA|PARTITA\s+IVA|VAT)\s*[:\-]?\s*(IT\s*)?(\d{11})\b", upper)
    if vat:
        fields["vat_number"] = vat.group(2)
    iban = re.search(r"\bIT\d{2}[A-Z]\d{10}[A-Z0-9]{12}\b", re.sub(r"\s+", "", upper))
    if iban:
        fields["iban"] = iban.group(0)
    return fields


def classify_document_text(text: str, fields: dict[str, Any] | None = None) -> tuple[str, float]:
    """Classify a dealership document using explainable local rules."""
    upper = (text or "").upper()
    fields = fields or {}
    scores: dict[str, float] = {
        "libretto": 0,
        "fattura": 0,
        "ricevuta": 0,
        "bonifico": 0,
        "COC": 0,
        "documento identita": 0,
        "codice fiscale": 0,
        "contratto": 0,
        "documento estero": 0,
        "altro": 0.1,
    }
    rules = {
        "libretto": [("CARTA DI CIRCOLAZIONE", 5), ("CERTIFICATO DI CIRCOLAZIONE", 5), ("D.1", 1.5), ("P.1", 1.5), ("NUMERO DI TELAIO", 2)],
        "fattura": [("FATTURA", 5), ("IMPONIBILE", 2), ("ALIQUOTA IVA", 2), ("PARTITA IVA", 1)],
        "ricevuta": [("SCONTRINO", 5), ("RICEVUTA", 4), ("CORRISPETTIVO", 2)],
        "bonifico": [("BONIFICO", 5), ("TRN", 2), ("CRO", 2), ("ORDINANTE", 1.5)],
        "COC": [("CERTIFICATE OF CONFORMITY", 6), ("CERTIFICATO DI CONFORMITA", 6), ("CERTIFICATO DI CONFORMITÀ", 6), ("COC", 2)],
        "documento identita": [("CARTA D'IDENTITA", 6), ("CARTA D’IDENTITÀ", 6), ("IDENTITY CARD", 6), ("DOCUMENTO DI IDENTITA", 5)],
        "codice fiscale": [("TESSERA SANITARIA", 6), ("CODICE FISCALE", 3)],
        "contratto": [("CONTRATTO", 4), ("COMPRAVENDITA", 4), ("ACQUIRENTE", 2), ("VENDITORE", 2)],
        "documento estero": [("ZULASSUNGSBESCHEINIGUNG", 7), ("FAHRZEUGBRIEF", 7), ("REGISTRATION CERTIFICATE", 5), ("ZULASSUNG", 3)],
    }
    for kind, items in rules.items():
        for token, weight in items:
            if token in upper:
                scores[kind] += weight
    if fields.get("vin") and (fields.get("plate") or fields.get("brand")):
        scores["libretto"] += 3
    if fields.get("fiscal_code"):
        scores["codice fiscale"] += 1.5
        scores["documento identita"] += 0.5
    if fields.get("amount"):
        if "FATTURA" in upper:
            scores["fattura"] += 1
        elif "BONIFICO" in upper:
            scores["bonifico"] += 1
        else:
            scores["ricevuta"] += 0.5
    ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    kind, score = ordered[0]
    second = ordered[1][1] if len(ordered) > 1 else 0
    if score < 1.5:
        return "altro", 0.35
    # Confidence rewards strong evidence and separation from the second candidate.
    confidence = min(0.99, 0.50 + min(score, 8) * 0.055 + max(0, score - second) * 0.025)
    return kind, round(confidence, 2)


def infer_expense_category(text: str) -> str:
    upper = (text or "").upper()
    mapping = [
        ("Carrozzeria", ["CARROZZ", "VERNIC", "PARAURTI", "LATTON"]),
        ("Pneumatici", ["PNEUMATIC", "GOMM", "CONVERGENZA"]),
        ("Tagliando", ["TAGLIANDO", "OLIO MOTORE", "FILTRO OLIO", "MANUTENZIONE"]),
        ("Trasporto", ["TRASPORTO", "BISARCA", "SPEDIZIONE"]),
        ("Passaggio", ["PASSAGGIO", "PRA", "ACI", "TRASCRIZIONE"]),
        ("Ricambi", ["RICAMB", "BATTERIA", "FRENI", "PASTIGLIE", "DISCHI"]),
        ("Commissioni", ["COMMISSION", "FEE", "DIRITTI D'ASTA", "DIRITTI ASTA"]),
    ]
    for category, tokens in mapping:
        if any(x in upper for x in tokens):
            return category
    return "Altro"


def _document_identity(fields: dict[str, Any]) -> str:
    return str(fields.get("vin") or fields.get("plate") or fields.get("fiscal_code") or fields.get("document_number") or "").upper()


def _match_document_owner(conn: sqlite3.Connection, fields: dict[str, Any]) -> tuple[Optional[int], Optional[int], str]:
    """Return unique auto/client match and a human-readable review note."""
    vehicle_matches: dict[int, sqlite3.Row] = {}
    for key in ("vin", "plate"):
        value = str(fields.get(key) or "").strip().upper()
        if not value:
            continue
        col = "vin" if key == "vin" else "plate"
        row = conn.execute(f"SELECT * FROM vehicles WHERE {col}=?", (value,)).fetchone()
        if row:
            vehicle_matches[int(row["id"])] = row
    vehicle_id: Optional[int] = None
    review = ""
    if len(vehicle_matches) == 1:
        vehicle_id = next(iter(vehicle_matches))
    elif len(vehicle_matches) > 1:
        review = "Targa e telaio puntano a veicoli diversi: verifica manualmente."

    client_id: Optional[int] = None
    cf = str(fields.get("fiscal_code") or "").strip().upper()
    if cf:
        rows = conn.execute("SELECT id FROM clients WHERE UPPER(fiscal_code)=?", (cf,)).fetchall()
        if len(rows) == 1:
            client_id = int(rows[0]["id"])
        elif len(rows) > 1:
            review = (review + " " if review else "") + "Codice fiscale presente su più clienti."
    return vehicle_id, client_id, review


def _pdf_page_analysis(content: bytes) -> list[dict[str, Any]]:
    pdf = fitz.open(stream=content, filetype="pdf")
    pages: list[dict[str, Any]] = []
    try:
        for idx, page in enumerate(pdf):
            direct = page.get_text("text").strip()
            if direct and len(re.sub(r"\s+", "", direct)) >= 30:
                text = direct
            else:
                pix = page.get_pixmap(matrix=fitz.Matrix(2.4, 2.4), alpha=False)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                text, _ = best_ocr_text(img)
            fields = extract_smart_fields(text)
            doc_type, confidence = classify_document_text(text, fields)
            pages.append({"page": idx + 1, "text": text, "fields": fields, "doc_type": doc_type, "confidence": confidence})
    finally:
        pdf.close()
    return pages


def _group_pdf_pages(pages: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group consecutive pages that appear to belong to the same logical document."""
    groups: list[list[dict[str, Any]]] = []
    for page in pages:
        if not groups:
            groups.append([page])
            continue
        prev = groups[-1][-1]
        current_type = page["doc_type"]
        prev_type = prev["doc_type"]
        current_id = _document_identity(page["fields"])
        prev_id = _document_identity(prev["fields"])
        same_identity = bool(current_id and prev_id and current_id == prev_id)
        continuation = current_type == "altro" and not current_id and prev_type != "altro"
        same_type = current_type == prev_type and (not current_id or not prev_id or same_identity)
        if continuation or same_identity or same_type:
            if continuation:
                page["doc_type"] = prev_type
                page["confidence"] = max(float(page["confidence"]), float(prev["confidence"]) * 0.8)
            groups[-1].append(page)
        else:
            groups.append([page])
    return groups


def _make_pdf_segment(content: bytes, page_numbers: list[int]) -> bytes:
    source = fitz.open(stream=content, filetype="pdf")
    out = fitz.open()
    try:
        for page_no in page_numbers:
            out.insert_pdf(source, from_page=page_no - 1, to_page=page_no - 1)
        return out.tobytes(garbage=4, deflate=True)
    finally:
        out.close()
        source.close()


def _merge_page_fields(group: list[dict[str, Any]]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for page in group:
        for key, value in page["fields"].items():
            if value not in ("", None, 0) and key not in merged:
                merged[key] = value
    return merged


def _create_document_suggestions(conn: sqlite3.Connection, doc_id: int) -> list[dict[str, Any]]:
    doc = conn.execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone()
    if not doc:
        return []
    try:
        fields = json.loads(doc["detected_fields"] or "{}")
    except Exception:
        fields = {}
    existing = [dict(r) for r in conn.execute("SELECT * FROM document_actions WHERE document_id=? AND status='PENDING'", (doc_id,)).fetchall()]
    if existing:
        return existing
    suggestions: list[dict[str, Any]] = []
    doc_type = str(doc["detected_doc_type"] or doc["doc_type"] or "altro")
    if doc_type in {"fattura", "ricevuta", "bonifico"} and doc["vehicle_id"] and float(fields.get("amount") or 0) > 0:
        payload = {
            "vehicle_id": int(doc["vehicle_id"]),
            "amount": float(fields["amount"]),
            "expense_date": fields.get("document_date") or date.today().isoformat(),
            "category": infer_expense_category(doc["ocr_text"] or ""),
            "description": f"{doc_type.title()} {fields.get('document_number','')}".strip(),
        }
        cur = conn.execute(
            "INSERT INTO document_actions(document_id,action_type,payload_json,created_at) VALUES(?,?,?,?)",
            (doc_id, "CREATE_EXPENSE", json.dumps(payload, ensure_ascii=False), now_iso()),
        )
        suggestions.append(dict(conn.execute("SELECT * FROM document_actions WHERE id=?", (cur.lastrowid,)).fetchone()))
    if doc_type == "libretto" and not doc["vehicle_id"] and (fields.get("plate") or fields.get("vin")):
        payload = {k: fields.get(k) for k in ("plate", "vin", "brand", "model", "registration_date", "fuel", "engine_cc", "mileage") if fields.get(k) not in (None, "")}
        cur = conn.execute(
            "INSERT INTO document_actions(document_id,action_type,payload_json,created_at) VALUES(?,?,?,?)",
            (doc_id, "CREATE_VEHICLE", json.dumps(payload, ensure_ascii=False), now_iso()),
        )
        suggestions.append(dict(conn.execute("SELECT * FROM document_actions WHERE id=?", (cur.lastrowid,)).fetchone()))
    return suggestions

def vehicle_label(row: sqlite3.Row | dict) -> str:
    brand = row["brand"] if isinstance(row, sqlite3.Row) else row.get("brand", "")
    model = row["model"] if isinstance(row, sqlite3.Row) else row.get("model", "")
    plate = row["plate"] if isinstance(row, sqlite3.Row) else row.get("plate", "")
    return " ".join(x for x in [brand, model, f"({plate})" if plate else ""] if x).strip() or "Veicolo"


def set_status(conn: sqlite3.Connection, vehicle_id: int, new_status: str, reason: str = "") -> None:
    if new_status not in VEHICLE_STATES:
        raise HTTPException(400, "Stato veicolo non valido")
    row = conn.execute("SELECT status FROM vehicles WHERE id=?", (vehicle_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Veicolo non trovato")
    if row["status"] == new_status:
        return
    conn.execute("UPDATE vehicles SET status=?,updated_at=? WHERE id=?", (new_status, now_iso(), vehicle_id))
    conn.execute(
        "INSERT INTO status_history(vehicle_id,old_status,new_status,reason,created_at) VALUES(?,?,?,?,?)",
        (vehicle_id, row["status"], new_status, reason, now_iso()),
    )


def recalc_priority(due_date: str, completed: int, source: str = "") -> str:
    if completed:
        return "COMPLETATO"
    if not due_date:
        return "DA_FARE"
    try:
        days = (date.fromisoformat(due_date) - date.today()).days
    except Exception:
        return "DA_FARE"
    if days < 0 or days <= 1:
        return "URGENTE"
    if days <= 3:
        return "IMPORTANTE"
    return "DA_FARE"


def vehicle_total(conn: sqlite3.Connection, vehicle_id: int) -> float:
    v = conn.execute("SELECT purchase_price FROM vehicles WHERE id=?", (vehicle_id,)).fetchone()
    if not v:
        return 0
    exp = conn.execute("SELECT COALESCE(SUM(amount),0) s FROM expenses WHERE vehicle_id=?", (vehicle_id,)).fetchone()["s"]
    works = conn.execute("SELECT COALESCE(SUM(actual_cost),0) s FROM works WHERE vehicle_id=?", (vehicle_id,)).fetchone()["s"]
    return round(float(v["purchase_price"] or 0) + float(exp or 0) + float(works or 0), 2)


def enrich_vehicle(conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    total = vehicle_total(conn, row["id"])
    d["total_invested"] = total
    sale_ref = float(d.get("sale_price") or d.get("expected_sale_price") or 0)
    d["margin"] = round(sale_ref - total, 2) if sale_ref else None
    return d


def ensure_vehicle(conn: sqlite3.Connection, vehicle_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM vehicles WHERE id=?", (vehicle_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Veicolo non trovato")
    return row


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _vapid_private_key() -> ec.EllipticCurvePrivateKey:
    path = DATA_DIR / "vapid_private.pem"
    if path.exists():
        return serialization.load_pem_private_key(path.read_bytes(), password=None)
    key = ec.generate_private_key(ec.SECP256R1())
    path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return key


def vapid_public_key_b64() -> str:
    pub = _vapid_private_key().public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64url(pub)


def _vapid_jwt(endpoint: str, subject: str) -> str:
    key = _vapid_private_key()
    parsed = urlparse(endpoint)
    aud = f"{parsed.scheme}://{parsed.netloc}"
    header = _b64url(json.dumps({"typ":"JWT","alg":"ES256"}, separators=(",",":")).encode())
    payload = _b64url(json.dumps({"aud":aud,"exp":int(time.time())+12*3600,"sub":subject}, separators=(",",":")).encode())
    signing = f"{header}.{payload}".encode()
    der = key.sign(signing, ec.ECDSA(hashes.SHA256()))
    r, ss = asym_utils.decode_dss_signature(der)
    sig = _b64url(r.to_bytes(32,"big") + ss.to_bytes(32,"big"))
    return f"{header}.{payload}.{sig}"


def _encrypt_webpush(subscription: dict[str, Any], payload: bytes) -> bytes:
    ua_public_bytes = _b64url_decode(subscription["p256dh"])
    auth_secret = _b64url_decode(subscription["auth"])
    ua_public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public_bytes)
    as_private = ec.generate_private_key(ec.SECP256R1())
    as_public_bytes = as_private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    shared = as_private.exchange(ec.ECDH(), ua_public)
    info = b"WebPush: info\x00" + ua_public_bytes + as_public_bytes
    ikm = HKDF(algorithm=hashes.SHA256(), length=32, salt=auth_secret, info=info).derive(shared)
    salt = os.urandom(16)
    cek = HKDF(algorithm=hashes.SHA256(), length=16, salt=salt, info=b"Content-Encoding: aes128gcm\x00").derive(ikm)
    nonce = HKDF(algorithm=hashes.SHA256(), length=12, salt=salt, info=b"Content-Encoding: nonce\x00").derive(ikm)
    ciphertext = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)
    return salt + (4096).to_bytes(4, "big") + bytes([len(as_public_bytes)]) + as_public_bytes + ciphertext


def send_webpush(subscription: dict[str, Any], message: dict[str, Any]) -> tuple[bool, str]:
    endpoint = subscription.get("endpoint", "")
    if not endpoint.startswith("https://"):
        return False, "Endpoint push non HTTPS"
    with db() as conn:
        settings = {r["key"]: r["value"] for r in conn.execute("SELECT * FROM settings").fetchall()}
    subject = f"mailto:{settings.get('dealer_email') or 'info@example.com'}"
    try:
        body = _encrypt_webpush(subscription, json.dumps(message, ensure_ascii=False, separators=(",",":")).encode())
        jwt = _vapid_jwt(endpoint, subject)
        headers = {
            "TTL": "86400",
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "Authorization": f"vapid t={jwt}, k={vapid_public_key_b64()}",
        }
        r = httpx.post(endpoint, content=body, headers=headers, timeout=8.0)
        if r.status_code in (200, 201, 202):
            return True, str(r.status_code)
        if r.status_code in (404, 410):
            with db() as conn:
                conn.execute("DELETE FROM push_subscriptions WHERE endpoint=?", (endpoint,))
        return False, f"HTTP {r.status_code}"
    except Exception as e:
        return False, str(e)


def _task_due_dt(task: sqlite3.Row | dict, day_start: str = "08:30") -> datetime | None:
    due_date = task["due_date"] if isinstance(task, sqlite3.Row) else task.get("due_date", "")
    if not due_date:
        return None
    due_time = (task["due_time"] if isinstance(task, sqlite3.Row) else task.get("due_time", "")) or day_start
    try:
        return datetime.fromisoformat(f"{due_date}T{due_time}:00" if len(due_time)==5 else f"{due_date}T{due_time}")
    except ValueError:
        return None


def refresh_due_notifications(send_push: bool = True) -> list[dict[str, Any]]:
    created: list[dict[str, Any]] = []
    now = datetime.now()
    with db() as conn:
        settings = {r["key"]:r["value"] for r in conn.execute("SELECT * FROM settings").fetchall()}
        day_start = settings.get("notify_day_start", "08:30")
        now_key = now.isoformat(timespec="minutes")
        snoozed = conn.execute("SELECT * FROM notifications WHERE status='SNOOZED' AND snoozed_until<>'' AND snoozed_until<=?", (now_key,)).fetchall()
        for n in snoozed:
            conn.execute("UPDATE notifications SET status='UNREAD',snoozed_until='' WHERE id=?", (n["id"],))
            created.append(dict(conn.execute("SELECT * FROM notifications WHERE id=?", (n["id"],)).fetchone()))
        rows = conn.execute("""SELECT t.*,v.brand,v.model,v.plate,c.first_name,c.last_name
                               FROM tasks t LEFT JOIN vehicles v ON v.id=t.vehicle_id
                               LEFT JOIN clients c ON c.id=t.client_id
                               WHERE t.completed=0 AND t.due_date<>''""").fetchall()
        for task in rows:
            due_dt = _task_due_dt(task, day_start)
            if not due_dt:
                continue
            reminder = max(0, int(task["reminder_minutes"] or 0))
            notify_at = due_dt - timedelta(minutes=reminder)
            if now < notify_at:
                continue
            event_key = f"task:{task['id']}:{task['due_date']}:{task['due_time']}:{reminder}"
            if conn.execute("SELECT 1 FROM notifications WHERE event_key=?", (event_key,)).fetchone():
                continue
            person = " ".join(x for x in [task["first_name"], task["last_name"]] if x).strip()
            car = " ".join(x for x in [task["brand"], task["model"], task["plate"]] if x).strip()
            context = " · ".join(x for x in [person, car] if x)
            overdue = now > due_dt
            title = ("🔴 Scaduto · " if overdue else "") + task["title"]
            body = task["description"] or context or "Attività Malù23 Cars"
            cur = conn.execute("""INSERT INTO notifications(task_id,vehicle_id,client_id,event_key,title,body,priority,due_at,created_at)
                                  VALUES(?,?,?,?,?,?,?,?,?)""",
                               (task["id"], task["vehicle_id"], task["client_id"], event_key, title, body,
                                recalc_priority(task["due_date"],0,task["source"]), due_dt.isoformat(timespec="minutes"), now_iso()))
            created.append(dict(conn.execute("SELECT * FROM notifications WHERE id=?", (cur.lastrowid,)).fetchone()))
        subscriptions = [dict(r) for r in conn.execute("SELECT * FROM push_subscriptions").fetchall()] if send_push else []
        retry_before = (now - timedelta(minutes=5)).isoformat(timespec="minutes")
        pending_push = [
            dict(r) for r in conn.execute(
                """SELECT * FROM notifications
                   WHERE status='UNREAD' AND sent_at=''
                     AND (last_push_attempt_at='' OR last_push_attempt_at<=?)
                   ORDER BY id LIMIT 50""",
                (retry_before,),
            ).fetchall()
        ] if send_push and subscriptions else []
    if send_push and subscriptions and pending_push:
        for n in pending_push:
            ok_any = False
            errors: list[str] = []
            for sub in subscriptions:
                ok, detail = send_webpush(
                    sub,
                    {"title": n["title"], "body": n["body"], "notification_id": n["id"], "url": "/?view=today"},
                )
                ok_any = ok_any or ok
                if not ok and detail:
                    errors.append(detail[:180])
            with db() as conn:
                if ok_any:
                    conn.execute(
                        "UPDATE notifications SET sent_at=?,last_push_attempt_at=?,last_push_error='' WHERE id=?",
                        (now_iso(), now_iso(), n["id"]),
                    )
                else:
                    conn.execute(
                        """UPDATE notifications
                           SET push_attempts=push_attempts+1,last_push_attempt_at=?,last_push_error=?
                           WHERE id=?""",
                        (now_iso(), " | ".join(errors[:3]), n["id"]),
                    )
    return created


def _notification_worker() -> None:
    # Run once immediately, then every ~30s. The stop event gives FastAPI a
    # clean shutdown and avoids the deprecated startup hook.
    while not SCHEDULER_STOP.is_set():
        try:
            refresh_due_notifications(send_push=True)
            maybe_run_scheduled_backup()
        except Exception:
            logger.exception("Errore nel ciclo Notification/Backup Brain")
        if SCHEDULER_STOP.wait(30):
            break


class VehicleIn(BaseModel):
    acquisition_type: str = "acquisto"
    brand: str = ""
    model: str = ""
    version: str = ""
    plate: str = ""
    vin: str = ""
    registration_date: str = ""
    fuel: str = ""
    engine_cc: int = 0
    transmission: str = ""
    mileage: int = 0
    color: str = ""
    purchase_price: float = 0
    expected_sale_price: float = 0
    notes: str = ""
    status: str = "IN_ARRIVO"


class WorkIn(BaseModel):
    category: str
    title: str
    due_date: str = ""
    provider: str = ""
    expected_cost: float = 0
    actual_cost: float = 0
    notes: str = ""


class ExpenseIn(BaseModel):
    category: str
    description: str = ""
    supplier: str = ""
    amount: float
    expense_date: str = ""
    source_document_id: Optional[int] = None
    source: str = "manuale"


class TaskIn(BaseModel):
    vehicle_id: Optional[int] = None
    client_id: Optional[int] = None
    title: str
    description: str = ""
    due_date: str = ""
    due_time: str = ""
    reminder_minutes: int = 0
    priority: str = "DA_FARE"
    source: str = "manuale"


class ClientIn(BaseModel):
    first_name: str
    last_name: str = ""
    phone: str = ""
    email: str = ""
    fiscal_code: str = ""
    address: str = ""
    interested_vehicle_id: Optional[int] = None
    tradein_notes: str = ""
    offer: float = 0
    status: str = "INTERESSATO"
    last_contact: str = ""
    next_step: str = ""
    next_contact_date: str = ""
    next_contact_time: str = ""
    reminder_minutes: int = 30
    notes: str = ""


class ClientInteractionIn(BaseModel):
    action: str
    note: str = ""
    happened_at: str = ""


class ClientCallbackIn(BaseModel):
    due_date: str
    due_time: str = ""
    reminder_minutes: int = 30
    next_step: str = "Richiamare cliente"


class DeliveryIn(BaseModel):
    delivery_date: str
    delivery_time: str = ""
    notes: str = ""


class ListingIn(BaseModel):
    url: str = ""
    published_date: str = ""
    initial_price: float = 0
    current_price: float = 0
    market_low: float = 0
    market_median: float = 0
    market_high: float = 0
    title: str = ""
    description: str = ""


class ContractIn(BaseModel):
    vehicle_id: int
    client_id: int
    sale_price: float
    deposit: float = 0
    financing: float = 0
    notes: str = ""
    tradein_vehicle: Optional[dict[str, Any]] = None



class UserIn(BaseModel):
    username: str
    display_name: str = ""
    password: str = ""
    role: str = "STAFF"
    active: bool = True


def _owner_guard(request: Request) -> None:
    if auth_enabled() and _request_user(request).get("role") != "OWNER":
        raise HTTPException(403, "Operazione riservata al titolare")


@app.get("/api/me")
def me(request: Request) -> dict[str, str]:
    return _request_user(request)


@app.get("/api/users")
def list_users(request: Request) -> list[dict[str, Any]]:
    _owner_guard(request)
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT id,username,display_name,role,active,created_at,last_login_at FROM users ORDER BY role,username").fetchall()]


@app.post("/api/users")
def save_user(u: UserIn, request: Request) -> dict[str, Any]:
    _owner_guard(request)
    username = re.sub(r"[^A-Za-z0-9._-]", "", (u.username or "").strip().lower())
    if len(username) < 3:
        raise HTTPException(422, "Username troppo corto")
    role = (u.role or "STAFF").upper()
    if role not in {"OWNER", "STAFF"}:
        raise HTTPException(422, "Ruolo non valido")
    with db() as conn:
        current = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        active_users = conn.execute("SELECT COUNT(*) FROM users WHERE active=1").fetchone()[0]
        active_owners = conn.execute("SELECT COUNT(*) FROM users WHERE active=1 AND role='OWNER'").fetchone()[0]

        if not current:
            if len(u.password) < 8:
                raise HTTPException(422, "La password deve avere almeno 8 caratteri")
            if active_users == 0 and (role != "OWNER" or not u.active):
                raise HTTPException(422, "Il primo utente deve essere un Titolare attivo")
        else:
            removing_last_owner = (
                current["active"] == 1
                and current["role"] == "OWNER"
                and active_owners == 1
                and (role != "OWNER" or not u.active)
            )
            if removing_last_owner:
                raise HTTPException(422, "Deve rimanere almeno un Titolare attivo")

        if current:
            invalidate_sessions = bool(u.password) or current["role"] != role or bool(current["active"]) != bool(u.active)
            new_session_version = int(current["session_version"] or 0) + (1 if invalidate_sessions else 0)
            if u.password:
                if len(u.password) < 8:
                    raise HTTPException(422, "La password deve avere almeno 8 caratteri")
                salt = secrets.token_hex(16)
                ph = _password_hash(u.password, salt)
                conn.execute(
                    "UPDATE users SET display_name=?,role=?,active=?,password_salt=?,password_hash=?,session_version=? WHERE username=?",
                    (u.display_name.strip(), role, 1 if u.active else 0, salt, ph, new_session_version, username),
                )
            else:
                conn.execute(
                    "UPDATE users SET display_name=?,role=?,active=?,session_version=? WHERE username=?",
                    (u.display_name.strip(), role, 1 if u.active else 0, new_session_version, username),
                )
        else:
            salt = secrets.token_hex(16)
            ph = _password_hash(u.password, salt)
            conn.execute(
                "INSERT INTO users(username,display_name,role,password_salt,password_hash,active,session_version,created_at) VALUES(?,?,?,?,?,?,0,?)",
                (username,u.display_name.strip(),role,salt,ph,1 if u.active else 0,now_iso()),
            )
        return dict(conn.execute("SELECT id,username,display_name,role,active,created_at,last_login_at FROM users WHERE username=?", (username,)).fetchone())


@app.get("/api/audit")
def audit_log(request: Request, limit: int = 100) -> list[dict[str, Any]]:
    _owner_guard(request)
    limit = max(1, min(limit, 500))
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()]


@app.get("/install", response_class=HTMLResponse)
def install_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "install.html")


@app.get("/launch")
def launch(request: Request) -> RedirectResponse:
    """Public PWA launch gate: installed icon always lands on OGGI.

    If production login is enabled and the session is missing/expired, the
    middleware deliberately leaves this route public so we can send the user
    to the login page cleanly. After login the default route is OGGI.
    """
    if auth_enabled():
        parsed = _parse_session(request.cookies.get("autosalone_session", ""))
        if not parsed or not _current_session_identity(parsed):
            return RedirectResponse("/login", status_code=303)
    return RedirectResponse("/?source=pwa&view=today", status_code=303)


@app.get("/", response_class=HTMLResponse)
def root() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/manifest.webmanifest")
def manifest() -> FileResponse:
    return FileResponse(STATIC_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/sw.js")
def sw() -> FileResponse:
    return FileResponse(STATIC_DIR / "sw.js", media_type="application/javascript")


@app.get("/api/status")
def status() -> dict[str, Any]:
    with db() as conn:
        counts = {
            "vehicles": conn.execute("SELECT COUNT(*) c FROM vehicles").fetchone()["c"],
            "open_tasks": conn.execute("SELECT COUNT(*) c FROM tasks WHERE completed=0").fetchone()["c"],
            "clients": conn.execute("SELECT COUNT(*) c FROM clients").fetchone()["c"],
            "unread_notifications": conn.execute("SELECT COUNT(*) c FROM notifications WHERE status='UNREAD'").fetchone()["c"],
            "push_devices": conn.execute("SELECT COUNT(*) c FROM push_subscriptions").fetchone()["c"],
            "users": conn.execute("SELECT COUNT(*) c FROM users WHERE active=1").fetchone()["c"],
            "audit_events": conn.execute("SELECT COUNT(*) c FROM audit_log").fetchone()["c"],
        }
    integrity_ok, integrity_message = database_integrity()
    ocr_available = shutil.which("tesseract") is not None
    langs = tesseract_languages() if ocr_available else []
    return {"ok": integrity_ok, "version": APP_VERSION, "database": DB_PATH.name, "database_integrity": integrity_message, "ocr_available": ocr_available, "ocr_language": preferred_ocr_language() if ocr_available else "", "ocr_languages": langs, **counts}


@app.get("/api/push/public-key")
def push_public_key() -> dict[str, str]:
    return {"public_key": vapid_public_key_b64()}


@app.post("/api/push/subscribe")
async def push_subscribe(request: Request) -> dict[str, Any]:
    payload = await request.json()
    endpoint = str(payload.get("endpoint") or "")
    keys = payload.get("keys") or {}
    p256dh = str(keys.get("p256dh") or "")
    auth = str(keys.get("auth") or "")
    if not endpoint.startswith("https://") or not p256dh or not auth:
        raise HTTPException(422, "Iscrizione notifiche non valida")
    with db() as conn:
        conn.execute("""INSERT INTO push_subscriptions(endpoint,p256dh,auth,user_agent,created_at,last_seen_at)
                        VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,
                        user_agent=excluded.user_agent,last_seen_at=excluded.last_seen_at""",
                     (endpoint,p256dh,auth,request.headers.get("user-agent","")[:500],now_iso(),now_iso()))
        count = conn.execute("SELECT COUNT(*) c FROM push_subscriptions").fetchone()["c"]
    return {"ok": True, "devices": count}


@app.post("/api/push/unsubscribe")
async def push_unsubscribe(request: Request) -> dict[str, bool]:
    payload = await request.json()
    endpoint = str(payload.get("endpoint") or "")
    with db() as conn:
        conn.execute("DELETE FROM push_subscriptions WHERE endpoint=?", (endpoint,))
    return {"ok": True}


@app.get("/api/notifications")
def list_notifications(include_read: bool = True) -> list[dict[str, Any]]:
    refresh_due_notifications(send_push=False)
    with db() as conn:
        q = """SELECT n.*,v.brand,v.model,v.plate,c.first_name,c.last_name FROM notifications n
               LEFT JOIN vehicles v ON v.id=n.vehicle_id LEFT JOIN clients c ON c.id=n.client_id"""
        if not include_read:
            q += " WHERE n.status='UNREAD'"
        q += " ORDER BY CASE n.status WHEN 'UNREAD' THEN 0 ELSE 1 END, n.created_at DESC LIMIT 200"
        return [dict(r) for r in conn.execute(q).fetchall()]


@app.post("/api/notifications/{notification_id}/read")
def read_notification(notification_id: int) -> dict[str, Any]:
    with db() as conn:
        if not conn.execute("SELECT 1 FROM notifications WHERE id=?", (notification_id,)).fetchone():
            raise HTTPException(404, "Notifica non trovata")
        conn.execute("UPDATE notifications SET status='READ',read_at=? WHERE id=?", (now_iso(),notification_id))
        return dict(conn.execute("SELECT * FROM notifications WHERE id=?", (notification_id,)).fetchone())


@app.post("/api/notifications/{notification_id}/snooze")
def snooze_notification(notification_id: int, minutes: int = 60) -> dict[str, Any]:
    minutes = max(5, min(int(minutes), 7*24*60))
    with db() as conn:
        n = conn.execute("SELECT * FROM notifications WHERE id=?", (notification_id,)).fetchone()
        if not n:
            raise HTTPException(404, "Notifica non trovata")
        until = (datetime.now() + timedelta(minutes=minutes)).isoformat(timespec="minutes")
        conn.execute("UPDATE notifications SET status='SNOOZED',snoozed_until=?,read_at='' WHERE id=?", (until,notification_id))
        return dict(conn.execute("SELECT * FROM notifications WHERE id=?", (notification_id,)).fetchone())


@app.post("/api/notifications/test")
def test_notification() -> dict[str, Any]:
    event_key = f"test:{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    with db() as conn:
        cur = conn.execute("INSERT INTO notifications(event_key,title,body,priority,due_at,created_at) VALUES(?,?,?,?,?,?)",
                           (event_key,"🔔 Malù23 Cars","Notifiche attive: questo è un test del Notification Brain.","DA_FARE",now_iso(),now_iso()))
        n = dict(conn.execute("SELECT * FROM notifications WHERE id=?", (cur.lastrowid,)).fetchone())
        subs = [dict(r) for r in conn.execute("SELECT * FROM push_subscriptions").fetchall()]
    sent = 0
    for sub in subs:
        ok, _ = send_webpush(sub,{"title":n["title"],"body":n["body"],"notification_id":n["id"],"url":"/?view=today"})
        sent += 1 if ok else 0
    if sent:
        with db() as conn:
            conn.execute("UPDATE notifications SET sent_at=? WHERE id=?", (now_iso(),n["id"]))
    return {"notification": n, "push_sent": sent, "subscribers": len(subs)}


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    today = date.today()
    next7 = today + timedelta(days=7)
    with db() as conn:
        raw_tasks = conn.execute(
            """SELECT t.*, v.brand,v.model,v.plate,c.first_name,c.last_name
               FROM tasks t LEFT JOIN vehicles v ON v.id=t.vehicle_id
               LEFT JOIN clients c ON c.id=t.client_id
               WHERE t.completed=0 ORDER BY CASE t.priority WHEN 'URGENTE' THEN 0 WHEN 'IMPORTANTE' THEN 1 ELSE 2 END, t.due_date"""
        ).fetchall()
        tasks = []
        for r in raw_tasks:
            d = dict(r)
            d["priority"] = recalc_priority(d["due_date"], d["completed"], d["source"])
            tasks.append(d)
        today_tasks = [t for t in tasks if t["due_date"] <= today.isoformat() or not t["due_date"]]
        upcoming = [t for t in tasks if t["due_date"] and today.isoformat() < t["due_date"] <= next7.isoformat()]
        urgent = [t for t in tasks if t["priority"] == "URGENTE"]

        attention = []
        listings = conn.execute(
            "SELECT l.*,v.brand,v.model,v.plate,v.status FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE v.status='IN_VENDITA'"
        ).fetchall()
        for r in listings:
            d = dict(r)
            try:
                d["days_online"] = (today - date.fromisoformat(d["published_date"])).days if d["published_date"] else 0
            except Exception:
                d["days_online"] = 0
            if d["days_online"] >= 31:
                attention.append(d)
        work_attention = conn.execute(
            """SELECT v.id vehicle_id,v.brand,v.model,v.plate,COUNT(w.id) open_works
               FROM vehicles v JOIN works w ON w.vehicle_id=v.id AND w.completed=0
               GROUP BY v.id ORDER BY open_works DESC"""
        ).fetchall()
        return {
            "date": today.isoformat(),
            "urgent": urgent[:20],
            "today": today_tasks[:30],
            "upcoming": upcoming[:30],
            "stock_attention": attention[:20],
            "work_attention": [dict(r) for r in work_attention[:20]],
            "document_attention": [dict(r) for r in conn.execute(
                """SELECT d.*,v.brand,v.model,v.plate,c.first_name,c.last_name
                   FROM documents d LEFT JOIN vehicles v ON v.id=d.vehicle_id
                   LEFT JOIN clients c ON c.id=d.client_id
                   WHERE d.confirmed=0
                   ORDER BY d.created_at DESC LIMIT 20"""
            ).fetchall()],
            "document_actions": [dict(r) for r in conn.execute(
                """SELECT a.*,d.original_name,d.vehicle_id,d.client_id,v.brand,v.model,v.plate
                   FROM document_actions a JOIN documents d ON d.id=a.document_id
                   LEFT JOIN vehicles v ON v.id=d.vehicle_id
                   WHERE a.status='PENDING' ORDER BY a.created_at DESC LIMIT 20"""
            ).fetchall()],
            "summary": {
                "urgent": len(urgent),
                "callbacks": conn.execute("SELECT COUNT(*) c FROM tasks WHERE completed=0 AND source='cliente'").fetchone()["c"],
                "deliveries": conn.execute("SELECT COUNT(*) c FROM deliveries WHERE delivery_date BETWEEN ? AND ?", (today.isoformat(), next7.isoformat())).fetchone()["c"],
                "works": conn.execute("SELECT COUNT(*) c FROM works WHERE completed=0").fetchone()["c"],
                "to_photo": conn.execute("SELECT COUNT(*) c FROM vehicles WHERE status='DA_FOTOGRAFARE'").fetchone()["c"],
                "to_publish": conn.execute("SELECT COUNT(*) c FROM vehicles WHERE status='DA_PUBBLICARE'").fetchone()["c"],
                "aging60": sum(1 for x in attention if x.get("days_online", 0) >= 60),
                "documents_review": conn.execute("SELECT COUNT(*) c FROM documents WHERE confirmed=0").fetchone()["c"],
                "smart_actions": conn.execute("SELECT COUNT(*) c FROM document_actions WHERE status='PENDING'").fetchone()["c"],
            },
        }


@app.get("/api/vehicles")
def list_vehicles(search: str = "", status_filter: str = "") -> list[dict[str, Any]]:
    q = "SELECT * FROM vehicles WHERE 1=1"
    args: list[Any] = []
    if search:
        q += " AND (brand LIKE ? OR model LIKE ? OR plate LIKE ? OR vin LIKE ?)"
        s = f"%{search}%"
        args += [s, s, s, s]
    if status_filter:
        q += " AND status=?"
        args.append(status_filter)
    q += " ORDER BY updated_at DESC"
    with db() as conn:
        return [enrich_vehicle(conn, r) for r in conn.execute(q, args).fetchall()]


@app.post("/api/vehicles")
def create_vehicle(v: VehicleIn) -> dict[str, Any]:
    if v.status not in VEHICLE_STATES:
        raise HTTPException(400, "Stato non valido")
    plate, vin = validate_vehicle_identity(v.plate, v.vin)
    registration_date = validate_iso_date(v.registration_date, "Immatricolazione")
    purchase_price = validate_nonnegative(v.purchase_price, "Prezzo acquisto")
    expected_sale_price = validate_nonnegative(v.expected_sale_price, "Prezzo vendita previsto")
    try:
        with db() as conn:
            cur = conn.execute(
                """INSERT INTO vehicles(acquisition_type,brand,model,version,plate,vin,registration_date,fuel,engine_cc,transmission,mileage,color,purchase_price,expected_sale_price,status,notes,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (v.acquisition_type, v.brand.strip(), v.model.strip(), v.version.strip(), plate, vin, registration_date,
                 v.fuel, max(0, int(v.engine_cc or 0)), v.transmission, max(0, v.mileage), v.color, purchase_price, expected_sale_price, v.status, v.notes, now_iso(), now_iso())
            )
            vid = cur.lastrowid
            conn.execute("INSERT INTO status_history(vehicle_id,old_status,new_status,reason,created_at) VALUES(?,?,?,?,?)",
                         (vid, None, v.status, "Creazione veicolo", now_iso()))
            row = ensure_vehicle(conn, vid)
            return enrich_vehicle(conn, row)
    except sqlite3.IntegrityError as e:
        raise HTTPException(409, "Targa o telaio già presente") from e



STOCK_IMPORT_ALIASES = {
    "acquisition_type": {"acquisizione","tipo_acquisizione","acquisition_type","origine"},
    "brand": {"marca","brand","make"},
    "model": {"modello","model"},
    "version": {"versione","version","allestimento"},
    "plate": {"targa","plate"},
    "vin": {"vin","telaio","numero_telaio"},
    "registration_date": {"immatricolazione","data_immatricolazione","registration_date","prima_immatricolazione"},
    "fuel": {"alimentazione","fuel","carburante"},
    "engine_cc": {"cilindrata","engine_cc","cc"},
    "transmission": {"cambio","transmission"},
    "mileage": {"km","chilometri","mileage","kilometers"},
    "color": {"colore","color"},
    "purchase_price": {"prezzo_acquisto","costo_acquisto","purchase_price","acquisto"},
    "expected_sale_price": {"prezzo_vendita","prezzo","expected_sale_price","sale_price"},
    "status": {"stato","status"},
    "notes": {"note","notes"},
    "autoscout_url": {"autoscout_url","url_autoscout","link_autoscout","annuncio"},
    "published_date": {"data_pubblicazione","published_date","pubblicato_il"},
}
STOCK_IMPORT_LOOKUP = {alias: canonical for canonical, aliases in STOCK_IMPORT_ALIASES.items() for alias in aliases}

def _import_key(value: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", (value or "").strip().lower().replace("à","a").replace("è","e").replace("é","e").replace("ì","i").replace("ò","o").replace("ù","u")).strip("_")

def _csv_number(value: str, integer: bool = False) -> int | float:
    raw = (value or "").strip().replace("€","").replace(" ","")
    if not raw:
        return 0
    if "," in raw and "." in raw:
        # Italian 12.345,67 or international 12,345.67
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".","").replace(",",".")
        else:
            raw = raw.replace(",","")
    elif "," in raw:
        raw = raw.replace(",",".")
    try:
        n = float(raw)
    except ValueError as exc:
        raise ValueError(f"numero non valido: {value}") from exc
    return int(n) if integer else n

@app.get("/api/vehicles/import-template")
def vehicle_import_template() -> Response:
    header = ["marca","modello","versione","targa","vin","immatricolazione","alimentazione","cilindrata","cambio","km","colore","prezzo_acquisto","prezzo_vendita","stato","url_autoscout","data_pubblicazione","note"]
    sample = ["BMW","X1","sDrive18d","AB123CD","","2022-05-12","Diesel","1995","Automatico","54000","Nero","18500","22900","IN_VENDITA","https://www.autoscout24.it/annunci/esempio","2026-09-20",""]
    buf=io.StringIO()
    writer=csv.writer(buf,delimiter=";")
    writer.writerow(header); writer.writerow(sample)
    return Response(content="\ufeff"+buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="MALU23_CARS_import_stock.csv"'})

@app.post("/api/vehicles/import-csv")
async def import_vehicles_csv(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(422, "Il file CSV è vuoto")
    if len(content) > 2_000_000:
        raise HTTPException(413, "CSV troppo grande: massimo 2 MB")
    decoded = None
    for enc in ("utf-8-sig","utf-8","cp1252"):
        try:
            decoded = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if decoded is None:
        raise HTTPException(422, "Codifica CSV non riconosciuta")
    try:
        dialect = csv.Sniffer().sniff(decoded[:4096], delimiters=";,")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";"
    rows = list(csv.DictReader(io.StringIO(decoded), dialect=dialect))
    if not rows:
        raise HTTPException(422, "Il CSV non contiene righe dati")
    if len(rows) > 500:
        raise HTTPException(413, "Massimo 500 veicoli per importazione")
    normalized_headers = {_import_key(k): v for k, v in (rows[0] or {}).items()}  # only used to force fieldnames validation
    fieldnames = [f for f in (csv.DictReader(io.StringIO(decoded), dialect=dialect).fieldnames or []) if f]
    canonical_headers = {STOCK_IMPORT_LOOKUP.get(_import_key(f), "") for f in fieldnames}
    if "brand" not in canonical_headers or "model" not in canonical_headers:
        raise HTTPException(422, "Servono almeno le colonne marca e modello")

    imported, skipped, errors = [], [], []
    for idx, rawrow in enumerate(rows, start=2):
        row: dict[str,str] = {}
        for key, value in rawrow.items():
            canonical = STOCK_IMPORT_LOOKUP.get(_import_key(key or ""))
            if canonical:
                row[canonical] = (value or "").strip()
        if not any(row.values()):
            continue
        try:
            status = (row.get("status") or "DA_CONTROLLARE").upper().replace(" ","_")
            if status not in VEHICLE_STATES:
                raise ValueError(f"stato non valido: {status}")
            plate = normalize_plate(row.get("plate",""))
            vin = re.sub(r"[^A-HJ-NPR-Z0-9]","",(row.get("vin","") or "").upper())
            with db() as conn:
                duplicate = None
                if plate:
                    duplicate = conn.execute("SELECT id,brand,model,plate,vin FROM vehicles WHERE plate=?", (plate,)).fetchone()
                if not duplicate and vin:
                    duplicate = conn.execute("SELECT id,brand,model,plate,vin FROM vehicles WHERE vin=?", (vin,)).fetchone()
            if duplicate:
                skipped.append({"row":idx,"reason":"già presente","vehicle_id":duplicate["id"],"label":f"{duplicate['brand']} {duplicate['model']} {duplicate['plate']}".strip()})
                continue
            payload = VehicleIn(
                acquisition_type=row.get("acquisition_type") or "acquisto",
                brand=row.get("brand",""),
                model=row.get("model",""),
                version=row.get("version",""),
                plate=plate,
                vin=vin,
                registration_date=row.get("registration_date",""),
                fuel=row.get("fuel",""),
                engine_cc=_csv_number(row.get("engine_cc",""), integer=True),
                transmission=row.get("transmission",""),
                mileage=_csv_number(row.get("mileage",""), integer=True),
                color=row.get("color",""),
                purchase_price=_csv_number(row.get("purchase_price","")),
                expected_sale_price=_csv_number(row.get("expected_sale_price","")),
                status=status,
                notes=row.get("notes",""),
            )
            if not payload.brand.strip() or not payload.model.strip():
                raise ValueError("marca e modello obbligatori")
            vehicle = create_vehicle(payload)
            if row.get("autoscout_url"):
                published = validate_iso_date(row.get("published_date",""), "Data pubblicazione")
                with db() as conn:
                    conn.execute(
                        """INSERT INTO listings(vehicle_id,url,published_date,initial_price,current_price,title,description,updated_at)
                           VALUES(?,?,?,?,?,?,?,?)
                           ON CONFLICT(vehicle_id) DO UPDATE SET url=excluded.url,published_date=excluded.published_date,
                           current_price=excluded.current_price,updated_at=excluded.updated_at""",
                        (vehicle["id"],row["autoscout_url"],published,payload.expected_sale_price,payload.expected_sale_price,
                         f"{payload.brand} {payload.model} {payload.version}".strip(),"",now_iso())
                    )
            imported.append({"row":idx,"vehicle_id":vehicle["id"],"label":vehicle_label(vehicle)})
        except HTTPException as exc:
            errors.append({"row":idx,"error":str(exc.detail)})
        except (ValueError, TypeError) as exc:
            errors.append({"row":idx,"error":str(exc)})
    return {"imported":imported,"skipped":skipped,"errors":errors,"summary":{"imported":len(imported),"skipped":len(skipped),"errors":len(errors)}}


@app.get("/api/finance")
def finance_summary() -> dict[str, Any]:
    """Single-source economic view: sales and costs always come from vehicle records."""
    with db() as conn:
        vehicles = [enrich_vehicle(conn, r) for r in conn.execute("SELECT * FROM vehicles ORDER BY updated_at DESC,id DESC").fetchall()]
        sold, stock = [], []
        for v in vehicles:
            total = float(v.get("total_invested") or 0)
            sale_price = float(v.get("sale_price") or 0)
            expected = float(v.get("expected_sale_price") or 0)
            if sale_price > 0 or v.get("status") in {"VENDUTA", "CONSEGNATA"}:
                v["realized_margin"] = round(sale_price - total, 2) if sale_price else None
                v["margin_percent"] = round((v["realized_margin"] / total) * 100, 1) if total and v["realized_margin"] is not None else None
                sold.append(v)
            else:
                v["projected_margin"] = round(expected - total, 2) if expected else None
                v["margin_percent"] = round((v["projected_margin"] / total) * 100, 1) if total and v["projected_margin"] is not None else None
                stock.append(v)
        categories = [dict(r) for r in conn.execute(
            "SELECT category,ROUND(SUM(amount),2) amount,COUNT(*) count FROM expenses GROUP BY category ORDER BY amount DESC"
        ).fetchall()]
        transactions: list[dict[str, Any]] = []
        for r in conn.execute("""SELECT e.id,e.created_at,e.expense_date date,e.amount,e.category label,
                 COALESCE(NULLIF(e.supplier,''),e.description) detail,v.id vehicle_id,v.brand,v.model,v.plate
                 FROM expenses e JOIN vehicles v ON v.id=e.vehicle_id ORDER BY e.created_at DESC LIMIT 30""").fetchall():
            transactions.append({**dict(r), "type": "expense"})
        for r in conn.execute("""SELECT c.id,c.created_at,substr(c.created_at,1,10) date,c.sale_price amount,
                 'Vendita' label,'' detail,v.id vehicle_id,v.brand,v.model,v.plate
                 FROM contracts c JOIN vehicles v ON v.id=c.vehicle_id ORDER BY c.created_at DESC LIMIT 30""").fetchall():
            transactions.append({**dict(r), "type": "sale"})
        for r in conn.execute("""SELECT w.id,w.created_at,substr(w.created_at,1,10) date,w.actual_cost amount,
                 w.category label,w.provider detail,v.id vehicle_id,v.brand,v.model,v.plate
                 FROM works w JOIN vehicles v ON v.id=w.vehicle_id WHERE w.actual_cost>0
                 ORDER BY w.created_at DESC LIMIT 30""").fetchall():
            transactions.append({**dict(r), "type": "work"})
        transactions.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
        return {
            "summary": {
                "realized_margin": round(sum(float(v.get("realized_margin") or 0) for v in sold), 2),
                "realized_revenue": round(sum(float(v.get("sale_price") or 0) for v in sold), 2),
                "sold_count": len(sold),
                "stock_invested": round(sum(float(v.get("total_invested") or 0) for v in stock), 2),
                "projected_margin": round(sum(float(v.get("projected_margin") or 0) for v in stock), 2),
                "expenses": round(float(conn.execute("SELECT COALESCE(SUM(amount),0) s FROM expenses").fetchone()["s"] or 0), 2),
                "works": round(float(conn.execute("SELECT COALESCE(SUM(actual_cost),0) s FROM works").fetchone()["s"] or 0), 2),
            },
            "sold": sold,
            "stock": stock,
            "expense_categories": categories,
            "recent_transactions": transactions[:40],
        }


@app.get("/api/vehicles/{vehicle_id}")
def get_vehicle(vehicle_id: int) -> dict[str, Any]:
    with db() as conn:
        v = ensure_vehicle(conn, vehicle_id)
        data = enrich_vehicle(conn, v)
        data["works"] = [dict(x) for x in conn.execute("SELECT * FROM works WHERE vehicle_id=? ORDER BY completed,due_date", (vehicle_id,)).fetchall()]
        data["expenses"] = [dict(x) for x in conn.execute("SELECT * FROM expenses WHERE vehicle_id=? ORDER BY expense_date DESC", (vehicle_id,)).fetchall()]
        data["tasks"] = [dict(x) for x in conn.execute("SELECT * FROM tasks WHERE vehicle_id=? ORDER BY completed,due_date", (vehicle_id,)).fetchall()]
        data["documents"] = [dict(x) for x in conn.execute("SELECT * FROM documents WHERE vehicle_id=? ORDER BY created_at DESC", (vehicle_id,)).fetchall()]
        data["photos"] = [dict(x) for x in conn.execute("SELECT * FROM photos WHERE vehicle_id=? ORDER BY id", (vehicle_id,)).fetchall()]
        data["delivery"] = dict(x) if (x := conn.execute("SELECT * FROM deliveries WHERE vehicle_id=?", (vehicle_id,)).fetchone()) else None
        data["delivery_items"] = [dict(x) for x in conn.execute("SELECT * FROM delivery_items WHERE vehicle_id=? ORDER BY phase_days_before DESC,id", (vehicle_id,)).fetchall()]
        data["listing"] = dict(x) if (x := conn.execute("SELECT * FROM listings WHERE vehicle_id=?", (vehicle_id,)).fetchone()) else None
        data["status_history"] = [dict(x) for x in conn.execute("SELECT * FROM status_history WHERE vehicle_id=? ORDER BY id DESC", (vehicle_id,)).fetchall()]
        cats = {x["category"] for x in data["photos"]}
        data["photo_checklist"] = [{"category": c, "done": c in cats} for c in PHOTO_REQUIRED]
        return data


@app.put("/api/vehicles/{vehicle_id}")
def update_vehicle(vehicle_id: int, v: VehicleIn) -> dict[str, Any]:
    if v.status not in VEHICLE_STATES:
        raise HTTPException(400, "Stato non valido")
    plate, vin = validate_vehicle_identity(v.plate, v.vin)
    registration_date = validate_iso_date(v.registration_date, "Immatricolazione")
    purchase_price = validate_nonnegative(v.purchase_price, "Prezzo acquisto")
    expected_sale_price = validate_nonnegative(v.expected_sale_price, "Prezzo vendita previsto")
    with db() as conn:
        ensure_vehicle(conn, vehicle_id)
        try:
            conn.execute(
                """UPDATE vehicles SET acquisition_type=?,brand=?,model=?,version=?,plate=?,vin=?,registration_date=?,fuel=?,engine_cc=?,transmission=?,mileage=?,color=?,purchase_price=?,expected_sale_price=?,notes=?,updated_at=? WHERE id=?""",
                (v.acquisition_type,v.brand.strip(),v.model.strip(),v.version.strip(),plate,vin,registration_date,v.fuel,max(0,int(v.engine_cc or 0)),v.transmission,max(0,v.mileage),v.color,purchase_price,expected_sale_price,v.notes,now_iso(),vehicle_id)
            )
        except sqlite3.IntegrityError as e:
            raise HTTPException(409, "Targa o telaio già presente") from e
        set_status(conn, vehicle_id, v.status, "Modifica manuale")
        return enrich_vehicle(conn, ensure_vehicle(conn, vehicle_id))


@app.post("/api/vehicles/{vehicle_id}/status/{new_status}")
def change_status(vehicle_id: int, new_status: str) -> dict[str, Any]:
    with db() as conn:
        set_status(conn, vehicle_id, new_status, "Cambio stato manuale")
        return enrich_vehicle(conn, ensure_vehicle(conn, vehicle_id))


@app.post("/api/vehicles/{vehicle_id}/works")
def add_work(vehicle_id: int, w: WorkIn) -> dict[str, Any]:
    if not w.title.strip():
        raise HTTPException(422, "Inserisci il lavoro da eseguire")
    due_date = validate_iso_date(w.due_date, "Scadenza lavoro")
    expected_cost = validate_nonnegative(w.expected_cost, "Costo previsto")
    actual_cost = validate_nonnegative(w.actual_cost, "Costo reale")
    with db() as conn:
        v = ensure_vehicle(conn, vehicle_id)
        cur = conn.execute(
            "INSERT INTO works(vehicle_id,category,title,due_date,provider,expected_cost,actual_cost,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (vehicle_id,w.category,w.title.strip(),due_date,w.provider,expected_cost,actual_cost,w.notes,now_iso())
        )
        work_id = cur.lastrowid
        if v["status"] in ("IN_ARRIVO", "DA_CONTROLLARE"):
            set_status(conn, vehicle_id, "IN_PREPARAZIONE", "Lavoro aggiunto")
        # Every work is an activity, even when no due date has been chosen yet.
        conn.execute("INSERT INTO tasks(vehicle_id,work_id,title,description,due_date,priority,source,created_at) VALUES(?,?,?,?,?,?,?,?)",
                     (vehicle_id, work_id, w.title.strip(), w.notes, due_date, recalc_priority(due_date,0), "lavoro", now_iso()))
        return dict(conn.execute("SELECT * FROM works WHERE id=?", (work_id,)).fetchone())


@app.post("/api/works/{work_id}/complete")
def complete_work(work_id: int, actual_cost: float = 0) -> dict[str, Any]:
    actual_cost = validate_nonnegative(actual_cost, "Costo reale")
    with db() as conn:
        w = conn.execute("SELECT * FROM works WHERE id=?", (work_id,)).fetchone()
        if not w:
            raise HTTPException(404, "Lavoro non trovato")
        final_cost = actual_cost if actual_cost else w["actual_cost"]
        conn.execute("UPDATE works SET completed=1,completed_at=?,actual_cost=? WHERE id=?", (now_iso(),final_cost,work_id))
        conn.execute("UPDATE tasks SET completed=1,completed_at=?,priority='COMPLETATO' WHERE work_id=? AND source='lavoro' AND completed=0", (now_iso(), work_id))
        conn.execute("UPDATE notifications SET status='READ',read_at=? WHERE task_id IN (SELECT id FROM tasks WHERE work_id=?) AND status<>'READ'", (now_iso(), work_id))
        open_count = conn.execute("SELECT COUNT(*) c FROM works WHERE vehicle_id=? AND completed=0", (w["vehicle_id"],)).fetchone()["c"]
        if open_count == 0:
            v = ensure_vehicle(conn, w["vehicle_id"])
            if v["status"] in ("DA_CONTROLLARE", "IN_PREPARAZIONE"):
                set_status(conn, w["vehicle_id"], "DA_FOTOGRAFARE", "Tutti i lavori completati")
        return dict(conn.execute("SELECT * FROM works WHERE id=?", (work_id,)).fetchone())


@app.post("/api/vehicles/{vehicle_id}/expenses")
def add_expense(vehicle_id: int, e: ExpenseIn) -> dict[str, Any]:
    amount = validate_nonnegative(e.amount, "Importo")
    dt = validate_iso_date(e.expense_date or date.today().isoformat(), "Data spesa", allow_empty=False)
    with db() as conn:
        ensure_vehicle(conn, vehicle_id)
        if e.source_document_id is not None:
            doc = conn.execute("SELECT id,vehicle_id FROM documents WHERE id=?", (e.source_document_id,)).fetchone()
            if not doc:
                raise HTTPException(404, "Documento sorgente non trovato")
            if doc["vehicle_id"] not in {None, vehicle_id}:
                raise HTTPException(409, "Il documento appartiene a un'altra auto")
        cur = conn.execute(
            """INSERT INTO expenses(vehicle_id,category,description,supplier,amount,expense_date,source_document_id,source,created_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (vehicle_id,e.category.strip(),e.description.strip(),e.supplier.strip(),amount,dt,
             e.source_document_id,(e.source or "manuale").strip().lower(),now_iso()))
        if e.source_document_id is not None:
            conn.execute("UPDATE documents SET vehicle_id=?,confirmed=1,review_reason='' WHERE id=?", (vehicle_id,e.source_document_id))
        return {"expense": dict(conn.execute("SELECT * FROM expenses WHERE id=?", (cur.lastrowid,)).fetchone()), "total_invested": vehicle_total(conn, vehicle_id)}


@app.get("/api/tasks")
def get_tasks(show_completed: bool = False) -> list[dict[str, Any]]:
    with db() as conn:
        q = """SELECT t.*,v.brand,v.model,v.plate,c.first_name,c.last_name FROM tasks t
               LEFT JOIN vehicles v ON v.id=t.vehicle_id LEFT JOIN clients c ON c.id=t.client_id"""
        if not show_completed:
            q += " WHERE t.completed=0"
        q += " ORDER BY t.completed, t.due_date"
        out=[]
        for r in conn.execute(q).fetchall():
            d=dict(r); d["priority"]=recalc_priority(d["due_date"],d["completed"],d["source"]); out.append(d)
        return out


@app.post("/api/tasks")
def add_task(t: TaskIn) -> dict[str, Any]:
    if not t.title.strip():
        raise HTTPException(422, "Inserisci il titolo dell’attività")
    due_date = validate_iso_date(t.due_date, "Data attività")
    with db() as conn:
        if t.vehicle_id is not None: ensure_vehicle(conn, t.vehicle_id)
        if t.client_id is not None and not conn.execute("SELECT 1 FROM clients WHERE id=?", (t.client_id,)).fetchone():
            raise HTTPException(404, "Cliente non trovato")
        priority = recalc_priority(due_date,0) if t.priority == "DA_FARE" else t.priority
        cur = conn.execute("INSERT INTO tasks(vehicle_id,client_id,title,description,due_date,due_time,reminder_minutes,priority,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                           (t.vehicle_id,t.client_id,t.title.strip(),t.description,due_date,t.due_time,max(0,int(t.reminder_minutes or 0)),priority,t.source,now_iso()))
        return dict(conn.execute("SELECT * FROM tasks WHERE id=?",(cur.lastrowid,)).fetchone())


@app.post("/api/tasks/{task_id}/complete")
def complete_task(task_id:int) -> dict[str,Any]:
    with db() as conn:
        task = conn.execute("SELECT * FROM tasks WHERE id=?",(task_id,)).fetchone()
        if not task:
            raise HTTPException(404,"Attività non trovata")
        if task["source"] == "delivery" and task["delivery_phase"] is not None:
            conn.execute(
                "UPDATE delivery_items SET completed=1,completed_at=? WHERE vehicle_id=? AND phase_days_before=?",
                (now_iso(), task["vehicle_id"], task["delivery_phase"]),
            )
            sync_delivery_phase(conn, task["vehicle_id"], int(task["delivery_phase"]))
        else:
            conn.execute("UPDATE tasks SET completed=1,completed_at=?,priority='COMPLETATO' WHERE id=?",(now_iso(),task_id))
        conn.execute("UPDATE notifications SET status='READ',read_at=? WHERE task_id=? AND status<>'READ'", (now_iso(),task_id))
        return dict(conn.execute("SELECT * FROM tasks WHERE id=?",(task_id,)).fetchone())


@app.put("/api/tasks/{task_id}")
def update_task(task_id: int, t: TaskIn) -> dict[str, Any]:
    if not t.title.strip():
        raise HTTPException(422, "Inserisci il titolo dell’attività")
    due_date = validate_iso_date(t.due_date, "Data attività")
    with db() as conn:
        current = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if not current:
            raise HTTPException(404, "Attività non trovata")
        if current["source"] != "manuale":
            raise HTTPException(409, "Questa attività è generata automaticamente: modificala dalla funzione che l’ha creata")
        if t.vehicle_id is not None:
            ensure_vehicle(conn, t.vehicle_id)
        if t.client_id is not None and not conn.execute("SELECT 1 FROM clients WHERE id=?", (t.client_id,)).fetchone():
            raise HTTPException(404, "Cliente non trovato")
        priority = recalc_priority(due_date, current["completed"], "manuale")
        conn.execute(
            """UPDATE tasks SET vehicle_id=?,client_id=?,title=?,description=?,due_date=?,due_time=?,reminder_minutes=?,priority=?
               WHERE id=?""",
            (t.vehicle_id, t.client_id, t.title.strip(), t.description, due_date, t.due_time, max(0,int(t.reminder_minutes or 0)), priority, task_id),
        )
        return dict(conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone())


@app.get("/api/clients")
def list_clients() -> list[dict[str,Any]]:
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT c.*,v.brand,v.model,v.plate FROM clients c LEFT JOIN vehicles v ON v.id=c.interested_vehicle_id ORDER BY c.id DESC").fetchall()]


@app.post("/api/clients")
def create_client(c: ClientIn) -> dict[str,Any]:
    if not c.first_name.strip():
        raise HTTPException(422, "Inserisci il nome del cliente")
    next_contact_date = validate_iso_date(c.next_contact_date, "Data richiamo")
    offer = validate_nonnegative(c.offer, "Offerta")
    with db() as conn:
        if c.interested_vehicle_id is not None: ensure_vehicle(conn, c.interested_vehicle_id)
        reminder=max(0,int(c.reminder_minutes or 0))
        cur=conn.execute("""INSERT INTO clients(first_name,last_name,phone,email,fiscal_code,address,interested_vehicle_id,tradein_notes,offer,status,last_contact,next_step,next_contact_date,next_contact_time,reminder_minutes,notes,created_at)
                            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                         (c.first_name.strip(),c.last_name,c.phone,c.email,c.fiscal_code.upper(),c.address,c.interested_vehicle_id,c.tradein_notes,offer,c.status,c.last_contact,
                          "" if c.status in {"CHIUSO","PERSO"} else c.next_step,
                          "" if c.status in {"CHIUSO","PERSO"} else next_contact_date,
                          "" if c.status in {"CHIUSO","PERSO"} else c.next_contact_time,
                          reminder,c.notes,now_iso()))
        cid=cur.lastrowid
        if next_contact_date and c.status not in {"CHIUSO","PERSO"}:
            conn.execute("INSERT INTO tasks(client_id,vehicle_id,title,description,due_date,due_time,reminder_minutes,priority,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                         (cid,c.interested_vehicle_id,f"Richiamare {c.first_name} {c.last_name}".strip(),c.next_step,next_contact_date,c.next_contact_time,reminder,recalc_priority(next_contact_date,0),"cliente",now_iso()))
        return dict(conn.execute("SELECT * FROM clients WHERE id=?",(cid,)).fetchone())


@app.put("/api/clients/{client_id}")
def update_client(client_id: int, c: ClientIn) -> dict[str, Any]:
    if not c.first_name.strip():
        raise HTTPException(422, "Inserisci il nome del cliente")
    next_contact_date = validate_iso_date(c.next_contact_date, "Data richiamo")
    offer = validate_nonnegative(c.offer, "Offerta")
    with db() as conn:
        if not conn.execute("SELECT 1 FROM clients WHERE id=?", (client_id,)).fetchone():
            raise HTTPException(404, "Cliente non trovato")
        if c.interested_vehicle_id is not None:
            ensure_vehicle(conn, c.interested_vehicle_id)
        reminder=max(0,int(c.reminder_minutes or 0))
        conn.execute(
            """UPDATE clients SET first_name=?,last_name=?,phone=?,email=?,fiscal_code=?,address=?,
               interested_vehicle_id=?,tradein_notes=?,offer=?,status=?,last_contact=?,next_step=?,next_contact_date=?,next_contact_time=?,reminder_minutes=?,notes=?
               WHERE id=?""",
            (c.first_name.strip(), c.last_name, c.phone, c.email, c.fiscal_code.upper(), c.address,
             c.interested_vehicle_id, c.tradein_notes, offer, c.status, c.last_contact, c.next_step,
             "" if c.status in {"CHIUSO","PERSO"} else next_contact_date,
             "" if c.status in {"CHIUSO","PERSO"} else c.next_contact_time,
             reminder, c.notes, client_id),
        )
        # Keep exactly one current automatic callback for this client.
        conn.execute("DELETE FROM tasks WHERE client_id=? AND source='cliente' AND completed=0", (client_id,))
        if next_contact_date and c.status not in {"CHIUSO","PERSO"}:
            conn.execute(
                "INSERT INTO tasks(client_id,vehicle_id,title,description,due_date,due_time,reminder_minutes,priority,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (client_id, c.interested_vehicle_id, f"Richiamare {c.first_name} {c.last_name}".strip(), c.next_step,
                 next_contact_date, c.next_contact_time, reminder, recalc_priority(next_contact_date, 0), "cliente", now_iso()),
            )
        return dict(conn.execute("SELECT * FROM clients WHERE id=?", (client_id,)).fetchone())



CLIENT_ACTIONS = {"CHIAMATO","NON_RISPONDE","DA_RICHIAMARE","APPUNTAMENTO","INTERESSATO","TRATTATIVA","CHIUSO","PERSO"}

@app.post("/api/clients/{client_id}/callback")
def schedule_client_callback(client_id: int, callback: ClientCallbackIn) -> dict[str,Any]:
    due_date=validate_iso_date(callback.due_date,"Data richiamo",allow_empty=False)
    due_time=(callback.due_time or "").strip()
    if due_time and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", due_time):
        raise HTTPException(422,"Ora richiamo non valida")
    reminder=max(0,min(10080,int(callback.reminder_minutes or 0)))
    next_step=(callback.next_step or "Richiamare cliente").strip()
    with db() as conn:
        client=conn.execute("SELECT * FROM clients WHERE id=?",(client_id,)).fetchone()
        if not client:
            raise HTTPException(404,"Cliente non trovato")
        if client["status"] in {"CHIUSO","PERSO"}:
            raise HTTPException(409,"La trattativa è chiusa: riaprila prima di programmare un richiamo")
        conn.execute("DELETE FROM tasks WHERE client_id=? AND source='cliente' AND completed=0",(client_id,))
        conn.execute(
            "UPDATE clients SET status='DA_RICHIAMARE',next_step=?,next_contact_date=?,next_contact_time=?,reminder_minutes=? WHERE id=?",
            (next_step,due_date,due_time,reminder,client_id)
        )
        cur=conn.execute(
            "INSERT INTO tasks(client_id,vehicle_id,title,description,due_date,due_time,reminder_minutes,priority,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (client_id,client["interested_vehicle_id"],f"Richiamare {client['first_name']} {client['last_name']}".strip(),
             next_step,due_date,due_time,reminder,recalc_priority(due_date,0),"cliente",now_iso())
        )
        return {"client":dict(conn.execute("SELECT * FROM clients WHERE id=?",(client_id,)).fetchone()),
                "task":dict(conn.execute("SELECT * FROM tasks WHERE id=?",(cur.lastrowid,)).fetchone())}


@app.get("/api/clients/{client_id}/interactions")
def client_interactions(client_id: int) -> list[dict[str,Any]]:
    with db() as conn:
        if not conn.execute("SELECT 1 FROM clients WHERE id=?", (client_id,)).fetchone():
            raise HTTPException(404, "Cliente non trovato")
        return [dict(r) for r in conn.execute(
            "SELECT * FROM client_interactions WHERE client_id=? ORDER BY happened_at DESC,id DESC", (client_id,)
        ).fetchall()]

@app.post("/api/clients/{client_id}/interactions")
def add_client_interaction(client_id: int, interaction: ClientInteractionIn) -> dict[str,Any]:
    action=(interaction.action or "").strip().upper().replace(" ","_")
    if action not in CLIENT_ACTIONS:
        raise HTTPException(422, "Azione cliente non valida")
    happened=(interaction.happened_at or now_iso()).strip()
    try:
        happened_dt=datetime.fromisoformat(happened.replace("Z","+00:00"))
    except ValueError as exc:
        raise HTTPException(422, "Data/ora contatto non valida") from exc
    happened_iso=happened_dt.isoformat(timespec="seconds")
    contact_day=happened_dt.date().isoformat()
    with db() as conn:
        client=conn.execute("SELECT * FROM clients WHERE id=?", (client_id,)).fetchone()
        if not client:
            raise HTTPException(404, "Cliente non trovato")
        cur=conn.execute(
            "INSERT INTO client_interactions(client_id,action,note,happened_at,created_at) VALUES(?,?,?,?,?)",
            (client_id,action,(interaction.note or "").strip(),happened_iso,now_iso())
        )
        conn.execute("UPDATE clients SET status=?,last_contact=? WHERE id=?", (action,contact_day,client_id))
        if action in {"CHIUSO","PERSO"}:
            # Terminal CRM states must not leave stale callbacks/notifications behind.
            open_task_ids=[r["id"] for r in conn.execute(
                "SELECT id FROM tasks WHERE client_id=? AND source='cliente' AND completed=0", (client_id,)
            ).fetchall()]
            if open_task_ids:
                conn.execute(
                    "UPDATE tasks SET completed=1,completed_at=?,priority='COMPLETATO' WHERE client_id=? AND source='cliente' AND completed=0",
                    (now_iso(),client_id)
                )
                conn.execute(
                    "UPDATE notifications SET status='READ',read_at=? WHERE client_id=? AND status<>'READ'",
                    (now_iso(),client_id)
                )
            conn.execute("UPDATE clients SET next_contact_date='',next_contact_time='',next_step='' WHERE id=?", (client_id,))
        row=dict(conn.execute("SELECT * FROM client_interactions WHERE id=?", (cur.lastrowid,)).fetchone())
        updated=dict(conn.execute("SELECT * FROM clients WHERE id=?", (client_id,)).fetchone())
        return {"interaction":row,"client":updated}

@app.post("/api/vehicles/{vehicle_id}/delivery")
def set_delivery(vehicle_id:int, d:DeliveryIn) -> dict[str,Any]:
    delivery_date = validate_iso_date(d.delivery_date, "Data consegna", allow_empty=False)
    if delivery_date < date.today().isoformat():
        raise HTTPException(422, "La consegna non può essere nel passato")
    with db() as conn:
        v=ensure_vehicle(conn,vehicle_id)
        conn.execute("""INSERT INTO deliveries(vehicle_id,delivery_date,delivery_time,notes,created_at,updated_at) VALUES(?,?,?,?,?,?)
                        ON CONFLICT(vehicle_id) DO UPDATE SET delivery_date=excluded.delivery_date,delivery_time=excluded.delivery_time,notes=excluded.notes,updated_at=excluded.updated_at""",
                     (vehicle_id,delivery_date,d.delivery_time,d.notes,now_iso(),now_iso()))
        delivery = conn.execute("SELECT * FROM deliveries WHERE vehicle_id=?", (vehicle_id,)).fetchone()
        # Timeline tasks are regenerated from the checklist state to avoid duplicates after rescheduling.
        conn.execute("DELETE FROM tasks WHERE vehicle_id=? AND source='delivery'",(vehicle_id,))
        delivery_day=date.fromisoformat(delivery_date)
        schedule={
            7:"Controllo preliminare consegna",
            5:"Preparazione consegna",
            3:"Controllo documenti e saldo",
            1:"Controllo finale consegna",
            0:f"CONSEGNA {vehicle_label(v)}"
        }
        for days_before,title in schedule.items():
            due=(delivery_day-timedelta(days=days_before)).isoformat()
            conn.execute("INSERT INTO tasks(vehicle_id,title,description,due_date,due_time,priority,source,delivery_phase,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                         (vehicle_id,title,d.notes,due,d.delivery_time if days_before==0 else "",recalc_priority(due,0),"delivery",days_before,now_iso()))
            for code,label in DELIVERY_CHECKLISTS[days_before]:
                conn.execute(
                    """INSERT INTO delivery_items(delivery_id,vehicle_id,phase_days_before,code,label,created_at)
                       VALUES(?,?,?,?,?,?)
                       ON CONFLICT(delivery_id,code) DO UPDATE SET phase_days_before=excluded.phase_days_before,label=excluded.label""",
                    (delivery["id"],vehicle_id,days_before,code,label,now_iso()),
                )
        valid_codes = [code for rows in DELIVERY_CHECKLISTS.values() for code, _ in rows]
        placeholders = ",".join("?" for _ in valid_codes)
        conn.execute(
            f"DELETE FROM delivery_items WHERE delivery_id=? AND code NOT IN ({placeholders})",
            [delivery["id"], *valid_codes],
        )
        for phase in DELIVERY_CHECKLISTS:
            sync_delivery_phase(conn, vehicle_id, phase)
        if v["status"] in ("VENDUTA","PRENOTATA"):
            set_status(conn,vehicle_id,"DA_CONSEGNARE","Consegna programmata")
        return dict(delivery)


def sync_delivery_phase(conn: sqlite3.Connection, vehicle_id: int, phase: int) -> None:
    total = conn.execute(
        "SELECT COUNT(*) c FROM delivery_items WHERE vehicle_id=? AND phase_days_before=?",
        (vehicle_id, phase),
    ).fetchone()["c"]
    completed = conn.execute(
        "SELECT COUNT(*) c FROM delivery_items WHERE vehicle_id=? AND phase_days_before=? AND completed=1",
        (vehicle_id, phase),
    ).fetchone()["c"]
    done = bool(total and total == completed)
    if done:
        conn.execute(
            "UPDATE tasks SET completed=1,completed_at=?,priority='COMPLETATO' WHERE vehicle_id=? AND source='delivery' AND delivery_phase=? AND completed=0",
            (now_iso(), vehicle_id, phase),
        )
        if phase == 0:
            v = ensure_vehicle(conn, vehicle_id)
            if v["status"] == "DA_CONSEGNARE":
                set_status(conn, vehicle_id, "CONSEGNATA", "Checklist consegna completata")
    else:
        task = conn.execute(
            "SELECT id,due_date FROM tasks WHERE vehicle_id=? AND source='delivery' AND delivery_phase=? ORDER BY id DESC LIMIT 1",
            (vehicle_id, phase),
        ).fetchone()
        if task:
            conn.execute(
                "UPDATE tasks SET completed=0,completed_at='',priority=? WHERE id=?",
                (recalc_priority(task["due_date"], 0, "delivery"), task["id"]),
            )
        if phase == 0:
            v = ensure_vehicle(conn, vehicle_id)
            if v["status"] == "CONSEGNATA":
                set_status(conn, vehicle_id, "DA_CONSEGNARE", "Checklist consegna riaperta")


@app.post("/api/delivery-items/{item_id}/toggle")
def toggle_delivery_item(item_id: int) -> dict[str, Any]:
    with db() as conn:
        item = conn.execute("SELECT * FROM delivery_items WHERE id=?", (item_id,)).fetchone()
        if not item:
            raise HTTPException(404, "Controllo consegna non trovato")
        new_value = 0 if item["completed"] else 1
        conn.execute(
            "UPDATE delivery_items SET completed=?,completed_at=? WHERE id=?",
            (new_value, now_iso() if new_value else "", item_id),
        )
        sync_delivery_phase(conn, item["vehicle_id"], item["phase_days_before"])
        return dict(conn.execute("SELECT * FROM delivery_items WHERE id=?", (item_id,)).fetchone())


@app.post("/api/delivery/{vehicle_id}/phase/{phase}/complete")
def complete_delivery_phase(vehicle_id: int, phase: int) -> dict[str, Any]:
    if phase not in DELIVERY_CHECKLISTS:
        raise HTTPException(422, "Fase consegna non valida")
    with db() as conn:
        ensure_vehicle(conn, vehicle_id)
        rows = conn.execute(
            "SELECT id FROM delivery_items WHERE vehicle_id=? AND phase_days_before=?",
            (vehicle_id, phase),
        ).fetchall()
        if not rows:
            raise HTTPException(404, "Checklist consegna non generata")
        conn.execute(
            "UPDATE delivery_items SET completed=1,completed_at=? WHERE vehicle_id=? AND phase_days_before=?",
            (now_iso(), vehicle_id, phase),
        )
        sync_delivery_phase(conn, vehicle_id, phase)
        return {"ok": True, "phase": phase, "completed": len(rows)}


def tesseract_languages() -> list[str]:
    try:
        return sorted(set(pytesseract.get_languages(config="")))
    except Exception:
        return []


def preferred_ocr_language() -> str:
    langs = set(tesseract_languages())
    if {"ita", "eng"}.issubset(langs):
        return "ita+eng"
    if "ita" in langs:
        return "ita"
    return "eng"


def prepare_ocr_image(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert("RGB")
    # Registration certificates are text-heavy: upscale small captures before OCR.
    min_side = min(img.size)
    if min_side < 1400:
        scale = min(3.0, 1400 / max(1, min_side))
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    gray = ImageOps.grayscale(img)
    return ImageOps.autocontrast(gray)


def best_ocr_text(img: Image.Image) -> tuple[str, dict[str, str]]:
    prepared = prepare_ocr_image(img)
    variants = [prepared, prepared.point(lambda p: 255 if p > 170 else 0)]
    lang = preferred_ocr_language()
    best_text = ""
    best_fields: dict[str, str] = {}
    best_score = -1
    for variant in variants:
        for psm in (6, 11):
            text = pytesseract.image_to_string(variant, lang=lang, config=f"--oem 3 --psm {psm}")
            fields = extract_registration_fields(text)
            useful_chars = len(re.sub(r"\s+", "", text))
            score = useful_chars + (len(fields) * 220)
            if score > best_score:
                best_text, best_fields, best_score = text, fields, score
    return best_text, best_fields


def validate_document_bytes(filename: str, content: bytes) -> None:
    suffix = Path(filename).suffix.lower()
    try:
        if suffix == ".pdf":
            pdf = fitz.open(stream=content, filetype="pdf")
            if pdf.page_count < 1:
                raise ValueError("PDF senza pagine")
            pdf.close()
        else:
            with Image.open(io.BytesIO(content)) as img:
                img.verify()
    except Exception as e:
        raise HTTPException(422, "Il file non è un documento/immagine valido o è danneggiato") from e


def ocr_bytes(filename: str, content: bytes) -> tuple[str, dict[str,str]]:
    text_parts=[]
    all_fields: dict[str, str] = {}
    suffix=Path(filename).suffix.lower()
    try:
        if suffix==".pdf":
            pdf=fitz.open(stream=content,filetype="pdf")
            for page in pdf:
                direct=page.get_text("text").strip()
                if direct:
                    text_parts.append(direct)
                    all_fields.update({k:v for k,v in extract_smart_fields(direct).items() if k not in all_fields})
                else:
                    pix=page.get_pixmap(matrix=fitz.Matrix(2.5,2.5),alpha=False)
                    img=Image.open(io.BytesIO(pix.tobytes("png")))
                    text, fields = best_ocr_text(img)
                    text_parts.append(text)
                    all_fields.update({k:v for k,v in fields.items() if k not in all_fields})
        else:
            img=Image.open(io.BytesIO(content))
            text, all_fields = best_ocr_text(img)
            text_parts.append(text)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(422,f"OCR non riuscito: {e}") from e
    text="\n".join(text_parts)
    if not all_fields:
        all_fields = extract_smart_fields(text)
    return text, all_fields


@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    vehicle_id: Optional[int] = Form(None),
    client_id: Optional[int] = Form(None),
    doc_type: str = Form("auto"),
) -> dict[str, Any]:
    """Smart inbox: OCR, classify, split PDFs, auto-link and propose next actions."""
    content = await file.read()
    if not content:
        raise HTTPException(422, "File vuoto")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(413, "File oltre 25 MB")
    filename = file.filename or "documento"
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(415, "Formato documento non supportato")
    validate_document_bytes(filename, content)

    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", filename)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    original_stored = f"{stamp}_ORIG_{safe_name}"
    original_path = UPLOAD_DIR / original_stored
    original_path.write_bytes(content)
    created_paths: list[Path] = [original_path]

    try:
        if suffix == ".pdf":
            page_analyses = _pdf_page_analysis(content)
            groups = _group_pdf_pages(page_analyses)
            page_count = len(page_analyses)
        else:
            try:
                text, _ = ocr_bytes(filename, content)
                image_analysis_state = "READY"
            except HTTPException:
                text = ""
                image_analysis_state = "OCR_ERROR"
            fields = extract_smart_fields(text)
            detected_type, confidence = classify_document_text(text, fields)
            groups = [[{"page": 1, "text": text, "fields": fields, "doc_type": detected_type, "confidence": confidence, "analysis_state": image_analysis_state}]]
            page_count = 1

        with db() as conn:
            if vehicle_id:
                ensure_vehicle(conn, vehicle_id)
            if client_id and not conn.execute("SELECT 1 FROM clients WHERE id=?", (client_id,)).fetchone():
                raise HTTPException(404, "Cliente non trovato")
            batch_cur = conn.execute(
                "INSERT INTO document_batches(original_name,stored_name,mime_type,page_count,created_at) VALUES(?,?,?,?,?)",
                (filename, original_stored, file.content_type or "", page_count, now_iso()),
            )
            batch_id = int(batch_cur.lastrowid)
            inserted: list[dict[str, Any]] = []
            all_actions: list[dict[str, Any]] = []
            for index, group in enumerate(groups, start=1):
                text = "\n".join(str(p.get("text") or "") for p in group).strip()
                fields = _merge_page_fields(group)
                # Re-run extraction/classification on the combined logical document.
                fields.update({k: v for k, v in extract_smart_fields(text).items() if k not in fields})
                detected_type, confidence = classify_document_text(text, fields)
                analysis_state = "OCR_ERROR" if any(p.get("analysis_state") == "OCR_ERROR" for p in group) else ("UNKNOWN" if detected_type == "altro" or not text else "READY")
                requested = (doc_type or "auto").strip().lower()
                final_type = detected_type if requested in {"", "auto", "altro"} else doc_type.strip()
                auto_vehicle, auto_client, review_reason = _match_document_owner(conn, fields)
                linked_vehicle = vehicle_id or auto_vehicle
                linked_client = client_id or auto_client
                auto_linked = int((not vehicle_id and bool(auto_vehicle)) or (not client_id and bool(auto_client)))

                p_from = int(group[0]["page"])
                p_to = int(group[-1]["page"])
                if suffix == ".pdf":
                    segment = _make_pdf_segment(content, list(range(p_from, p_to + 1)))
                    identity = normalize_plate(str(fields.get("plate") or "")) or str(fields.get("vin") or "")[-8:] or f"p{p_from}"
                    clean_kind = re.sub(r"[^A-Za-z0-9_-]", "_", final_type)
                    stored = f"{stamp}_{index:02d}_{clean_kind}_{identity}.pdf"
                    segment_path = UPLOAD_DIR / stored
                    segment_path.write_bytes(segment)
                    created_paths.append(segment_path)
                    display_name = f"{Path(filename).stem} · {final_type} · p.{p_from}" + (f"-{p_to}" if p_to != p_from else "") + ".pdf"
                    mime = "application/pdf"
                else:
                    stored = original_stored
                    display_name = filename
                    mime = file.content_type or "image/jpeg"

                if analysis_state == "OCR_ERROR":
                    review_reason = "OCR non riuscito: la foto è al sicuro. Riprova oppure inserisci la spesa manualmente."
                elif analysis_state == "UNKNOWN":
                    review_reason = "Documento non riconosciuto con certezza: scegli il veicolo e controlla i dati."
                elif not linked_vehicle and not linked_client and not review_reason:
                    if fields.get("plate") or fields.get("vin") or fields.get("fiscal_code"):
                        review_reason = "Ho letto dei dati identificativi, ma non trovo ancora una scheda corrispondente."
                    else:
                        review_reason = "Non ho trovato targa, telaio o cliente con certezza: scegli dove archiviarlo."
                cur = conn.execute(
                    """INSERT INTO documents(
                        vehicle_id,client_id,batch_id,doc_type,detected_doc_type,original_name,stored_name,mime_type,
                        ocr_text,detected_fields,confidence,auto_linked,analysis_state,page_from,page_to,review_reason,created_at
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        linked_vehicle, linked_client, batch_id, final_type, detected_type, display_name, stored, mime,
                        text, json.dumps(fields, ensure_ascii=False), float(confidence), auto_linked, analysis_state, p_from, p_to,
                        review_reason, now_iso(),
                    ),
                )
                doc_id = int(cur.lastrowid)
                actions = _create_document_suggestions(conn, doc_id)
                all_actions.extend(actions)
                row = dict(conn.execute(
                    """SELECT d.*,v.brand,v.model,v.plate,c.first_name,c.last_name
                       FROM documents d LEFT JOIN vehicles v ON v.id=d.vehicle_id
                       LEFT JOIN clients c ON c.id=d.client_id WHERE d.id=?""", (doc_id,),
                ).fetchone())
                row["detected_fields_obj"] = fields
                row["actions"] = actions
                inserted.append(row)

            first = inserted[0]
            return {
                "id": first["id"],
                "batch_id": batch_id,
                "ocr_text": first["ocr_text"],
                "detected_fields": first["detected_fields_obj"],
                "confirmed": False,
                "documents": inserted,
                "actions": all_actions,
                "summary": {
                    "documents": len(inserted),
                    "pages": page_count,
                    "auto_linked": sum(1 for x in inserted if x.get("auto_linked")),
                    "to_review": sum(1 for x in inserted if not x.get("vehicle_id") and not x.get("client_id")),
                    "suggested_actions": len(all_actions),
                    "unknown": sum(1 for x in inserted if x.get("analysis_state") == "UNKNOWN"),
                    "ocr_errors": sum(1 for x in inserted if x.get("analysis_state") == "OCR_ERROR"),
                },
            }
    except Exception:
        # Do not leave orphaned files behind when analysis/persistence fails.
        for created in created_paths:
            try:
                created.unlink(missing_ok=True)
            except OSError:
                logger.warning("Impossibile rimuovere file temporaneo %s", created)
        raise


@app.post("/api/documents/{doc_id}/confirm")
async def confirm_document(doc_id:int, request:Request) -> dict[str,Any]:
    payload=await request.json()
    with db() as conn:
        doc=conn.execute("SELECT * FROM documents WHERE id=?",(doc_id,)).fetchone()
        if not doc: raise HTTPException(404,"Documento non trovato")
        fields=payload.get("fields",{})
        vehicle_id=doc["vehicle_id"]
        client_id=doc["client_id"]
        warnings=[]
        if vehicle_id:
            v=ensure_vehicle(conn,vehicle_id)
            updates=[];args=[]
            for key,col in [("plate","plate"),("vin","vin"),("brand","brand"),("model","model"),("registration_date","registration_date"),("fuel","fuel"),("engine_cc","engine_cc"),("mileage","mileage")]:
                val=fields.get(key) or ""
                if isinstance(val, str):
                    val = val.strip()
                if key == "plate":
                    val = normalize_plate(str(val))
                    if val and not re.fullmatch(r"[A-Z0-9]{5,8}", val):
                        raise HTTPException(422, "Targa OCR non valida")
                if key == "vin":
                    val = re.sub(r"[^A-HJ-NPR-Z0-9]", "", str(val).upper())
                    if val and len(val) != 17:
                        raise HTTPException(422, "Telaio OCR non valido")
                if key == "registration_date":
                    val = normalize_eu_date(str(val))
                    if fields.get(key) and not val:
                        raise HTTPException(422, "Data immatricolazione OCR non valida")
                if key in {"engine_cc", "mileage"}:
                    try:
                        val = int(float(val)) if str(val).strip() else 0
                    except (TypeError, ValueError) as e:
                        raise HTTPException(422, "Cilindrata OCR non valida" if key == "engine_cc" else "Chilometri OCR non validi") from e
                    if key == "engine_cc" and (val < 0 or val > 20000):
                        raise HTTPException(422, "Cilindrata OCR fuori intervallo")
                    if key == "mileage" and (val < 0 or val > 2_000_000):
                        raise HTTPException(422, "Chilometri OCR fuori intervallo")
                if val:
                    existing=v[col]
                    comparable_existing = int(existing or 0) if key in {"engine_cc", "mileage"} else str(existing or "").strip().upper()
                    comparable_val = int(val) if key in {"engine_cc", "mileage"} else str(val).strip().upper()
                    if existing and comparable_existing!=comparable_val:
                        warnings.append(f"{col.upper()} differente: archivio {existing} / documento {val}")
                    elif not existing:
                        if key in {"plate", "vin"}:
                            duplicate = conn.execute(
                                f"SELECT id,brand,model,plate FROM vehicles WHERE {col}=? AND id<>?",
                                (val, vehicle_id),
                            ).fetchone()
                            if duplicate:
                                warnings.append(
                                    f"{col.upper()} già presente su altra auto #{duplicate['id']} "
                                    f"({duplicate['brand']} {duplicate['model']} {duplicate['plate']})"
                                )
                                continue
                        updates.append(f"{col}=?");args.append(val)
            if updates:
                args += [now_iso(),vehicle_id]
                conn.execute(f"UPDATE vehicles SET {','.join(updates)},updated_at=? WHERE id=?",args)
        if client_id and fields.get("fiscal_code"):
            c=conn.execute("SELECT * FROM clients WHERE id=?",(client_id,)).fetchone()
            if c:
                val=fields["fiscal_code"].upper()
                if c["fiscal_code"] and c["fiscal_code"]!=val:
                    warnings.append(f"CF differente: archivio {c['fiscal_code']} / documento {val}")
                elif not c["fiscal_code"]:
                    conn.execute("UPDATE clients SET fiscal_code=? WHERE id=?",(val,client_id))
        conn.execute("UPDATE documents SET confirmed=1,detected_fields=? WHERE id=?",(json.dumps(fields),doc_id))
        return {"confirmed":True,"warnings":warnings}




@app.get("/api/document-actions")
def list_document_actions(status: str = "PENDING") -> list[dict[str, Any]]:
    q = """SELECT a.*,d.original_name,d.doc_type,d.detected_doc_type,d.vehicle_id,d.client_id,
                  v.brand,v.model,v.plate,c.first_name,c.last_name
           FROM document_actions a JOIN documents d ON d.id=a.document_id
           LEFT JOIN vehicles v ON v.id=d.vehicle_id LEFT JOIN clients c ON c.id=d.client_id"""
    args: list[Any] = []
    if status:
        q += " WHERE a.status=?"
        args.append(status.upper())
    q += " ORDER BY a.created_at DESC"
    with db() as conn:
        rows = []
        for r in conn.execute(q, args).fetchall():
            d = dict(r)
            try:
                d["payload"] = json.loads(d.get("payload_json") or "{}")
            except Exception:
                d["payload"] = {}
            rows.append(d)
        return rows


@app.post("/api/document-actions/{action_id}/apply")
def apply_document_action(action_id: int) -> dict[str, Any]:
    with db() as conn:
        action = conn.execute("SELECT * FROM document_actions WHERE id=?", (action_id,)).fetchone()
        if not action:
            raise HTTPException(404, "Suggerimento non trovato")
        if action["status"] == "APPLIED":
            try:
                result = json.loads(action["result_json"] or "{}")
            except Exception:
                result = {}
            return {"ok": True, "already_applied": True, **result}
        if action["status"] != "PENDING":
            raise HTTPException(409, "Suggerimento non più applicabile")
        doc = conn.execute("SELECT * FROM documents WHERE id=?", (action["document_id"],)).fetchone()
        if not doc:
            raise HTTPException(404, "Documento non trovato")
        payload = json.loads(action["payload_json"] or "{}")
        result: dict[str, Any] = {}
        if action["action_type"] == "CREATE_EXPENSE":
            vehicle_id = int(payload.get("vehicle_id") or doc["vehicle_id"] or 0)
            if not vehicle_id:
                raise HTTPException(409, "Prima collega il documento a un'auto")
            ensure_vehicle(conn, vehicle_id)
            amount = validate_nonnegative(payload.get("amount", 0), "Importo")
            if amount <= 0:
                raise HTTPException(422, "Importo non riconosciuto")
            existing = conn.execute("SELECT * FROM expenses WHERE source_document_id=?", (doc["id"],)).fetchone()
            if existing:
                result = {"expense_id": existing["id"], "vehicle_id": vehicle_id}
            else:
                expense_date = validate_iso_date(str(payload.get("expense_date") or date.today().isoformat()), "Data spesa", allow_empty=False)
                cur = conn.execute(
                    """INSERT INTO expenses(vehicle_id,category,description,supplier,amount,expense_date,source_document_id,source,created_at)
                       VALUES(?,?,?,?,?,?,?,?,?)""",
                    (
                        vehicle_id, str(payload.get("category") or "Altro"),
                        str(payload.get("description") or "Documento acquisito automaticamente"),
                        str(payload.get("supplier") or ""), amount,
                        expense_date, doc["id"], "ocr", now_iso(),
                    ),
                )
                result = {"expense_id": int(cur.lastrowid), "vehicle_id": vehicle_id, "amount": amount}
            conn.execute("UPDATE documents SET confirmed=1,review_reason='' WHERE id=?", (doc["id"],))
        elif action["action_type"] == "CREATE_VEHICLE":
            plate = normalize_plate(str(payload.get("plate") or ""))
            vin = re.sub(r"[^A-HJ-NPR-Z0-9]", "", str(payload.get("vin") or "").upper())
            if not plate and not vin:
                raise HTTPException(422, "Targa o telaio necessari per creare l'auto")
            duplicate = None
            if plate:
                duplicate = conn.execute("SELECT * FROM vehicles WHERE plate=?", (plate,)).fetchone()
            if not duplicate and vin:
                duplicate = conn.execute("SELECT * FROM vehicles WHERE vin=?", (vin,)).fetchone()
            if duplicate:
                vehicle_id = int(duplicate["id"])
            else:
                if vin and len(vin) != 17:
                    raise HTTPException(422, "Telaio OCR non valido")
                reg = normalize_eu_date(str(payload.get("registration_date") or ""))
                cur = conn.execute(
                    """INSERT INTO vehicles(acquisition_type,brand,model,version,plate,vin,registration_date,fuel,engine_cc,transmission,
                       mileage,color,purchase_price,expected_sale_price,status,notes,created_at,updated_at)
                       VALUES('acquisto',?,?,?,?,?,?,?,?,?,?, '',0,0,'DA_CONTROLLARE',?,?,?)""",
                    (
                        str(payload.get("brand") or ""), str(payload.get("model") or ""), "", plate, vin, reg,
                        str(payload.get("fuel") or ""), int(float(payload.get("engine_cc") or 0)), "",
                        int(float(payload.get("mileage") or 0)),
                        f"Creata da Document Brain · documento #{doc['id']}", now_iso(), now_iso(),
                    ),
                )
                vehicle_id = int(cur.lastrowid)
            conn.execute("UPDATE documents SET vehicle_id=?,auto_linked=1,review_reason='',confirmed=1 WHERE id=?", (vehicle_id, doc["id"]))
            result = {"vehicle_id": vehicle_id}
            # New link may make an expense suggestion possible on mixed documents.
            _create_document_suggestions(conn, doc["id"])
        else:
            raise HTTPException(422, "Azione documento non supportata")
        conn.execute(
            "UPDATE document_actions SET status='APPLIED',result_json=?,applied_at=? WHERE id=?",
            (json.dumps(result, ensure_ascii=False), now_iso(), action_id),
        )
        return {"ok": True, "action_type": action["action_type"], **result}


@app.post("/api/document-actions/{action_id}/dismiss")
def dismiss_document_action(action_id: int) -> dict[str, bool]:
    with db() as conn:
        if not conn.execute("SELECT 1 FROM document_actions WHERE id=?", (action_id,)).fetchone():
            raise HTTPException(404, "Suggerimento non trovato")
        conn.execute("UPDATE document_actions SET status='DISMISSED',applied_at=? WHERE id=?", (now_iso(), action_id))
    return {"ok": True}


@app.post("/api/documents/{doc_id}/link")
async def link_document(doc_id: int, request: Request) -> dict[str, Any]:
    payload = await request.json()
    vehicle_id = int(payload.get("vehicle_id") or 0) or None
    client_id = int(payload.get("client_id") or 0) or None
    with db() as conn:
        doc = conn.execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone()
        if not doc:
            raise HTTPException(404, "Documento non trovato")
        if vehicle_id:
            ensure_vehicle(conn, vehicle_id)
        if client_id and not conn.execute("SELECT 1 FROM clients WHERE id=?", (client_id,)).fetchone():
            raise HTTPException(404, "Cliente non trovato")
        conn.execute(
            "UPDATE documents SET vehicle_id=?,client_id=?,review_reason='',auto_linked=0 WHERE id=?",
            (vehicle_id, client_id, doc_id),
        )
        # Regenerate still-pending suggestions with the chosen owner.
        conn.execute("DELETE FROM document_actions WHERE document_id=? AND status='PENDING'", (doc_id,))
        actions = _create_document_suggestions(conn, doc_id)
        updated = dict(conn.execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone())
        return {"document": updated, "actions": actions}


@app.get("/api/documents")
def list_documents(vehicle_id: Optional[int] = None, client_id: Optional[int] = None) -> list[dict[str, Any]]:
    q = """SELECT d.*,v.brand,v.model,v.plate,c.first_name,c.last_name
           FROM documents d
           LEFT JOIN vehicles v ON v.id=d.vehicle_id
           LEFT JOIN clients c ON c.id=d.client_id
           WHERE 1=1"""
    args: list[Any] = []
    if vehicle_id is not None:
        q += " AND d.vehicle_id=?"
        args.append(vehicle_id)
    if client_id is not None:
        q += " AND d.client_id=?"
        args.append(client_id)
    q += " ORDER BY d.created_at DESC"
    with db() as conn:
        return [dict(r) for r in conn.execute(q, args).fetchall()]


@app.get("/api/document-batches/{batch_id}/file")
def download_document_batch(batch_id: int) -> FileResponse:
    with db() as conn:
        batch = conn.execute("SELECT * FROM document_batches WHERE id=?", (batch_id,)).fetchone()
        if not batch:
            raise HTTPException(404, "Documento originale non trovato")
        path = UPLOAD_DIR / batch["stored_name"]
        if not path.exists():
            raise HTTPException(404, "File originale non trovato")
        return FileResponse(path, filename=batch["original_name"], media_type=batch["mime_type"] or "application/octet-stream")


@app.get("/api/documents/{doc_id}/file")
def download_document(doc_id:int) -> FileResponse:
    with db() as conn:
        doc=conn.execute("SELECT * FROM documents WHERE id=?",(doc_id,)).fetchone()
        if not doc: raise HTTPException(404,"Documento non trovato")
        path=UPLOAD_DIR/doc["stored_name"]
        if not path.exists(): raise HTTPException(404,"File non trovato")
        return FileResponse(path,filename=doc["original_name"])


@app.post("/api/vehicles/{vehicle_id}/photos")
async def upload_photo(vehicle_id:int, category:str=Form(...), file:UploadFile=File(...), is_cover:bool=Form(False)) -> dict[str,Any]:
    if category not in PHOTO_REQUIRED:
        raise HTTPException(400,"Categoria foto non valida")
    content=await file.read()
    if not content: raise HTTPException(422,"Foto vuota")
    if len(content)>15*1024*1024: raise HTTPException(413,"Foto oltre 15 MB")
    suffix=Path(file.filename or "").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}: raise HTTPException(415,"Formato immagine non supportato")
    try:
        img=Image.open(io.BytesIO(content))
        img=ImageOps.exif_transpose(img).convert("RGB")
        # Safe enhancement only: orientamento EXIF + ridimensionamento, senza alterare danni o condizioni reali.
        max_side=2400
        if max(img.size)>max_side:
            ratio=max_side/max(img.size); img=img.resize((int(img.width*ratio),int(img.height*ratio)))
        stored=f"photo_{vehicle_id}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
        img.save(UPLOAD_DIR/stored,"JPEG",quality=90,optimize=True)
    except Exception as e:
        raise HTTPException(422,f"Immagine non valida: {e}") from e
    with db() as conn:
        ensure_vehicle(conn,vehicle_id)
        if is_cover: conn.execute("UPDATE photos SET is_cover=0 WHERE vehicle_id=?",(vehicle_id,))
        cur=conn.execute("INSERT INTO photos(vehicle_id,category,original_name,stored_name,is_cover,created_at) VALUES(?,?,?,?,?,?)",
                         (vehicle_id,category,file.filename or stored,stored,1 if is_cover else 0,now_iso()))
        cats={r["category"] for r in conn.execute("SELECT category FROM photos WHERE vehicle_id=?",(vehicle_id,)).fetchall()}
        if all(c in cats for c in PHOTO_REQUIRED):
            v=ensure_vehicle(conn,vehicle_id)
            if v["status"]=="DA_FOTOGRAFARE": set_status(conn,vehicle_id,"DA_PUBBLICARE","Checklist foto completa")
        return {"id":cur.lastrowid,"category":category,"complete":all(c in cats for c in PHOTO_REQUIRED)}


@app.get("/api/photos/{photo_id}/file")
def photo_file(photo_id:int)->FileResponse:
    with db() as conn:
        p=conn.execute("SELECT * FROM photos WHERE id=?",(photo_id,)).fetchone()
        if not p: raise HTTPException(404,"Foto non trovata")
        path=UPLOAD_DIR/p["stored_name"]
        return FileResponse(path,media_type="image/jpeg")


@app.post("/api/vehicles/{vehicle_id}/listing")
def upsert_listing(vehicle_id:int,l:ListingIn)->dict[str,Any]:
    published_date = validate_iso_date(l.published_date, "Data pubblicazione")
    values = {name: validate_nonnegative(getattr(l, name), name) for name in ("initial_price","current_price","market_low","market_median","market_high")}
    if values["market_low"] and values["market_median"] and values["market_low"] > values["market_median"]:
        raise HTTPException(422, "Mercato: il prezzo basso non può superare la mediana")
    if values["market_median"] and values["market_high"] and values["market_median"] > values["market_high"]:
        raise HTTPException(422, "Mercato: la mediana non può superare il prezzo alto")
    with db() as conn:
        v=ensure_vehicle(conn,vehicle_id)
        title=l.title or f"{v['brand']} {v['model']} {v['version']}".strip()
        settings={r["key"]:r["value"] for r in conn.execute("SELECT * FROM settings").fetchall()}
        description=l.description or generate_listing_description(dict(v), settings)
        conn.execute("""INSERT INTO listings(vehicle_id,url,published_date,initial_price,current_price,market_low,market_median,market_high,title,description,updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?)
                        ON CONFLICT(vehicle_id) DO UPDATE SET url=excluded.url,published_date=excluded.published_date,initial_price=excluded.initial_price,current_price=excluded.current_price,market_low=excluded.market_low,market_median=excluded.market_median,market_high=excluded.market_high,title=excluded.title,description=excluded.description,updated_at=excluded.updated_at""",
                     (vehicle_id,l.url,published_date,values["initial_price"],values["current_price"],values["market_low"],values["market_median"],values["market_high"],title,description,now_iso()))
        if published_date and v["status"]=="DA_PUBBLICARE": set_status(conn,vehicle_id,"IN_VENDITA","Annuncio pubblicato")
        row=dict(conn.execute("SELECT * FROM listings WHERE vehicle_id=?",(vehicle_id,)).fetchone())
        return {**row,"analysis":price_analysis(conn,vehicle_id,row)}


def generate_listing_description(v:dict[str,Any], settings:dict[str,str]|None=None)->str:
    settings=settings or {}
    parts=[f"{v.get('brand','')} {v.get('model','')} {v.get('version','')}".strip()]
    if v.get('registration_date'): parts.append(f"Immatricolazione: {v['registration_date']}")
    if v.get('mileage'): parts.append(f"Km: {int(v['mileage']):,}".replace(",","."))
    if v.get('fuel'): parts.append(f"Alimentazione: {v['fuel']}")
    if v.get('engine_cc'): parts.append(f"Cilindrata: {int(v['engine_cc'])} cc")
    if v.get('transmission'): parts.append(f"Cambio: {v['transmission']}")
    parts.append("")
    guarantee=settings.get("dealer_guarantee","")
    services=[x.strip() for x in settings.get("dealer_services","").split("|") if x.strip()]
    if guarantee: parts.append(f"Garanzia: {guarantee}")
    parts.extend(f"• {x}" for x in services)
    parts.append("")
    parts.append(settings.get("autoscout_bio") or "Veicolo disponibile presso la nostra sede.")
    address=settings.get("dealer_address","")
    phone=settings.get("dealer_phone","")
    if address: parts.append(f"📍 {address}")
    if phone: parts.append(f"📞 {phone}")
    parts.append("Contattaci per maggiori informazioni o per prenotare una prova su strada.")
    return "\n".join(parts)


def price_analysis(conn:sqlite3.Connection,vehicle_id:int,l:dict[str,Any])->dict[str,Any]:
    total=vehicle_total(conn,vehicle_id)
    low=float(l.get("market_low") or 0); med=float(l.get("market_median") or 0); high=float(l.get("market_high") or 0)
    rapid=round(max(low,total*1.08),-1) if low else round(total*1.10,-1)
    competitive=round(med if med else max(rapid,total*1.15),-1)
    test=round(high if high else max(competitive,total*1.20),-1)
    current=float(l.get("current_price") or 0)
    margin=round(current-total,2) if current else None
    advice="Inserire dati di mercato per un confronto completo."
    if med and current:
        delta=current-med
        if delta>1000: advice=f"Prezzo circa €{abs(delta):,.0f} sopra la mediana osservata: valutare posizionamento, foto e descrizione prima di ridurre.".replace(",",".")
        elif delta<-1000: advice="Prezzo sotto la mediana osservata: verificare che il margine sia coerente prima di ulteriori ribassi."
        else: advice="Prezzo vicino alla mediana osservata: prima di ridurlo controllare qualità annuncio, foto e richieste ricevute."
    return {"total_invested":total,"rapid":rapid,"competitive":competitive,"test_market":test,"current_margin":margin,"advice":advice}


@app.get("/api/vehicles/{vehicle_id}/price-analysis")
def get_price_analysis(vehicle_id:int)->dict[str,Any]:
    with db() as conn:
        ensure_vehicle(conn,vehicle_id)
        l=conn.execute("SELECT * FROM listings WHERE vehicle_id=?",(vehicle_id,)).fetchone()
        return price_analysis(conn,vehicle_id,dict(l) if l else {})


@app.get("/api/vehicles/{vehicle_id}/instagram")
def instagram_content(vehicle_id:int)->dict[str,str]:
    with db() as conn:
        v=dict(ensure_vehicle(conn,vehicle_id))
        price=float(v.get("expected_sale_price") or v.get("sale_price") or 0)
        title=f"{v['brand']} {v['model']} {v['version']}".strip()
        details=[]
        if v.get('mileage'): details.append(f"{int(v['mileage']):,} km".replace(",","."))
        if v.get('fuel'): details.append(v['fuel'])
        if v.get('transmission'): details.append(v['transmission'])
        if price: details.append(f"€ {price:,.0f}".replace(",","."))
        settings={r["key"]:r["value"] for r in conn.execute("SELECT * FROM settings").fetchall()}
        phone=settings.get("dealer_phone","")
        address=settings.get("dealer_address","")
        brand=settings.get("dealer_name","Malù23 Cars")
        extras=[]
        if address: extras.append(f"📍 {address}")
        if phone: extras.append(f"📞 {phone}")
        caption=f"🚗 {title}\n\n"+" • ".join(details)+f"\n\nDisponibile da {brand}.\n"+"\n".join(extras)+"\n\nScrivici in DM per informazioni o per fissare un appuntamento."
        story=f"{title}\n"+(f"€ {price:,.0f}".replace(",",".") if price else "Disponibile ora")+f"\n{brand} · Lumezzane\nDM per info"
        return {"caption":caption,"story":story,"note":"Contenuto preparato localmente. La pubblicazione automatica richiede collegamento Instagram Business autorizzato."}


@app.post("/api/contracts")
def create_contract(c:ContractIn)->dict[str,Any]:
    sale_price = validate_nonnegative(c.sale_price, "Prezzo vendita")
    deposit = validate_nonnegative(c.deposit, "Caparra")
    financing = validate_nonnegative(c.financing, "Finanziamento")
    if deposit + financing > sale_price:
        raise HTTPException(422, "Caparra + finanziamento non possono superare il prezzo di vendita")
    c.sale_price, c.deposit, c.financing = sale_price, deposit, financing
    with db() as conn:
        v=dict(ensure_vehicle(conn,c.vehicle_id))
        client=conn.execute("SELECT * FROM clients WHERE id=?",(c.client_id,)).fetchone()
        if not client: raise HTTPException(404,"Cliente non trovato")
        settings={r["key"]:r["value"] for r in conn.execute("SELECT * FROM settings").fetchall()}
        pdf_name=f"Contratto_{normalize_plate(v['plate']) or c.vehicle_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        pdf_path=UPLOAD_DIR/pdf_name
        make_contract_pdf(pdf_path,settings,v,dict(client),c)
        cur=conn.execute("INSERT INTO contracts(vehicle_id,client_id,sale_price,deposit,financing,tradein,notes,pdf_name,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                         (c.vehicle_id,c.client_id,c.sale_price,c.deposit,c.financing,1 if c.tradein_vehicle else 0,c.notes,pdf_name,now_iso()))
        conn.execute("UPDATE vehicles SET sale_price=?,updated_at=? WHERE id=?",(c.sale_price,now_iso(),c.vehicle_id))
        set_status(conn,c.vehicle_id,"VENDUTA","Contratto generato")
        tradein_id=None
        if c.tradein_vehicle:
            tv=c.tradein_vehicle
            cur2=conn.execute("""INSERT INTO vehicles(acquisition_type,brand,model,version,plate,vin,registration_date,fuel,engine_cc,transmission,mileage,color,purchase_price,expected_sale_price,status,notes,created_at,updated_at)
                               VALUES('permuta',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                              (tv.get('brand',''),tv.get('model',''),tv.get('version',''),normalize_plate(tv.get('plate','')),tv.get('vin','').upper(),tv.get('registration_date',''),tv.get('fuel',''),int(tv.get('engine_cc',0) or 0),tv.get('transmission',''),int(tv.get('mileage',0) or 0),tv.get('color',''),float(tv.get('purchase_price',0) or 0),float(tv.get('expected_sale_price',0) or 0),'DA_CONTROLLARE',f"Permuta da contratto #{cur.lastrowid}",now_iso(),now_iso()))
            tradein_id=cur2.lastrowid
            conn.execute("INSERT INTO status_history(vehicle_id,old_status,new_status,reason,created_at) VALUES(?,?,?,?,?)",(tradein_id,None,'DA_CONTROLLARE','Permuta acquisita',now_iso()))
        return {"contract_id":cur.lastrowid,"pdf_url":f"/api/contracts/{cur.lastrowid}/pdf","tradein_vehicle_id":tradein_id}


def make_contract_pdf(path:Path,settings:dict[str,str],v:dict[str,Any],cl:dict[str,Any],c:ContractIn)->None:
    cnv=canvas.Canvas(str(path),pagesize=A4)
    w,h=A4
    logo_path=STATIC_DIR / "brand" / "malu23_logo.png"
    # Header brandizzato Malù23 Cars: sobrio, leggibile e stampabile.
    cnv.setFillColorRGB(0.06,0.06,0.065); cnv.rect(0,h-105,w,105,fill=1,stroke=0)
    cnv.setStrokeColorRGB(0.80,0.07,0.09); cnv.setLineWidth(2.2); cnv.line(0,h-106,w,h-106)
    if logo_path.exists():
        try: cnv.drawImage(str(logo_path),38,h-90,width=150,height=66,mask='auto',preserveAspectRatio=True,anchor='c')
        except Exception: pass
    cnv.setFillColorRGB(1,1,1); cnv.setFont("Helvetica-Bold",15); cnv.drawRightString(w-42,h-52,"CONTRATTO DI VENDITA VEICOLO")
    cnv.setFillColorRGB(0.85,0.18,0.18); cnv.setFont("Helvetica-Bold",8); cnv.drawRightString(w-42,h-70,"MALÙ23 CARS · LUMEZZANE (BS)")
    cnv.setFillColorRGB(0.1,0.1,0.11)
    y=h-135
    dealer=settings.get('dealer_name') or 'Malù23 Cars'
    cnv.setFont("Helvetica-Bold",11); cnv.drawString(42,y,dealer); y-=16
    cnv.setFont("Helvetica",8.5)
    for line in [settings.get('dealer_address',''), f"Tel. {settings.get('dealer_phone','')}" if settings.get('dealer_phone') else '', settings.get('dealer_email',''), f"P.IVA: {settings.get('dealer_vat','')}" if settings.get('dealer_vat') else '', f"CF: {settings.get('dealer_tax_code','')}" if settings.get('dealer_tax_code') else '', f"PEC: {settings.get('dealer_pec','')}" if settings.get('dealer_pec') else '']:
        if line: cnv.drawString(42,y,line); y-=13
    y-=11
    def section(title:str):
        nonlocal y
        cnv.setFillColorRGB(0.80,0.07,0.09); cnv.setFont("Helvetica-Bold",10); cnv.drawString(42,y,title); y-=16
        cnv.setFillColorRGB(0.1,0.1,0.11); cnv.setFont("Helvetica",9)
    section("VEICOLO")
    for label,val in [("Marca/Modello",f"{v.get('brand','')} {v.get('model','')} {v.get('version','')}"),("Targa",v.get('plate','')),("Telaio",v.get('vin','')),("Km",str(v.get('mileage',''))),("Immatricolazione",v.get('registration_date',''))]:
        cnv.setFont("Helvetica-Bold",8.5); cnv.drawString(42,y,f"{label}:"); cnv.setFont("Helvetica",8.5); cnv.drawString(132,y,str(val or '—')); y-=13
    y-=7; section("ACQUIRENTE")
    for label,val in [("Nome",f"{cl.get('first_name','')} {cl.get('last_name','')}"),("CF",cl.get('fiscal_code','')),("Telefono",cl.get('phone','')),("Email",cl.get('email','')),("Indirizzo",cl.get('address',''))]:
        cnv.setFont("Helvetica-Bold",8.5); cnv.drawString(42,y,f"{label}:"); cnv.setFont("Helvetica",8.5); cnv.drawString(132,y,str(val or '—')); y-=13
    y-=7; section("CONDIZIONI ECONOMICHE")
    for label,val in [("Prezzo",f"EUR {c.sale_price:.2f}"),("Caparra",f"EUR {c.deposit:.2f}"),("Finanziamento",f"EUR {c.financing:.2f}"),("Saldo",f"EUR {c.sale_price-c.deposit-c.financing:.2f}")]:
        cnv.setFont("Helvetica-Bold",8.5); cnv.drawString(42,y,f"{label}:"); cnv.setFont("Helvetica",8.5); cnv.drawString(132,y,val); y-=13
    guarantee=settings.get('dealer_guarantee','')
    if guarantee:
        y-=6; cnv.setFont("Helvetica-Bold",8.5); cnv.drawString(42,y,"Garanzia commerciale indicata:"); cnv.setFont("Helvetica",8.5); cnv.drawString(180,y,guarantee); y-=13
    if c.notes:
        y-=7; section("NOTE")
        for chunk in [c.notes[i:i+88] for i in range(0,len(c.notes),88)]:
            cnv.drawString(42,y,chunk); y-=12
    terms=(settings.get('contract_terms') or '').strip()
    privacy=(settings.get('privacy_note') or '').strip()
    if terms and y > 175:
        y-=8; section("CONDIZIONI CONTRATTUALI")
        for chunk in [terms[i:i+92] for i in range(0,len(terms),92)][:8]:
            cnv.drawString(42,y,chunk); y-=11
    if privacy and y > 145:
        cnv.setFont("Helvetica-Bold",7.5); cnv.drawString(42,y,"Privacy:"); y-=10; cnv.setFont("Helvetica",7.2)
        for chunk in [privacy[i:i+100] for i in range(0,len(privacy),100)][:4]: cnv.drawString(42,y,chunk); y-=9
    y=max(y-28,105)
    cnv.setStrokeColorRGB(.7,.7,.7); cnv.line(42,y,245,y); cnv.line(330,y,553,y)
    cnv.setFillColorRGB(.2,.2,.2); cnv.setFont("Helvetica",8); cnv.drawString(42,y-13,"Firma venditore"); cnv.drawString(330,y-13,"Firma acquirente")
    cnv.setFillColorRGB(.35,.35,.35); cnv.setFont("Helvetica",6.8)
    cnv.drawString(42,36,"Documento gestionale generato da Malù23 Cars · AUTOSALONE ONE.")
    cnv.drawString(42,25,"Prima dell'uso commerciale definitivo verificare il testo contrattuale con il modello legale/fiscale effettivamente adottato dalla concessionaria.")
    cnv.save()


@app.get("/api/contracts/{contract_id}/pdf")
def contract_pdf(contract_id:int)->FileResponse:
    with db() as conn:
        r=conn.execute("SELECT * FROM contracts WHERE id=?",(contract_id,)).fetchone()
        if not r: raise HTTPException(404,"Contratto non trovato")
        path=UPLOAD_DIR/r["pdf_name"]
        return FileResponse(path,filename=r["pdf_name"],media_type="application/pdf")


@app.get("/api/settings")
def get_settings()->dict[str,str]:
    with db() as conn: return {r["key"]:r["value"] for r in conn.execute("SELECT * FROM settings").fetchall()}


@app.post("/api/settings")
async def save_settings(request:Request)->dict[str,str]:
    _owner_guard(request)
    payload=await request.json()
    allowed={"dealer_name","dealer_owner","dealer_address","dealer_vat","dealer_tax_code","dealer_pec","dealer_sdi","dealer_iban","dealer_phone","dealer_phone_secondary","dealer_email","dealer_email_secondary","dealer_tagline","dealer_guarantee","dealer_services","autoscout_bio","notify_default_minutes","notify_day_start","contract_terms","privacy_note","contract_reviewed","backup_auto_enabled","backup_time","backup_retention_days"}
    with db() as conn:
        for k,v in payload.items():
            if k in allowed: conn.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(k,str(v)))
        return {r["key"]:r["value"] for r in conn.execute("SELECT * FROM settings").fetchall()}



def _backup_settings() -> dict[str, str]:
    with db() as conn:
        return {r["key"]:r["value"] for r in conn.execute("SELECT * FROM settings").fetchall()}


def _mirror_backup(path: Path) -> tuple[str, str]:
    if not EXTERNAL_BACKUP_DIR:
        return "", ""
    target = EXTERNAL_BACKUP_DIR / path.name
    try:
        EXTERNAL_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        return str(target), ""
    except OSError as exc:
        logger.exception("Backup locale creato, ma copia esterna fallita")
        return "", str(exc)


def _external_backup_ready() -> bool:
    if not EXTERNAL_BACKUP_DIR:
        return False
    try:
        EXTERNAL_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        probe = EXTERNAL_BACKUP_DIR / ".malu23_write_test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


def _prune_backups(retention_days: int) -> None:
    cutoff = time.time() - max(1, retention_days) * 86400
    for folder in [BACKUP_DIR] + ([EXTERNAL_BACKUP_DIR] if EXTERNAL_BACKUP_DIR else []):
        if not folder or not folder.exists(): continue
        for item in folder.glob("MALU23_CARS_backup_*.zip"):
            try:
                if item.stat().st_mtime < cutoff: item.unlink()
            except OSError:
                pass


def maybe_run_scheduled_backup() -> bool:
    settings = _backup_settings()
    if settings.get("backup_auto_enabled", "1") != "1": return False
    target = settings.get("backup_time", "02:30")
    now = datetime.now()
    try:
        hh, mm = [int(x) for x in target.split(":", 1)]
    except Exception:
        hh, mm = 2, 30
    if (now.hour, now.minute) < (hh, mm): return False
    with db() as conn:
        last = conn.execute("SELECT value FROM app_meta WHERE key='last_auto_backup_date'").fetchone()
        if last and last[0] == now.date().isoformat(): return False
    result = _create_backup_archive()
    with db() as conn:
        conn.execute("INSERT INTO app_meta(key,value) VALUES('last_auto_backup_date',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (now.date().isoformat(),))
        conn.execute("INSERT INTO app_meta(key,value) VALUES('last_auto_backup_file',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (result["file"],))
    return True


@app.get("/api/backups/status")
def backup_status(request: Request) -> dict[str, Any]:
    _owner_guard(request)
    settings = _backup_settings()
    with db() as conn:
        meta = {r["key"]:r["value"] for r in conn.execute("SELECT * FROM app_meta WHERE key LIKE 'last_auto_backup_%' OR key='last_external_backup_error'").fetchall()}
    return {
        "auto_enabled": settings.get("backup_auto_enabled", "1") == "1",
        "time": settings.get("backup_time", "02:30"),
        "retention_days": int(settings.get("backup_retention_days", "14") or 14),
        "external_configured": bool(EXTERNAL_BACKUP_DIR),
        "external_ready": _external_backup_ready(),
        "external_path": str(EXTERNAL_BACKUP_DIR) if EXTERNAL_BACKUP_DIR else "",
        "external_error": meta.get("last_external_backup_error", ""),
        "last_date": meta.get("last_auto_backup_date", ""),
        "last_file": meta.get("last_auto_backup_file", ""),
    }


@app.post("/api/backups/auto-run")
def force_auto_backup(request: Request) -> dict[str, Any]:
    _owner_guard(request)
    result = _create_backup_archive()
    with db() as conn:
        conn.execute("INSERT INTO app_meta(key,value) VALUES('last_auto_backup_date',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (date.today().isoformat(),))
        conn.execute("INSERT INTO app_meta(key,value) VALUES('last_auto_backup_file',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (result["file"],))
    return result


@app.get("/api/readiness")
def readiness(request: Request) -> dict[str, Any]:
    _owner_guard(request)
    with db() as conn:
        settings = {r["key"]:r["value"] for r in conn.execute("SELECT * FROM settings").fetchall()}
        push_count = conn.execute("SELECT COUNT(*) FROM push_subscriptions").fetchone()[0]
        user_count = conn.execute("SELECT COUNT(*) FROM users WHERE active=1").fetchone()[0]
    ok_db, _ = database_integrity()
    public_url = os.environ.get("AUTOSALONE_PUBLIC_URL", "")
    checks = [
        {"key":"database","label":"Database integro","ok":ok_db},
        {"key":"auth","label":"Accesso protetto configurato","ok":auth_enabled()},
        {"key":"secret","label":"Secret di sessione forte e persistente","ok":len(_secret()) >= 32 and (bool(os.environ.get("AUTOSALONE_SECRET")) or (DATA_DIR / ".session_secret").exists())},
        {"key":"https","label":"URL pubblico HTTPS configurato","ok":public_url.startswith("https://")},
        {"key":"dealer_fiscal","label":"P.IVA/CF concessionaria inseriti","ok":bool(settings.get("dealer_vat") or settings.get("dealer_tax_code"))},
        {"key":"contract","label":"Contratto reale verificato","ok":settings.get("contract_reviewed") == "1" and bool(settings.get("contract_terms"))},
        {"key":"push","label":"Almeno un dispositivo push registrato","ok":push_count > 0},
        {"key":"backup_external","label":"Backup esterno configurato e scrivibile","ok":_external_backup_ready()},
        {"key":"users","label":"Account personali configurati","ok":user_count >= 2},
        {"key":"ocr","label":"OCR disponibile","ok":shutil.which("tesseract") is not None},
    ]
    score = round(sum(1 for x in checks if x["ok"]) / len(checks) * 100)
    return {"ready": all(x["ok"] for x in checks), "score": score, "checks": checks}


def _create_backup_archive()->dict[str,str]:
    stamp=datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    out=BACKUP_DIR/f"MALU23_CARS_backup_{stamp}.zip"
    snapshot=BACKUP_DIR/f".snapshot_{stamp}.db"
    source=sqlite3.connect(DB_PATH)
    dest=sqlite3.connect(snapshot)
    try:
        source.backup(dest)
    finally:
        dest.close(); source.close()
    try:
        ok,msg=database_integrity(snapshot)
        if not ok:
            raise HTTPException(500,f"Backup non creato: {msg}")
        with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
            z.write(snapshot,"autosalone_one.db")
            for p in UPLOAD_DIR.iterdir():
                if p.is_file(): z.write(p,f"uploads/{p.name}")
            z.writestr("backup_meta.json", json.dumps({"app":"Malù23 Cars · AUTOSALONE ONE","version":APP_VERSION,"created_at":now_iso()}, ensure_ascii=False, indent=2))
    finally:
        snapshot.unlink(missing_ok=True)
    external, external_error = _mirror_backup(out)
    with db() as conn:
        conn.execute(
            "INSERT INTO app_meta(key,value) VALUES('last_external_backup_error',?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (external_error,),
        )
    settings = _backup_settings()
    try: retention = int(settings.get("backup_retention_days", "14") or 14)
    except ValueError: retention = 14
    _prune_backups(retention)
    return {"file":out.name,"url":f"/api/backups/{out.name}","external_copy":external,"external_error":external_error}


@app.post("/api/backups/create")
def create_backup(request: Request)->dict[str,str]:
    _owner_guard(request)
    return _create_backup_archive()


@app.get("/api/backups/{name}")
def download_backup(name:str, request: Request)->FileResponse:
    _owner_guard(request)
    safe=Path(name).name;path=BACKUP_DIR/safe
    if not path.exists(): raise HTTPException(404,"Backup non trovato")
    return FileResponse(path,filename=safe,media_type="application/zip")


@app.post("/api/backups/restore")
async def restore_backup(request: Request, file:UploadFile=File(...))->dict[str,Any]:
    _owner_guard(request)
    content=await file.read()
    if not content:
        raise HTTPException(422,"Backup vuoto")
    if len(content) > 500 * 1024 * 1024:
        raise HTTPException(413,"Backup oltre 500 MB")
    stage=DATA_DIR/f"restore_stage_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
    stage.mkdir(parents=True, exist_ok=False)
    try:
        try:
            z=zipfile.ZipFile(io.BytesIO(content))
        except zipfile.BadZipFile as e:
            raise HTTPException(400,"ZIP non valido") from e
        with z:
            names=z.namelist()
            if "autosalone_one.db" not in names:
                raise HTTPException(400,"Backup non valido: database mancante")
            total=sum(i.file_size for i in z.infolist())
            if total > 1024 * 1024 * 1024:
                raise HTTPException(413,"Backup espanso troppo grande")
            db_stage=stage/"autosalone_one.db"
            db_stage.write_bytes(z.read("autosalone_one.db"))
            ok,msg=database_integrity(db_stage)
            if not ok:
                raise HTTPException(400,f"Database del backup non valido: {msg}")
            uploads_stage=stage/"uploads"; uploads_stage.mkdir()
            for info in z.infolist():
                if not info.filename.startswith("uploads/") or info.is_dir():
                    continue
                # basename only: prevents path traversal.
                safe_name=Path(info.filename).name
                if not safe_name:
                    continue
                (uploads_stage/safe_name).write_bytes(z.read(info))
        safety=_create_backup_archive()
        # Exact restore after full validation and a safety backup. Use SQLite backup API so WAL state cannot leak into restored data.
        source=sqlite3.connect(db_stage)
        target=sqlite3.connect(DB_PATH)
        try:
            source.backup(target)
            target.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        finally:
            target.close(); source.close()
        for old in UPLOAD_DIR.iterdir():
            if old.is_file(): old.unlink()
        for src in uploads_stage.iterdir():
            if src.is_file(): shutil.copy2(src, UPLOAD_DIR/src.name)
        init_db()
        ok,msg=database_integrity()
        if not ok:
            raise HTTPException(500,f"Ripristino completato ma verifica fallita: {msg}")
        return {"restored":True,"safety_backup":safety["file"]}
    finally:
        shutil.rmtree(stage, ignore_errors=True)


@app.exception_handler(sqlite3.Error)
def sqlite_handler(request:Request, exc:sqlite3.Error):
    return JSONResponse(status_code=500,content={"detail":f"Errore database: {exc}"})
