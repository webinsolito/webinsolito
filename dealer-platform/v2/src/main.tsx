import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import App from './App'
import './styles.css'
import './action.css'
import './sales.css'
import './registration.css'
import './access.css'
import './staff.css'
import './owner.css'
import './owner-console-v2.css'
import './support.css'
import './owner-login.css'
import './onboarding.css'
import './documents.css'
import './finance.css'
import './report.css'
import './invoices.css'

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>)

if('serviceWorker' in navigator&&import.meta.env.PROD){
  window.addEventListener('load',async()=>{
    try{
      const hadController=Boolean(navigator.serviceWorker.controller)
      const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'})
      let reloading=false
      let lastCheck=0

      const activateWaiting=()=>registration.waiting?.postMessage({type:'SKIP_WAITING'})
      const checkForUpdate=async()=>{
        const now=Date.now()
        if(now-lastCheck<60_000)return
        lastCheck=now
        try{
          await registration.update()
          activateWaiting()
        }catch{
          // Offline or temporary network issue: the current app keeps working.
        }
      }

      activateWaiting()
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing
        if(!worker)return
        worker.addEventListener('statechange',()=>{
          if(worker.state==='installed'&&navigator.serviceWorker.controller){
            worker.postMessage({type:'SKIP_WAITING'})
          }
        })
      })

      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(!hadController||reloading)return
        reloading=true
        window.location.reload()
      })

      void checkForUpdate()
      window.addEventListener('focus',()=>void checkForUpdate())
      document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='visible')void checkForUpdate()
      })
      window.setInterval(()=>void checkForUpdate(),15*60_000)
    }catch{
      // The app must stay usable even if service worker registration is unavailable.
    }
  })
}
