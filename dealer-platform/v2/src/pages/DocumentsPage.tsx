import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {AlertTriangle,ArrowLeft,Camera,CheckCircle2,ExternalLink,FileText,Loader2,Receipt,ScanText,ShieldCheck,Upload} from 'lucide-react'
import {confirmExpenseDocument,createExpenseDocument,listExpenseDocuments,openPrivateDocument,uploadExpenseDocument} from '../lib/documentApi'
import {extractExpenseFromFile,type OcrProgress} from '../lib/documentOcr'
import type {DocumentRecord,ExpenseConfirmDraft,SessionPayload,Vehicle} from '../types'

const CATEGORIES=['OFFICINA','RICAMBI','CARROZZERIA','PNEUMATICI','TRASPORTO','PREPARAZIONE','PRATICHE','ALTRO']
const money=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'})
const day=(value?:string|null)=>value?new Intl.DateTimeFormat('it-IT').format(new Date(`${value.slice(0,10)}T12:00:00`)):'—'
const vehicleLabel=(vehicle?:Vehicle)=>vehicle?`${vehicle.brand||''} ${vehicle.model||''}${vehicle.plate?` · ${vehicle.plate}`:''}`.trim():'Auto non trovata'

export function DocumentsPage({session,vehicles,onBack,onCostsChanged}:{session:SessionPayload;vehicles:Vehicle[];onBack:()=>void;onCostsChanged:()=>Promise<void>|void}){
  const cameraRef=useRef<HTMLInputElement>(null),fileRef=useRef<HTMLInputElement>(null)
  const [docs,setDocs]=useState<DocumentRecord[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[ocr,setOcr]=useState<OcrProgress|null>(null),[ocrBusy,setOcrBusy]=useState(false),[saveBusy,setSaveBusy]=useState(false),[pendingDocumentId,setPendingDocumentId]=useState('')
  const [draft,setDraft]=useState({supplier:'',amount:'',occurred_on:'',category:'ALTRO',vehicle_id:'',invoice_number:'',detected_plate:'',detected_vin:'',confidence:0,pagesAnalyzed:1,pageCount:1})

  const refresh=useCallback(async()=>{setLoading(true);setError('');try{const result=await listExpenseDocuments(session);setDocs(result.documents||[])}catch(err){setError(err instanceof Error?err.message:'Impossibile caricare i documenti')}finally{setLoading(false)}},[session])
  useEffect(()=>{void refresh()},[refresh])
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview])

  const choose=async(next:File|null)=>{
    if(!next)return
    setError('');setSuccess('');setPendingDocumentId('');setFile(next);if(preview)URL.revokeObjectURL(preview);setPreview(next.type.startsWith('image/')?URL.createObjectURL(next):'')
    setDraft({supplier:'',amount:'',occurred_on:'',category:'ALTRO',vehicle_id:'',invoice_number:'',detected_plate:'',detected_vin:'',confidence:0,pagesAnalyzed:1,pageCount:1})
    setOcrBusy(true);setOcr({stage:'prepare',progress:0,label:'Preparo il documento'})
    try{const result=await extractExpenseFromFile(next,vehicles,setOcr);setDraft({supplier:result.supplier,amount:result.amount===null?'':String(result.amount),occurred_on:result.occurredOn,category:result.category,vehicle_id:result.vehicleId,invoice_number:result.invoiceNumber,detected_plate:result.detectedPlate,detected_vin:result.detectedVin,confidence:result.confidence,pagesAnalyzed:result.pagesAnalyzed,pageCount:result.pageCount});if(!result.text.trim())setError('Non sono riuscito a leggere il testo: puoi compilare i campi manualmente.')}
    catch(err){setError(`${err instanceof Error?err.message:'OCR non riuscito'} Puoi comunque compilare i dati manualmente.`)}finally{setOcrBusy(false)}
  }

  const selectedVehicle=useMemo(()=>vehicles.find(v=>v.id===draft.vehicle_id),[vehicles,draft.vehicle_id])
  const confirm=async()=>{
    if(!file)return setError('Seleziona prima una foto o un PDF.')
    const amount=Number(String(draft.amount).replace(',','.'))
    if(!draft.vehicle_id)return setError('Seleziona l’auto a cui associare la spesa.')
    if(!Number.isFinite(amount)||amount<=0)return setError('Controlla l’importo della spesa.')
    if(!draft.occurred_on)return setError('Controlla la data del documento.')
    setSaveBusy(true);setError('');setSuccess('')
    try{
      let documentId=pendingDocumentId
      if(!documentId){const created=await createExpenseDocument(file,session);documentId=created.document.id;setPendingDocumentId(documentId)}
      await uploadExpenseDocument(documentId,file,session)
      const payload:ExpenseConfirmDraft={vehicle_id:draft.vehicle_id,supplier:draft.supplier.trim()||null,amount,occurred_on:draft.occurred_on,category:draft.category,invoice_number:draft.invoice_number.trim()||null}
      await confirmExpenseDocument(documentId,payload,session)
      setSuccess(`Spesa registrata su ${vehicleLabel(selectedVehicle)}.`);setFile(null);setPreview('');setPendingDocumentId('');setOcr(null);setDraft({supplier:'',amount:'',occurred_on:'',category:'ALTRO',vehicle_id:'',invoice_number:'',detected_plate:'',detected_vin:'',confidence:0,pagesAnalyzed:1,pageCount:1});await Promise.all([refresh(),Promise.resolve(onCostsChanged())])
    }catch(err){setError(err instanceof Error?err.message:'Salvataggio non riuscito')}finally{setSaveBusy(false)}
  }

  return <div className="documents-page">
    <div className="documents-top"><button className="documents-back" onClick={onBack}><ArrowLeft/>Altro</button><div className="documents-lock"><ShieldCheck/>Archivio privato</div></div>
    <div className="page-heading"><div><p className="eyebrow">DOCUMENTI + OCR</p><h1>Spese senza ricopiare</h1><p>Fotografa o carica la fattura: il gestionale propone i dati e tu li confermi.</p></div><div className="mini-stat"><span>ARCHIVIATI</span><b>{docs.filter(d=>d.storage_state==='CLOUD').length}</b></div></div>

    <section className="document-capture-card">
      <div className="capture-copy"><span className="capture-icon"><ScanText/></span><div><p className="eyebrow">NUOVA SPESA</p><h2>Foto o PDF → costo auto</h2><p>L’OCR lavora sul dispositivo. Prima di salvare puoi correggere ogni campo.</p></div></div>
      <div className="capture-actions">
        <button className="camera-action" onClick={()=>cameraRef.current?.click()}><Camera/>Scatta foto</button>
        <button className="file-action" onClick={()=>fileRef.current?.click()}><Upload/>Scegli PDF o foto</button>
        <input ref={cameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={e=>{void choose(e.target.files?.[0]||null);e.currentTarget.value=''}}/>
        <input ref={fileRef} hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={e=>{void choose(e.target.files?.[0]||null);e.currentTarget.value=''}}/>
      </div>
    </section>

    {error&&<div className="document-message error"><AlertTriangle/>{error}</div>}
    {success&&<div className="document-message success"><CheckCircle2/>{success}</div>}

    {file&&<section className="ocr-workbench">
      <div className="ocr-file-panel">{preview?<img src={preview} alt="Anteprima documento"/>:<div className="pdf-preview"><FileText/><b>{file.name}</b><span>{(file.size/1024/1024).toFixed(1)} MB</span></div>}{ocrBusy&&<div className="ocr-overlay"><Loader2 className="spin"/><b>{ocr?.label||'Lettura in corso…'}</b><div><span style={{width:`${Math.max(6,(ocr?.progress||0)*100)}%`}}/></div></div>}</div>
      <div className="ocr-fields">
        <div className="ocr-heading"><div><p className="eyebrow">CONTROLLA E CONFERMA</p><h2>{ocrBusy?'Sto leggendo il documento…':'Dati proposti'}</h2></div>{!ocrBusy&&draft.confidence>0&&<span className={`confidence ${draft.confidence>=70?'good':''}`}>OCR {draft.confidence}%</span>}</div>
        {draft.pageCount>3&&<div className="pdf-note">PDF di {draft.pageCount} pagine: analizzate le prime {draft.pagesAnalyzed}; il file completo verrà comunque archiviato.</div>}
        {(draft.detected_plate||draft.detected_vin)&&<div className="detected-row">Rilevato: {draft.detected_plate&&<b>{draft.detected_plate}</b>}{draft.detected_vin&&<b>{draft.detected_vin}</b>}</div>}
        <div className="document-form-grid">
          <label className="wide">Fornitore<input value={draft.supplier} onChange={e=>setDraft(v=>({...v,supplier:e.target.value}))} placeholder="Es. Officina Rossi"/></label>
          <label>Importo €<input inputMode="decimal" value={draft.amount} onChange={e=>setDraft(v=>({...v,amount:e.target.value}))} placeholder="0,00"/></label>
          <label>Data<input type="date" value={draft.occurred_on} onChange={e=>setDraft(v=>({...v,occurred_on:e.target.value}))}/></label>
          <label>Categoria<select value={draft.category} onChange={e=>setDraft(v=>({...v,category:e.target.value}))}>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Numero fattura<input value={draft.invoice_number} onChange={e=>setDraft(v=>({...v,invoice_number:e.target.value}))} placeholder="Facoltativo"/></label>
          <label className="wide">Auto<select value={draft.vehicle_id} onChange={e=>setDraft(v=>({...v,vehicle_id:e.target.value}))}><option value="">Seleziona auto…</option>{vehicles.map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></label>
        </div>
        <button className="confirm-expense" disabled={ocrBusy||saveBusy} onClick={()=>void confirm()}>{saveBusy?<Loader2 className="spin"/>:<CheckCircle2/>}{saveBusy?'Archivio e registro…':'Conferma e archivia'}</button>
      </div>
    </section>}

    <section className="documents-archive"><div className="section-title"><h2>Archivio spese</h2><p>Documento originale + costo collegato al veicolo.</p></div>{loading?<div className="documents-loading"><Loader2 className="spin"/>Carico archivio…</div>:docs.length===0?<div className="empty-state">Nessuna spesa archiviata. Carica la prima fattura qui sopra.</div>:<div className="document-list">{docs.map(doc=>{const vehicle=vehicles.find(v=>v.id===(doc.cost?.vehicle_id||doc.vehicle_id));return <article key={doc.id} className="document-row"><span className="document-type"><Receipt/></span><div className="document-copy"><b>{doc.cost?.supplier||doc.title||doc.original_name}</b><span>{vehicle?vehicleLabel(vehicle):'Da associare'} · {day(doc.cost?.occurred_on||doc.document_date)}</span><small>{doc.original_name}</small></div><div className="document-amount">{doc.cost?.amount!==undefined?money.format(Number(doc.cost.amount)):<em>DA COMPLETARE</em>}</div><button disabled={doc.storage_state!=='CLOUD'} onClick={()=>void openPrivateDocument(doc.id,session)} aria-label="Apri documento"><ExternalLink/></button></article>})}</div>}</section>
  </div>
}
