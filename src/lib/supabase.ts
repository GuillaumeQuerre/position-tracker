// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  global: {
    fetch: (url, options = {}) => {
      // Injecter le JWT depuis la session stockée en localStorage
      try {
        const session = JSON.parse(localStorage.getItem('tracker_session') ?? 'null')
        if (session?.access_token) {
          options.headers = {
            ...options.headers,
            Authorization: `Bearer ${session.access_token}`,
          }
        }
      } catch {}
      return fetch(url, options)
    },
  },
})