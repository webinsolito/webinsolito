import {useEffect,useMemo,useRef,useState} from 'react'
import {CarFront,FileText,Search,UserRound,X} from 'lucide-react'
import {buildGlobalSearchResults,type GlobalSearchKind,type GlobalSearchResult} from '../domain/globalSearch'
import type {TenantData} from '../types'

const LABELS:Record<GlobalSearchKind,string>={VEHICLE:'AUTO',CUSTOMER:'CLIENTE',INVOICE:'FATTURA'}

export function GlobalSearch({data,financeVisible,onVehicle,onCustomer,onInvoice}:{data:TenantData;financeVisible:boolean;onVehicle:(id:string)=>void;onCustomer:(id:string)=>void;onInvoice:(id:string)=>void}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState('')
 const inputRef=useRef<HTMLInputElement>(null)
 const results=useMemo(()=>buildGlobalSearchResults(data,query,financeVisible),[data,query,financeVisible])
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(true)}if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[])
 useEffect(()=>{if(open)requestAnimationFrame(()=>inputRef.current?.focus());else setQuery('')},[open])
 const choose=(result:GlobalSearchResult)=>{setOpen(false);if(result.kind==='VEHICLE')onVehicle(result.id);else if(result.kind==='CUSTOMER')onCustomer(result.id);else onInvoice(result.id)}
 return <><button className="search-shell" type="button" aria-label="Apri ricerca globale" onClick={()=>setOpen(true)}><Search/><span>Cerca targa, telaio, cliente o fattura…</span><kbd>⌘K</kbd></button>
 {open&&<div className="global-search-backdrop" data-testid="global-search" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
  <section className="global-search-panel" role="dialog" aria-modal="true" aria-label="Ricerca globale">
   <div className="global-search-input"><Search/><input id="global-search" ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder={financeVisible?'Targa, telaio, cliente, telefono o fattura…':'Targa, telaio, cliente o telefono…'} aria-label="Ricerca globale"/><button aria-label="Chiudi ricerca" onClick={()=>setOpen(false)}><X/></button></div>
   <div className="global-search-hint">{query.trim().length<2?'Scrivi almeno 2 caratteri. Puoi usare anche una parte di targa, telaio o numero di telefono.':results.length?results.length+' risultati più pertinenti':'Nessun risultato trovato.'}</div>
   {results.length>0&&<div className="global-search-results">{results.map(result=>{const Icon=result.kind==='VEHICLE'?CarFront:result.kind==='CUSTOMER'?UserRound:FileText;return <button key={result.kind+':'+result.id} onClick={()=>choose(result)}><span className="global-result-icon"><Icon/></span><span className="global-result-copy"><small>{LABELS[result.kind]}</small><b>{result.title}</b><em>{result.subtitle}</em></span><span className="global-result-open">APRI</span></button>})}</div>}
  </section>
 </div>}</>
}
