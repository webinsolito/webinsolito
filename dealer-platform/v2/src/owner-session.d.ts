import './types'

declare module './types' {
  interface SessionPayload {
    support_mode?:boolean
    support_session_id?:string
    support_expires_at?:string
  }
}

export {}
