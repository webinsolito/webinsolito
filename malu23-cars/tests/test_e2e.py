from datetime import date, timedelta
import io
import zipfile

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import main as m

client = TestClient(m.app)


def call(method, path, **kwargs):
    r = getattr(client, method)(path, **kwargs)
    assert r.status_code < 300, (path, r.status_code, r.text)
    if r.headers.get('content-type', '').startswith('application/json'):
        return r.json()
    return r


def reset_db():
    if m.DB_PATH.exists():
        m.DB_PATH.unlink()
    for folder in (m.UPLOAD_DIR, m.BACKUP_DIR):
        folder.mkdir(parents=True, exist_ok=True)
        for p in folder.iterdir():
            if p.is_file():
                p.unlink()
    m.init_db()


def test_complete_vehicle_lifecycle():
    reset_db()
    today = date.today()
    work_due = (today + timedelta(days=7)).isoformat()
    callback_due = (today + timedelta(days=1)).isoformat()
    delivery_day = (today + timedelta(days=16)).isoformat()

    v = call('post', '/api/vehicles', json={
        'acquisition_type': 'acquisto', 'brand': 'BMW', 'model': 'X1', 'version': 'xDrive18d',
        'plate': 'AB123CD', 'vin': 'WBA123456789ABCDE', 'mileage': 50000,
        'purchase_price': 18000, 'expected_sale_price': 22900, 'status': 'DA_CONTROLLARE'
    })
    vid = v['id']

    # Editing an existing card must work without duplication.
    v['color'] = 'Nero'
    edited = call('put', f'/api/vehicles/{vid}', json={
        **{k: v.get(k, '') for k in ['acquisition_type','brand','model','version','plate','vin','registration_date','fuel','transmission','color','notes','status']},
        'mileage': v['mileage'], 'purchase_price': v['purchase_price'], 'expected_sale_price': v['expected_sale_price']
    })
    assert edited['color'] == 'Nero'

    w = call('post', f'/api/vehicles/{vid}/works', json={
        'category': 'Interni', 'title': 'Lavaggio interno', 'due_date': work_due, 'expected_cost': 80
    })
    assert call('get', f'/api/vehicles/{vid}')['status'] == 'IN_PREPARAZIONE'
    call('post', f"/api/works/{w['id']}/complete?actual_cost=90")
    assert call('get', f'/api/vehicles/{vid}')['status'] == 'DA_FOTOGRAFARE'

    call('post', f'/api/vehicles/{vid}/expenses', json={
        'category': 'Trasporto', 'description': 'Bisarca', 'amount': 250, 'expense_date': today.isoformat()
    })
    assert call('get', f'/api/vehicles/{vid}')['total_invested'] == 18340.0

    buf = io.BytesIO()
    Image.new('RGB', (80, 60), 'white').save(buf, format='JPEG')
    img = buf.getvalue()
    for cat in m.PHOTO_REQUIRED:
        r = client.post(
            f'/api/vehicles/{vid}/photos', data={'category': cat, 'is_cover': 'false'},
            files={'file': ('a.jpg', img, 'image/jpeg')}
        )
        assert r.status_code == 200, r.text
    assert call('get', f'/api/vehicles/{vid}')['status'] == 'DA_PUBBLICARE'

    listing = call('post', f'/api/vehicles/{vid}/listing', json={
        'published_date': today.isoformat(), 'initial_price': 22900, 'current_price': 22500,
        'market_low': 21000, 'market_median': 22000, 'market_high': 23500
    })
    assert listing['analysis']['competitive'] == 22000
    assert call('get', f'/api/vehicles/{vid}')['status'] == 'IN_VENDITA'

    c = call('post', '/api/clients', json={
        'first_name': 'Mario', 'last_name': 'Rossi', 'phone': '3330000000',
        'fiscal_code': 'RSSMRA80A01H501U', 'interested_vehicle_id': vid,
        'status': 'TRATTATIVA', 'next_contact_date': callback_due, 'next_step': 'Confermare proposta'
    })

    im = Image.new('RGB', (900, 250), 'white')
    d = ImageDraw.Draw(im)
    d.text((30, 80), 'AB123CD WBA123456789ABCDE RSSMRA80A01H501U', fill='black')
    b = io.BytesIO(); im.save(b, format='PNG')
    r = client.post('/api/documents/upload', data={'vehicle_id': vid, 'doc_type': 'libretto'}, files={'file': ('libretto.png', b.getvalue(), 'image/png')})
    assert r.status_code == 200, r.text
    doc = r.json()
    r = client.post(f"/api/documents/{doc['id']}/confirm", json={'fields': doc['detected_fields']})
    assert r.status_code == 200, r.text

    contract = call('post', '/api/contracts', json={
        'vehicle_id': vid, 'client_id': c['id'], 'sale_price': 22500, 'deposit': 1000,
        'tradein_vehicle': {'brand': 'Fiat', 'model': '500', 'plate': 'CD456EF', 'mileage': 90000, 'purchase_price': 6000}
    })
    assert contract['tradein_vehicle_id']
    assert call('get', f'/api/vehicles/{vid}')['status'] == 'VENDUTA'
    pdf = client.get(contract['pdf_url'])
    assert pdf.status_code == 200 and pdf.content[:4] == b'%PDF'

    call('post', f'/api/vehicles/{vid}/delivery', json={'delivery_date': delivery_day, 'delivery_time': '17:00', 'notes': 'Consegna cliente'})
    v3 = call('get', f'/api/vehicles/{vid}')
    assert v3['status'] == 'DA_CONSEGNARE'
    assert len([t for t in v3['tasks'] if t['source'] == 'delivery']) == 5

    backup = call('post', '/api/backups/create')
    z = client.get(backup['url'])
    assert z.status_code == 200
    with zipfile.ZipFile(io.BytesIO(z.content)) as zz:
        assert 'autosalone_one.db' in zz.namelist()
        assert 'backup_meta.json' in zz.namelist()

    home = call('get', '/api/dashboard')
    assert 'summary' in home
    status = call('get', '/api/status')
    assert status['ok'] is True
    assert status['version'] == '1.13.1-malu23'
