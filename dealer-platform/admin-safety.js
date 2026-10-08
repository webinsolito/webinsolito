import {permissionAllowedForRole} from './admin-policy.js';

const SESSION_KEY='dealer-platform-session';
const SENSITIVE=new Set(['invoices_view','invoices_write','finance_view','view_costs','reports_view']);

function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function isAdmin(){return session()?.profile?.role==='ADMIN'||window.DEALER_CONFIG?.demoMode}

export function applyAdminNavigationPolicy(){
  if(typeof document==='undefined')return;
  const allowed=isAdmin();
  document.querySelectorAll('.navbtn[data-view="admin"]').forEach(el=>el.hidden=!allowed);
  document.querySelectorAll('button[onclick*="data-view=admin"]').forEach(el=>el.hidden=!allowed);
}

export function applyRolePermissionPolicy(root=document){
  const form=root.querySelector?.('#admMemberForm');if(!form)return;
  const select=form.querySelector('select[name="role"]');if(!select)return;
  const role=String(select.value||'').toUpperCase();
  form.querySelectorAll('input[type="checkbox"][name^="perm_"]').forEach(input=>{
    const key=input.name.slice(5),allowed=permissionAllowedForRole(role,key);
    input.disabled=!allowed;
    if(!allowed)input.checked=false;
    input.closest('.adm-perm')?.classList.toggle('adm-perm-locked',!allowed);
  });
  let note=form.querySelector('#admRolePolicyNote');
  if(role==='VENDITORE'){
    if(!note){note=document.createElement('div');note.id='admRolePolicyNote';note.className='adm-warning adm-field wide';form.querySelector('.adm-perms')?.after(note)}
    note.textContent='Il Venditore non può ricevere accesso a fatture complete, costi, finanze o report economici. Può vedere il prezzo di vendita, non costo di acquisto o margine.';
  }else note?.remove();
  for(const key of SENSITIVE){const input=form.querySelector(`[name="perm_${key}"]`);if(input&&role==='VENDITORE')input.checked=false}
}

function bindAdminModal(){
  const overlay=document.getElementById('adminOverlay');if(!overlay)return;
  applyRolePermissionPolicy(overlay);
  const role=overlay.querySelector('select[name="role"]');if(role&&!role.dataset.adminSafetyBound){role.dataset.adminSafetyBound='1';role.addEventListener('change',()=>applyRolePermissionPolicy(overlay))}
}

export function initAdminSafety(){
  if(typeof window==='undefined'||typeof document==='undefined')return;
  const start=()=>{
    applyAdminNavigationPolicy();bindAdminModal();
    document.addEventListener('click',e=>{
      const adminTarget=e.target.closest?.('.navbtn[data-view="admin"],button[onclick*="data-view=admin"]');
      if(adminTarget&&!isAdmin()){e.preventDefault();e.stopImmediatePropagation();alert('Accesso riservato agli amministratori della concessionaria.')}} ,true);
    const observer=new MutationObserver(()=>{applyAdminNavigationPolicy();bindAdminModal()});observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('dealer:session',applyAdminNavigationPolicy);
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
}

if(typeof window!=='undefined')initAdminSafety();
