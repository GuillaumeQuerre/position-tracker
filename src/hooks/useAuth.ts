// hooks/useAuth.ts
// Gestion de session — login, signup, logout, refresh automatique
// Session stockée dans localStorage (persist entre onglets)

import { useState, useEffect, useCallback, useRef } from 'react'

export interface AuthUser {
  id: string
  email: string
  is_super_admin?: boolean
  user_metadata?: { display_name?: string }
}

interface Session {
  access_token: string
  refresh_token: string
  user: AuthUser
}

const SESSION_KEY = 'tracker_session'

function loadSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') } catch { return null }
}
function saveSession(s: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s))
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

async function apiAuth(action: string, body: object = {}, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`/api/auth?action=${action}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erreur serveur')
  return data
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const user = session?.user ?? null
  const token = session?.access_token ?? null
  const isSuperAdmin = user?.is_super_admin ?? false

  // Auto-refresh session 5 min before expiry (tokens last 1h by default)
  useEffect(() => {
    if (!session?.refresh_token) return
    const refresh = async () => {
      try {
        const data = await apiAuth('refresh', { refresh_token: session.refresh_token })
        const newSession = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user }
        saveSession(newSession)
        setSession(newSession)
      } catch {
        clearSession()
        setSession(null)
      }
    }
    // Refresh after 50 minutes
    refreshTimer.current = setTimeout(refresh, 50 * 60 * 1000)
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current) }
  }, [session?.refresh_token])

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true); setError(null)
    try {
      const data = await apiAuth('login', { email, password })
      const s: Session = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user }
      saveSession(s); setSession(s)
      return s.user
    } catch (e: any) {
      setError(e.message); throw e
    } finally { setLoading(false) }
  }, [])

  const signup = useCallback(async (email: string, password: string) => {
    setLoading(true); setError(null)
    try {
      const data = await apiAuth('signup', { email, password })
      if (data.access_token) {
        const s: Session = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user }
        saveSession(s); setSession(s)
        return { user: s.user, needsVerification: false }
      }
      return { user: null, needsVerification: true }
    } catch (e: any) {
      setError(e.message); throw e
    } finally { setLoading(false) }
  }, [])

  const logout = useCallback(() => {
    clearSession(); setSession(null)
  }, [])

  const forgotPassword = useCallback(async (email: string) => {
    await apiAuth('forgot_password', { email })
  }, [])

  const resetPassword = useCallback(async (accessToken: string, newPassword: string) => {
    await apiAuth('reset_password', { access_token: accessToken, new_password: newPassword })
  }, [])

  const updateDisplayName = useCallback(async (displayName: string) => {
    if (!token) return
    const data = await apiAuth('update_name', { display_name: displayName }, token)
    if (session && data.user) {
      const updated = { ...session, user: { ...session.user, user_metadata: { display_name: displayName } } }
      saveSession(updated); setSession(updated)
    }
  }, [token, session])

  return { user, token, session, loading, error, isSuperAdmin, login, signup, logout, forgotPassword, resetPassword, updateDisplayName }
}