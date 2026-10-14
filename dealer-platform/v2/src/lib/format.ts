export const money=(value?:number)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(value||0))
export const integer=(value?:number)=>new Intl.NumberFormat('it-IT').format(Number(value||0))
export const fullDate=(value?:string)=>{if(!value)return '—';const d=new Date(value.length<=10?`${value}T12:00:00`:value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)}
export const vehicleName=(v:{brand?:string;model?:string;version?:string})=>[v.brand,v.model,v.version].filter(Boolean).join(' ')||'Veicolo'
