const ACTIVE_SALE_STAGES=new Set(['OPEN','AGREED','DEPOSIT','BALANCE_PENDING','READY']);

export function canViewFinancialReports(profile={},demoMode=false){
  return demoMode||['ADMIN','AMMINISTRAZIONE'].includes(profile?.role)||profile?.permissions?.finance_view===true||profile?.permissions?.view_costs===true;
}

export function latestSaleContract(vehicleId,contracts=[]){
  return contracts
    .filter(c=>c&&!c.deleted_at&&c.vehicle_id===vehicleId&&c.template_code==='VENDITA'&&c.sale_stage!=='CANCELLED')
    .sort((a,b)=>String(b.delivered_at||b.contract_date||b.updated_at||'').localeCompare(String(a.delivered_at||a.contract_date||a.updated_at||'')))[0]||null;
}

export function saleInvoiceFor(vehicleId,contract,invoices=[]){
  const active=invoices.filter(i=>i&&!i.deleted_at&&i.invoice_type==='SALE');
  if(contract?.sale_invoice_id){const linked=active.find(i=>i.id===contract.sale_invoice_id);if(linked)return linked}
  return active.filter(i=>i.vehicle_id===vehicleId).sort((a,b)=>String(b.issue_date||b.updated_at||'').localeCompare(String(a.issue_date||a.updated_at||'')))[0]||null;
}

export function saleState(vehicle,contract){
  const stage=contract?.sale_stage||'';
  if(stage==='DELIVERED'||vehicle?.status==='CONSEGNATA'||vehicle?.status==='VENDUTA')return 'DELIVERED';
  if(ACTIVE_SALE_STAGES.has(stage)||vehicle?.status==='DA_CONSEGNARE')return 'PIPELINE';
  return 'STOCK';
}

export function commercialSaleAmount(vehicle,contract,invoice){
  const contractPrice=Number(contract?.price||0);if(contractPrice>0)return contractPrice;
  const invoiceTotal=Number(invoice?.total_amount||0);if(invoiceTotal>0)return invoiceTotal;
  return Math.max(0,Number(vehicle?.sale_price||0));
}

export function recognizedSaleDate(vehicle,contract,invoice){
  const state=saleState(vehicle,contract);if(state!=='DELIVERED')return '';
  return String(contract?.delivered_at||invoice?.issue_date||contract?.contract_date||vehicle?.sold_at||'').slice(0,10);
}

export function periodMatches(date,period='ALL',now=new Date()){
  if(period==='ALL')return true;if(!date)return false;
  const d=String(date).slice(0,10),year=String(now.getFullYear()),month=`${year}-${String(now.getMonth()+1).padStart(2,'0')}`;
  return period==='YEAR'?d.startsWith(year):d.startsWith(month);
}

export function openInvoiceAmount(invoice){
  if(!invoice||invoice.deleted_at||invoice.invoice_type!=='SALE')return 0;
  return Math.max(0,Number(invoice.total_amount||0)-Number(invoice.paid_amount||0));
}

export function isInvoiceOverdue(invoice,now=new Date()){
  const open=openInvoiceAmount(invoice);if(open<=0||!invoice?.due_date)return false;
  const due=new Date(`${String(invoice.due_date).slice(0,10)}T23:59:59`);
  return Number.isFinite(due.getTime())&&due.getTime()<now.getTime();
}

export function buildReportRows({vehicles=[],financials=[],costs=[],invoices=[],contracts=[]},now=new Date()){
  return vehicles.filter(v=>v&&!v.deleted_at).map(v=>{
    const financial=financials.find(f=>f.vehicle_id===v.id&&!f.deleted_at)||null;
    const purchase=Number(financial?.purchase_price||0);
    const expenses=costs.filter(c=>c.vehicle_id===v.id&&!c.deleted_at).reduce((sum,c)=>sum+Number(c.amount||0),0);
    const realCost=purchase+expenses;
    const contract=latestSaleContract(v.id,contracts),invoice=saleInvoiceFor(v.id,contract,invoices),state=saleState(v,contract);
    const agreedSale=commercialSaleAmount(v,contract,invoice);
    const recognizedSale=state==='DELIVERED'?agreedSale:0;
    const saleDate=recognizedSaleDate(v,contract,invoice);
    const purchaseDate=v.purchase_date||v.created_at;
    const purchaseTime=purchaseDate?new Date(purchaseDate).getTime():NaN;
    const stockDays=state==='DELIVERED'||!Number.isFinite(purchaseTime)?0:Math.max(0,Math.floor((now.getTime()-purchaseTime)/86400000));
    return {vehicle:v,purchase,expenses,realCost,contract,invoice,state,agreedSale,recognizedSale,saleDate,margin:state==='DELIVERED'?recognizedSale-realCost:null,stockDays};
  });
}

export function reportTotals(rows,invoices,period='ALL',now=new Date()){
  const stockRows=rows.filter(r=>r.state==='STOCK'),activeCapital=rows.filter(r=>r.state!=='DELIVERED').reduce((s,r)=>s+r.realCost,0);
  const delivered=rows.filter(r=>r.state==='DELIVERED'&&periodMatches(r.saleDate,period,now));
  const revenue=delivered.reduce((s,r)=>s+r.recognizedSale,0),margin=delivered.reduce((s,r)=>s+Number(r.margin||0),0);
  const saleInvoices=invoices.filter(i=>!i.deleted_at&&i.invoice_type==='SALE');
  const receivables=saleInvoices.reduce((s,i)=>s+openInvoiceAmount(i),0);
  const overdue=saleInvoices.filter(i=>isInvoiceOverdue(i,now)).reduce((s,i)=>s+openInvoiceAmount(i),0);
  return {
    stockCount:stockRows.length,
    pipelineCount:rows.filter(r=>r.state==='PIPELINE').length,
    activeCapital,
    deliveredCount:delivered.length,
    revenue,
    margin,
    receivables,
    overdue,
    aged60:stockRows.filter(r=>r.stockDays>=60).length,
    averageStockDays:Math.round(stockRows.reduce((s,r)=>s+r.stockDays,0)/Math.max(1,stockRows.length))
  };
}
