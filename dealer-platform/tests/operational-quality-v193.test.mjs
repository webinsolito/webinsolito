import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('vehicle identity and cost integrity are enforced server-side',async()=>{
  const sql=await read('supabase/migrations/0016_operational_quality_v193.sql');
  assert.match(sql,/vehicle_vin_invalid/);
  assert.match(sql,/vehicle_plate_required/);
  assert.match(sql,/vehicle_vin_required/);
  assert.match(sql,/vehicles_active_plate_unique/);
  assert.match(sql,/vehicles_active_vin_unique/);
  assert.match(sql,/vehicle_costs_amount_positive/);
  assert.match(sql,/vehicle_cost_dealer_mismatch/);
});

test('garage runtime blocks duplicates, invalid publish data and bad costs',async()=>{
  const source=await read('operational-quality.js');
  assert.match(source,/findVehicleDuplicate/);
  assert.match(source,/VIN non valido/);
  assert.match(source,/Aggiungi almeno una foto/);
  assert.match(source,/Targa già presente nel Garage/);
  assert.match(source,/Spesa su:/);
  assert.match(source,/Inserisci un importo spesa maggiore di zero/);
  assert.match(source,/Cliente:/);
});

test('crm surfaces next action, last contact and vehicle link',async()=>{
  const source=await read('operational-quality.js');
  assert.match(source,/Prossima azione da definire/);
  assert.match(source,/Ultimo:/);
  assert.match(source,/Nessuna auto collegata/);
  assert.match(source,/customer_vehicle_interests/);
});

test('mobile shell exposes four primary tabs plus Altro',async()=>{
  const source=await read('mobile-shell.js');
  assert.match(source,/\['today','garage','clients','calendar'\]/);
  assert.match(source,/ALTRO/);
  assert.match(source,/m23-more-sheet/);
  assert.match(source,/m23-mobile-extra/);
});

test('phone finance and reports no longer require horizontal canvases',async()=>{
  const css=await read('readability.css');
  assert.match(css,/\.fin-row,\.rep-row\{min-width:0!important/);
  assert.match(css,/\.fin-head,\.rep-head\{display:none!important/);
  assert.match(css,/content:'ACQUISTO'/);
  assert.match(css,/content:'MARGINE'/);
});

test('newer runtime keeps v1.9.3 operational modules loaded',async()=>{
  const [config,sw,preview]=await Promise.all([read('config.js'),read('sw.js'),read('preview.html')]);
  assert.match(config,/version: '1\.9\.4'/);
  assert.match(config,/operational-quality\.js\?v=1\.9\.3/);
  assert.match(config,/mobile-shell\.js\?v=1\.9\.3/);
  assert.match(sw,/dealer-platform-v1\.9\.4-static-only/);
  assert.match(sw,/operational-quality\.js\?v=1\.9\.3/);
  assert.match(sw,/mobile-shell\.js\?v=1\.9\.3/);
  assert.match(preview,/preview-1\.9\.4/);
});
