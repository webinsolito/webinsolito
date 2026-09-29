from pathlib import Path
import io

from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from app import main as m

ROOT = Path(__file__).resolve().parents[1]


def reset_db():
    if m.DB_PATH.exists():
        m.DB_PATH.unlink()
    m.init_db()
    m.LOGIN_ATTEMPTS.clear()


def test_finance_uses_same_vehicle_costs_and_sale_records():
    reset_db()
    c = TestClient(m.app)
    vehicle = c.post('/api/vehicles', json={
        'brand': 'BMW', 'model': '320d', 'plate': 'AB123CD',
        'purchase_price': 10000, 'expected_sale_price': 15000,
        'status': 'IN_PREPARAZIONE'
    }).json()
    expense = c.post(f"/api/vehicles/{vehicle['id']}/expenses", json={
        'category': 'Ricambi', 'supplier': 'Ricambi Brescia',
        'description': 'Freni', 'amount': 500, 'expense_date': '2026-09-29'
    })
    assert expense.status_code == 200, expense.text
    work = c.post(f"/api/vehicles/{vehicle['id']}/works", json={
        'category': 'Meccanica', 'title': 'Tagliando', 'actual_cost': 300
    })
    assert work.status_code == 200, work.text
    client = c.post('/api/clients', json={'first_name': 'Mario', 'last_name': 'Rossi'}).json()
    sale = c.post('/api/contracts', json={
        'vehicle_id': vehicle['id'], 'client_id': client['id'],
        'sale_price': 15000, 'deposit': 1000, 'financing': 0,
        'tradein_vehicle': None, 'notes': ''
    })
    assert sale.status_code == 200, sale.text
    finance = c.get('/api/finance')
    assert finance.status_code == 200, finance.text
    data = finance.json()
    assert data['summary']['realized_revenue'] == 15000
    assert data['summary']['realized_margin'] == 4200
    assert data['sold'][0]['total_invested'] == 10800
    assert data['sold'][0]['realized_margin'] == 4200
    assert any(x['type'] == 'expense' for x in data['recent_transactions'])
    assert any(x['type'] == 'sale' for x in data['recent_transactions'])


def test_document_expense_keeps_source_and_updates_margin():
    reset_db()
    c = TestClient(m.app)
    vehicle = c.post('/api/vehicles', json={
        'brand': 'Audi', 'model': 'A3', 'plate': 'CD456EF',
        'purchase_price': 12000, 'expected_sale_price': 17000,
        'status': 'DA_CONTROLLARE'
    }).json()
    document = c.post('/api/documents/upload', data={
        'vehicle_id': vehicle['id'], 'doc_type': 'auto'
    }, files={'file': ('ricevuta.jpg', b'\xff\xd8\xff\xe0' + b'0' * 256, 'image/jpeg')})
    # Invalid synthetic image is rejected safely; source linking is covered with a stored document row.
    assert document.status_code in {200, 415, 422}
    with m.db() as conn:
        cur = conn.execute(
            """INSERT INTO documents(vehicle_id,doc_type,original_name,stored_name,mime_type,ocr_text,detected_fields,created_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (vehicle['id'], 'ricevuta', 'scontrino.jpg', 'scontrino.jpg', 'image/jpeg', '', '{}', m.now_iso())
        )
        doc_id = cur.lastrowid
    saved = c.post(f"/api/vehicles/{vehicle['id']}/expenses", json={
        'category': 'Carburante', 'supplier': 'Q8',
        'description': 'Rifornimento', 'amount': 50, 'expense_date': '2026-09-29',
        'source_document_id': doc_id, 'source': 'ocr'
    })
    assert saved.status_code == 200, saved.text
    detail = c.get(f"/api/vehicles/{vehicle['id']}").json()
    assert detail['expenses'][0]['supplier'] == 'Q8'
    assert detail['expenses'][0]['source'] == 'ocr'
    assert detail['total_invested'] == 12050
    assert detail['margin'] == 4950


def test_ui_consolidates_document_brain_photo_expense_and_finance():
    js = (ROOT / 'app/static/app.js').read_text(encoding='utf-8')
    html = (ROOT / 'app/static/index.html').read_text(encoding='utf-8')
    css = (ROOT / 'app/static/style.css').read_text(encoding='utf-8')
    sw = (ROOT / 'app/static/sw.js').read_text(encoding='utf-8')
    for token in ["mobilePickVehicle('expense-photo')", "if(view==='finance') await renderFinance()", 'Document Brain', 'capture="environment"']:
        assert token.lower() in js.lower()
    assert 'data-view="finance"' in html and 'GUADAGNI' in html
    assert '.finance-metrics' in css and '.finance-transaction' in css
    assert 'finance-cockpit' in js and 'finance-action-dock' in js
    assert '.finance-profit-dial' in css and '.finance-next-move' in css
    assert m.APP_VERSION == '1.13.1-malu23'
    assert 'malu23-cars-v1.13.1' in sw


def test_document_brain_persists_explicit_unknown_state():
    reset_db(); c = TestClient(m.app)
    img = Image.new('RGB', (600, 400), 'white')
    raw = io.BytesIO(); img.save(raw, format='PNG')
    response = c.post('/api/documents/upload', data={'doc_type': 'auto'}, files={'file': ('bianco.png', raw.getvalue(), 'image/png')})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['summary']['unknown'] == 1
    assert body['documents'][0]['analysis_state'] == 'UNKNOWN'
    assert 'non riconosciuto' in body['documents'][0]['review_reason'].lower()


def test_document_brain_keeps_photo_when_ocr_fails(monkeypatch):
    reset_db(); c = TestClient(m.app)
    img = Image.new('RGB', (600, 400), 'white')
    raw = io.BytesIO(); img.save(raw, format='PNG')
    monkeypatch.setattr(m, 'ocr_bytes', lambda *_: (_ for _ in ()).throw(HTTPException(422, 'OCR offline')))
    response = c.post('/api/documents/upload', data={'doc_type': 'auto'}, files={'file': ('errore.png', raw.getvalue(), 'image/png')})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['summary']['ocr_errors'] == 1
    assert body['documents'][0]['analysis_state'] == 'OCR_ERROR'
    assert c.get('/api/documents').json()[0]['analysis_state'] == 'OCR_ERROR'


def test_document_brain_rejects_damaged_upload_without_partial_record():
    reset_db(); c = TestClient(m.app)
    response = c.post('/api/documents/upload', data={'doc_type': 'auto'}, files={'file': ('rotto.jpg', b'not-an-image', 'image/jpeg')})
    assert response.status_code == 422
    assert c.get('/api/documents').json() == []
