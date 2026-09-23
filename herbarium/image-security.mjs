export const MAX_INPUT_BYTES=12*1024*1024;
export const MAX_IMAGE_EDGE=1600;
export const JPEG_QUALITY=0.78;

const ascii=(bytes,start,len)=>String.fromCharCode(...bytes.slice(start,start+len));
export function sniffImageBytes(bytes){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
  if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return'image/jpeg';
  if(b.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v,i)=>b[i]===v))return'image/png';
  if(b.length>=12&&ascii(b,0,4)==='RIFF'&&ascii(b,8,4)==='WEBP')return'image/webp';
  if(b.length>=12&&ascii(b,4,4)==='ftyp'){
    const brand=ascii(b,8,4);
    if(['heic','heix','hevc','hevx','mif1','msf1'].includes(brand))return'image/heic';
    if(['avif','avis'].includes(brand))return'image/avif';
  }
  return null;
}
export function declaredMimeCompatible(declared,detected){
  if(!declared)return true;
  const d=declared.toLowerCase();
  if(!d.startsWith('image/'))return false;
  if(d===detected)return true;
  if(d==='image/jpg'&&detected==='image/jpeg')return true;
  if((d==='image/heif'||d==='image/heic')&&detected==='image/heic')return true;
  return false;
}
export async function inspectImageFile(file,{maxBytes=MAX_INPUT_BYTES}={}){
  if(!file||typeof file.slice!=='function')return{ok:false,reason:'missing-file',detected:null};
  if(Number.isFinite(file.size)&&file.size<=0)return{ok:false,reason:'empty-file',detected:null};
  if(Number.isFinite(file.size)&&file.size>maxBytes)return{ok:false,reason:'too-large',detected:null};
  const head=new Uint8Array(await file.slice(0,32).arrayBuffer());
  const detected=sniffImageBytes(head);
  if(!detected)return{ok:false,reason:'signature-not-image',detected:null};
  if(!declaredMimeCompatible(file.type||'',detected))return{ok:false,reason:'mime-mismatch',detected};
  return{ok:true,reason:'ok',detected};
}
