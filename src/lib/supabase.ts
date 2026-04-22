import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  global: {
    fetch: (url: RequestInfo | URL, options?: RequestInit) => {
      try {
        const session = JSON.parse(localStorage.getItem('tracker_session') ?? 'null')
        if (session?.access_token) {
          const headers = new Headers(options?.headers)
          headers.set('Authorization', `Bearer ${session.access_token}`)
          headers.set('apikey', SUPABASE_ANON)
          return fetch(url, { ...options, headers })
        }
      } catch {}
      return fetch(url, options)
    },
  },
})