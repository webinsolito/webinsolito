import {useEffect,useState} from 'react'
import {Image as ImageIcon} from 'lucide-react'
import {getPrivateMediaObjectUrl} from '../lib/api'

export function PrivateImage({objectKey,alt,className}:{objectKey?:string|null;alt:string;className?:string}){
  const [src,setSrc]=useState<string|null>(null)
  const [failed,setFailed]=useState(false)
  useEffect(()=>{let active=true;setSrc(null);setFailed(false);if(!objectKey)return()=>{active=false};getPrivateMediaObjectUrl(objectKey).then(url=>{if(active)setSrc(url)}).catch(()=>{if(active)setFailed(true)});return()=>{active=false}},[objectKey])
  if(!objectKey||failed)return <div className={`private-image-placeholder ${className||''}`} aria-label="Foto non disponibile"><ImageIcon/><span>Foto</span></div>
  return src?<img className={className} src={src} alt={alt}/>:<div className={`private-image-placeholder ${className||''}`} aria-label="Caricamento foto"><span className="media-loader"/></div>
}
