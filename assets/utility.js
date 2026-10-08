(()=>{
  const W=window.Webinsolito=window.Webinsolito||{};
  const validDate=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d:null};

  W.euro=(n,d=2)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:d,maximumFractionDigits:d}).format(Number.isFinite(+n)?+n:0);

  W.n=(id,min=0,max=1e12)=>{
    const el=typeof id==='string'?document.getElementById(id):id;
    const v=Number(el?.value);
    if(!Number.isFinite(v))return min;
    return Math.min(max,Math.max(min,v));
  };

  W.days=(a,b)=>{
    const da=validDate(a),db=validDate(b);
    if(!da||!db)return 0;
    da.setHours(0,0,0,0);db.setHours(0,0,0,0);
    return Math.ceil((db-da)/86400000);
  };

  W.addMonths=(date,m)=>{
    const d=validDate(date);
    if(!d)return null;
    const day=d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth()+(Number(m)||0));
    const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    d.setDate(Math.min(day,last));
    return d;
  };

  W.date=d=>{
    const v=validDate(d);
    return v?new Intl.DateTimeFormat('it-IT').format(v):'—';
  };

  W.esc=s=>(s??'').toString().replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]));

  W.copy=async t=>{
    const value=String(t??'');
    try{await navigator.clipboard.writeText(value);W.toast?.('Copiato')}
    catch{prompt('Copia il testo:',value)}
  };

  W.resetForm=(id,scope=document)=>{
    document.getElementById(id)?.reset();
    scope.querySelectorAll?.('[data-result]').forEach(x=>x.textContent='—');
  };

  W.ics=(name,start,desc='')=>{
    const d=validDate(start);
    if(!d){W.toast?.('Data non valida');return false}
    const z=x=>x.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const txt=x=>String(x??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
    const end=new Date(d.getTime()+3600000);
    const uid='wi-'+Date.now()+'-'+Math.random().toString(36).slice(2,10)+'@webinsolito';
    const ics=[
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Webinsolito//IT','CALSCALE:GREGORIAN','BEGIN:VEVENT',
      'UID:'+uid,'DTSTAMP:'+z(new Date()),'DTSTART:'+z(d),'DTEND:'+z(end),
      'SUMMARY:'+txt(name),'DESCRIPTION:'+txt(desc),'END:VEVENT','END:VCALENDAR',''
    ].join('\r\n');
    const filename=(String(name||'evento').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'evento')+'.ics';
    W.download?.(filename,ics,'text/calendar;charset=utf-8');
    return true;
  };
})();
