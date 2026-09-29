import io
from datetime import date

import fitz
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import main as m


def reset_db():
    if m.DB_PATH.exists():
        m.DB_PATH.unlink()
    m.init_db()
    m.LOGIN_ATTEMPTS.clear()


def client():
    return TestClient(m.app)


def make_pdf(pages):
    pdf = fitz.open()
    for text in pages:
        p = pdf.new_page()
        y = 72
        for line in text.splitlines():
            p.insert_text((72, y), line, fontsize=11)
            y += 18
    data = pdf.tobytes()
    pdf.close()
    return data


def test_v112_pdf_is_split_classified_and_auto_linked_by_plate_vin():
    reset_db(); c = client()
    car = c.post('/api/vehicles', json={
        'brand':'BMW','model':'X1','plate':'AB123CD','vin':'WBA123456789ABCDE','status':'DA_CONTROLLARE'
    }).json()
    pdf = make_pdf([
        'CARTA DI CIRCOLAZIONE\nD.1 BMW\nD.3 X1\nAB123CD\nWBA123456789ABCDE\nP.1 1995\nP.3 DIESEL',
        'FATTURA N 88/2026\nTARGA AB123CD\nTAGLIANDO AUTO\nDATA 28/09/2026\nIMPONIBILE 245,90 EUR\nTOTALE 300,00 EUR',
        'Dettaglio lavori eseguiti\nFiltro olio e manutenzione ordinaria',
    ])
    r = c.post('/api/documents/upload', data={'doc_type':'auto'}, files={'file':('fascicolo.pdf', pdf, 'application/pdf')})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['summary']['pages'] == 3
    assert body['summary']['documents'] == 2
    assert body['summary']['auto_linked'] == 2
    docs = body['documents']
    assert [d['detected_doc_type'] for d in docs] == ['libretto','fattura']
    assert docs[0]['vehicle_id'] == car['id'] and docs[1]['vehicle_id'] == car['id']
    assert docs[1]['page_from'] == 2 and docs[1]['page_to'] == 3
    assert docs[1]['detected_fields_obj']['amount'] == 300.0


def test_v112_invoice_creates_one_tap_expense_and_is_idempotent():
    reset_db(); c = client()
    car = c.post('/api/vehicles', json={'brand':'Audi','model':'A3','plate':'CD456EF','status':'DA_CONTROLLARE'}).json()
    pdf = make_pdf(['FATTURA N 12/2026\nTARGA CD456EF\nTAGLIANDO\nDATA 28/09/2026\nTOTALE 480,00 EUR'])
    up = c.post('/api/documents/upload', data={'doc_type':'auto'}, files={'file':('fattura.pdf',pdf,'application/pdf')}).json()
    actions = c.get('/api/document-actions?status=PENDING').json()
    assert len(actions) == 1 and actions[0]['action_type'] == 'CREATE_EXPENSE'
    payload = actions[0]['payload']
    assert payload['vehicle_id'] == car['id'] and payload['amount'] == 480.0
    assert payload['category'] == 'Tagliando'
    a = actions[0]
    first = c.post(f"/api/document-actions/{a['id']}/apply")
    assert first.status_code == 200, first.text
    second = c.post(f"/api/document-actions/{a['id']}/apply")
    assert second.status_code == 200 and second.json()['already_applied'] is True
    detail = c.get(f"/api/vehicles/{car['id']}").json()
    assert len(detail['expenses']) == 1
    assert detail['expenses'][0]['amount'] == 480.0
    docs = c.get('/api/documents').json()
    assert docs[0]['confirmed'] == 1


def test_v112_libretto_without_existing_vehicle_proposes_create_vehicle():
    reset_db(); c = client()
    pdf = make_pdf(['CARTA DI CIRCOLAZIONE\nD.1 AUDI\nD.3 A3\nEF789GH\nWAUZZZ8V0HA123456\nP.1 1598\nP.3 DIESEL'])
    r = c.post('/api/documents/upload', data={'doc_type':'auto'}, files={'file':('libretto.pdf',pdf,'application/pdf')})
    assert r.status_code == 200, r.text
    assert r.json()['summary']['to_review'] == 1
    actions = c.get('/api/document-actions?status=PENDING').json()
    assert len(actions) == 1 and actions[0]['action_type'] == 'CREATE_VEHICLE'
    applied = c.post(f"/api/document-actions/{actions[0]['id']}/apply")
    assert applied.status_code == 200, applied.text
    vid = applied.json()['vehicle_id']
    v = c.get(f'/api/vehicles/{vid}').json()
    assert v['plate'] == 'EF789GH'
    assert v['vin'] == 'WAUZZZ8V0HA123456'
    assert v['brand'] == 'AUDI' and v['model'] == 'A3'
    assert v['status'] == 'DA_CONTROLLARE'
    assert c.get('/api/documents').json()[0]['confirmed'] == 1


