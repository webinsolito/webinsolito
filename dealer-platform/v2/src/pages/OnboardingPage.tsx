import {useMemo,useState} from 'react'
import {AlertTriangle,ArrowRight,Building2,CheckCircle2,Download,FileSpreadsheet,LogOut,Upload,UsersRound} from 'lucide-react'
import {completeOnboarding,importOnboardingVehicles,saveOnboardingCompany} from '../lib/onboardingApi'
import {downloadVehicleImportTemplate,parseVehicleImportFile,type VehicleImportPreview} from '../lib/vehicleImport'
import type {OnboardingCompanyDraft,OnboardingStatus,SessionPayload,View,VehicleImportResult} from '../types'

const field=(value:unknown)=>String(value??'')
export function OnboardingPage({session,status,onRefresh,onComplete,onLogout}:{session:SessionPayload;status:OnboardingStatus;onRefresh:()=>Promise<OnboardingStatus|void>;onComplete:(view:View)=>void;onLogout:()=>void}){
  const [step,setStep]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [preview,setPreview]=useState<VehicleImportPreview|null>(null),[fileName,setFileName]=useState(''),[result,setResult]=useState<VehicleImportResult|null>(null)
  const dealer=status.dealer,branch=status.primary_branch
  const [company,setCompany]=useState<OnboardingCompanyDraft>({
    display_name:field(dealer.display_name),legal_name:field(dealer.legal_name),vat_number:field(dealer.vat_number),contact_email:field(dealer.contact_email),phone:field(dealer.phone),
    branch_name:field(branch?.name||dealer.display_name),city:field(branch?.city),address:field(branch?.address)
  })
  const validRows=useMemo(()=>preview?.rows.filter(r=>!preview.errors.some(e=>e.row===r.source_row))||[],[preview])
  const set=(key:keyof OnboardingCompanyDraft,value:string)=>setCompany(x=>({...x,[key]:value}))
  async function saveCompany(){setBusy(true);setError('');try{await saveOnboardingCompany(session,company);await onRefresh();setStep(2)}catch(e){setError(e instanceof Error?e.message:'Impossibile salvare i dati')}finally{setBusy(false)}}
  async function chooseFile(file?:File){if(!file)return;setBusy(true);setError('');setResult(null);try{const next=await parseVehicleImportFile(file);setPreview(next);setFileName(file.name)}catch(e){setPreview(null);setFileName('');setError(e instanceof Error?e.message:'Impossibile leggere il file')}finally{setBusy(false)}}
  async function runImport(){if(!validRows.length)return;setBusy(true);setError('');try{const next=await importOnboardingVehicles(session,validRows);setResult(next);await onRefresh()}catch(e){setError(e instanceof Error?e.message:'Importazione non riuscita')}finally{setBusy(false)}}
  async function finish(target:View){setBusy(true);setError('');try{await completeOnboarding(session);onComplete(target)}catch(e){setError(e instanceof Error?e.message:'Impossibile completare la configurazione')}finally{setBusy(false)}}
  const steps=[['1','Concessionaria'],['2','Parco auto'],['3','Pronto']]
  return <main className="onboarding-page"><section className="onboarding-shell">
    <header className="onboarding-top"><div><span className="onboarding-brand">DEALER COCKPIT</span><h1>Mettiamo tutto a posto.</h1><p>Tre passaggi e il gestionale è pronto per lavorare.</p></div><button className="onboarding-exit" onClick={onLogout}><LogOut/>Esci</button></header>
    <div className="onboarding-progress">{steps.map(([n,label],i)=><div key={n} className={`${step>=i+1?'active':''} ${step>i+1?'done':''}`}><span>{step>i+1?<CheckCircle2/>:n}</span><b>{label}</b></div>)}</div>
    {error&&<div className="onboarding-error"><AlertTriangle/>{error}</div>}

    {step===1&&<section className="onboarding-card"><div className="onboarding-card-title"><span><Building2/></span><div><p>PASSO 1 DI 3</p><h2>Dati della concessionaria</h2><small>Li useremo come base per il tuo spazio di lavoro.</small></div></div>
      <div className="onboarding-form"><label><span>Nome visibile *</span><input value={company.display_name} onChange={e=>set('display_name',e.target.value)} placeholder="Autosalone Rossi"/></label><label><span>Ragione sociale *</span><input value={company.legal_name} onChange={e=>set('legal_name',e.target.value)} placeholder="Rossi Auto S.r.l."/></label><label><span>Partita IVA</span><input value={company.vat_number||''} onChange={e=>set('vat_number',e.target.value)} placeholder="IT01234567890"/></label><label><span>Email</span><input type="email" value={company.contact_email||''} onChange={e=>set('contact_email',e.target.value)} placeholder="info@autosalone.it"/></label><label><span>Telefono</span><input value={company.phone||''} onChange={e=>set('phone',e.target.value)} placeholder="030 0000000"/></label><label><span>Nome sede</span><input value={company.branch_name||''} onChange={e=>set('branch_name',e.target.value)} placeholder="Sede principale"/></label><label><span>Città</span><input value={company.city||''} onChange={e=>set('city',e.target.value)} placeholder="Brescia"/></label><label className="wide"><span>Indirizzo</span><input value={company.address||''} onChange={e=>set('address',e.target.value)} placeholder="Via Roma 1"/></label></div>
      <footer className="onboarding-actions"><div><b>1 minuto</b><span>Puoi modificare questi dati anche dopo.</span></div><button data-testid="onboarding-company-next" className="primary" disabled={busy||!company.display_name.trim()||!company.legal_name.trim()} onClick={()=>void saveCompany()}>{busy?'Salvataggio…':'Salva e continua'}<ArrowRight/></button></footer>
    </section>}

    {step===2&&<section className="onboarding-card"><div className="onboarding-card-title"><span><FileSpreadsheet/></span><div><p>PASSO 2 DI 3</p><h2>Porta dentro il parco auto</h2><small>Excel o CSV. Non devi reinserire 50 auto a mano.</small></div></div>
      <div className="import-stats"><div><span>AUTO GIÀ PRESENTI</span><b>{status.vehicle_count}</b></div><div><span>MAX PER IMPORT</span><b>250</b></div><button className="secondary" onClick={downloadVehicleImportTemplate}><Download/>Scarica modello CSV</button></div>
      <label className="import-drop"><input data-testid="onboarding-import-file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>void chooseFile(e.target.files?.[0])}/><Upload/><b>{fileName||'Scegli Excel o CSV'}</b><span>Riconosciamo automaticamente Marca, Modello, Targa, Telaio, Km, Prezzi e altro.</span></label>
      {preview&&<div className="import-preview"><div className="import-preview-head"><div><b>{preview.rows.length} righe lette</b><span>{validRows.length} pronte · {preview.errors.length} da correggere</span></div><span className="recognized">{preview.recognized.length} colonne riconosciute</span></div>
        {preview.errors.length>0&&<div className="import-errors"><b><AlertTriangle/> Controlla queste righe</b>{preview.errors.slice(0,5).map((x,i)=><span key={`${x.row}-${i}`}>{x.row?`Riga ${x.row}: `:''}{x.message}</span>)}{preview.errors.length>5&&<small>+ altre {preview.errors.length-5}</small>}</div>}
        <div className="import-table-wrap"><table><thead><tr><th>Riga</th><th>Auto</th><th>Targa / telaio</th><th>Km</th><th>Vendita</th><th>Acquisto</th></tr></thead><tbody>{preview.rows.slice(0,8).map(r=><tr key={r.source_row} className={preview.errors.some(e=>e.row===r.source_row)?'bad':''}><td>{r.source_row}</td><td><b>{r.brand} {r.model}</b><small>{r.version||'—'}</small></td><td>{r.plate||r.vin||'—'}</td><td>{r.mileage?.toLocaleString('it-IT')||'—'}</td><td>{r.asking_price!=null?`€ ${r.asking_price.toLocaleString('it-IT')}`:'—'}</td><td>{r.purchase_price!=null?`€ ${r.purchase_price.toLocaleString('it-IT')}`:'—'}</td></tr>)}</tbody></table></div>
        {result&&<div className="import-result"><CheckCircle2/><div><b>{result.inserted} auto importate</b><span>{result.skipped.length?`${result.skipped.length} duplicate saltate. `:''}{result.errors.length?`${result.errors.length} righe non valide.`:'Importazione completata.'}</span></div></div>}
      </div>}
      <footer className="onboarding-actions"><button className="text-button" disabled={busy} onClick={()=>setStep(3)}>{status.vehicle_count?'Continua':'Salta per ora'}</button><button data-testid="onboarding-import-submit" className="primary" disabled={busy||!validRows.length||Boolean(result)} onClick={()=>void runImport()}>{busy?'Importazione…':result?'Importato':`Importa ${validRows.length||''} auto`}<ArrowRight/></button></footer>
      {result&&<button className="after-import" onClick={()=>setStep(3)}>Continua alla fine <ArrowRight/></button>}
    </section>}

    {step===3&&<section className="onboarding-card onboarding-finish"><div className="finish-icon"><CheckCircle2/></div><p>PASSO 3 DI 3</p><h2>Dealer Cockpit è pronto.</h2><span>Hai già tutto ciò che serve per iniziare. Il resto lo completi lavorando.</span><div className="finish-summary"><div><Building2/><span>CONCESSIONARIA</span><b>{company.display_name||dealer.display_name}</b></div><div><FileSpreadsheet/><span>AUTO IN GARAGE</span><b>{status.vehicle_count}</b></div><div><UsersRound/><span>UTENTI ATTIVI</span><b>{status.member_count}</b></div></div>
      <div className="finish-actions"><button data-testid="onboarding-complete" className="primary big" disabled={busy} onClick={()=>void finish('today')}>{busy?'Preparazione…':'Entra nel gestionale'}<ArrowRight/></button><button className="secondary" disabled={busy} onClick={()=>void finish('staff')}><UsersRound/>Completa e aggiungi dipendenti</button></div>
    </section>}
  </section></main>
}