def test_v112_manual_link_turns_unowned_receipt_into_expense_suggestion():
    reset_db(); c = client()
    car = c.post('/api/vehicles', json={'brand':'Fiat','model':'500','plate':'GH123JK','status':'DA_CONTROLLARE'}).json()
    pdf = make_pdf(['RICEVUTA\nLAVAGGIO INTERNO\nDATA 28/09/2026\nTOTALE 35,00 EUR'])
    up = c.post('/api/documents/upload', data={'doc_type':'auto'}, files={'file':('ricevuta.pdf',pdf,'application/pdf')}).json()
    doc = up['documents'][0]
    assert doc['vehicle_id'] is None
    assert c.get('/api/document-actions?status=PENDING').json() == []
    link = c.post(f"/api/documents/{doc['id']}/link", json={'vehicle_id':car['id']})
    assert link.status_code == 200, link.text
    assert len(link.json()['actions']) == 1
    action = c.get('/api/document-actions?status=PENDING').json()[0]
    assert action['action_type'] == 'CREATE_EXPENSE'
    assert action['payload']['vehicle_id'] == car['id']


def test_v112_dashboard_surfaces_documents_and_smart_actions():
    reset_db(); c = client()
    car = c.post('/api/vehicles', json={'brand':'VW','model':'Golf','plate':'LM123NO','status':'DA_CONTROLLARE'}).json()
    pdf = make_pdf(['FATTURA\nTARGA LM123NO\nTOTALE 99,00 EUR'])
    c.post('/api/documents/upload', data={'doc_type':'auto'}, files={'file':('f.pdf',pdf,'application/pdf')})
    dash = c.get('/api/dashboard').json()
    assert dash['summary']['documents_review'] == 1
    assert dash['summary']['smart_actions'] == 1
    assert len(dash['document_attention']) == 1
    assert len(dash['document_actions']) == 1


def test_v112_classifier_and_generic_extractors_cover_dealer_documents():
    fields = m.extract_smart_fields('FATTURA N 77/26\nDATA 28/09/2026\nTOTALE 1.234,56 EUR\nAB123CD')
    assert fields['amount'] == 1234.56
    assert fields['document_date'] == '2026-09-28'
    assert fields['plate'] == 'AB123CD'
    kind, conf = m.classify_document_text('FATTURA\nIMPONIBILE\nPARTITA IVA\nTOTALE 100,00', fields)
    assert kind == 'fattura' and conf >= 0.7
    assert m.infer_expense_category('tagliando filtro olio') == 'Tagliando'
    assert m.infer_expense_category('pneumatici anteriori') == 'Pneumatici'


def test_v112_real_image_ocr_if_tesseract_is_available():
    if not m.shutil.which('tesseract'):
        pytest.skip('Tesseract non disponibile')
    reset_db(); c = client()
    car = c.post('/api/vehicles', json={'brand':'BMW','model':'X1','plate':'AB123CD','status':'DA_CONTROLLARE'}).json()
    img = Image.new('RGB', (1500, 600), 'white')
    d = ImageDraw.Draw(img)
    d.text((60,80),'FATTURA', fill='black')
    d.text((60,170),'TARGA AB123CD', fill='black')
    d.text((60,260),'TAGLIANDO', fill='black')
    d.text((60,350),'TOTALE 250,00 EUR', fill='black')
    b=io.BytesIO(); img.save(b,format='PNG')
    r = c.post('/api/documents/upload', data={'vehicle_id':car['id'],'doc_type':'auto'}, files={'file':('foto.png',b.getvalue(),'image/png')})
    assert r.status_code == 200, r.text
    doc = r.json()['documents'][0]
    assert doc['vehicle_id'] == car['id']
    assert doc['detected_doc_type'] in {'fattura','ricevuta'}


def test_v112_frontend_exposes_document_brain_zero_sbatti_flow():
    js = (m.STATIC_DIR/'app.js').read_text(encoding='utf-8')
    css = (m.STATIC_DIR/'style.css').read_text(encoding='utf-8')
    for token in ['DOCUMENT BRAIN','Fai una foto. Al resto penso io.','PDF multipagina divisi','/api/document-actions/','Scatta / carica']:
        assert token in js
    assert '.document-brain-hero' in css and '.smart-capture-hero' in css


def test_document_brain_schema_is_12_and_version_is_113():
    reset_db(); c=client()
    assert c.get('/api/status').json()['version']=='1.13.1-malu23'
    with m.db() as conn:
        assert conn.execute("SELECT value FROM app_meta WHERE key='schema_version'").fetchone()[0]=='12'
        cols={r[1] for r in conn.execute('PRAGMA table_info(documents)').fetchall()}
        assert {'batch_id','confidence','auto_linked','analysis_state','page_from','page_to','detected_doc_type'} <= cols
        assert conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='document_actions'").fetchone()
