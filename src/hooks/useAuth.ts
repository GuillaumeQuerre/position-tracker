// hooks/useAuth.ts
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

// Decode JWT expiry without a library
function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp ? payload.exp * 1000 : null
  } catch { return null }
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const user = session?.user ?? null
  const token = session?.access_token ?? null
  const isSuperAdmin = user?.is_super_admin ?? false

  // Refresh proactif — appelé au mount et à chaque changement de session
  const scheduleRefresh = useCallback((s: Session) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    const expiry = getTokenExpiry(s.access_token)
    const now = Date.now()
    // Refresh 2 minutes avant expiry, ou dans 45 min si pas d'expiry connue
    const delay = expiry ? Math.max(0, expiry - now - 2 * 60 * 1000) : 45 * 60 * 1000
    refreshTimer.current = setTimeout(async () => {
      try {
        const data = await apiAuth('refresh', { refresh_token: s.refresh_token })
        const newSession: Session = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user }
        saveSession(newSession)
        setSession(newSession)
      } catch {
        clearSession()
        setSession(null)
      }
    }, delay)
  }, [])

  // Au mount : refresh immédiat si token expiré ou proche de l'expiry
  useEffect(() => {
    const s = loadSession()
    if (!s) { setLoading(false); return }
    const expiry = getTokenExpiry(s.access_token)
    const now = Date.now()
    const needsRefresh = !expiry || expiry - now < 5 * 60 * 1000 // expiré ou expire dans < 5 min

    if (needsRefresh) {
      // Refresh immédiat
      apiAuth('refresh', { refresh_token: s.refresh_token })
        .then(data => {
          const newSession: Session = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user }
          saveSession(newSession)
          setSession(newSession)
          scheduleRefresh(newSession)
        })
        .catch(() => { clearSession(); setSession(null) })
        .finally(() => setLoading(false))
    } else {
      setSession(s)
      scheduleRefresh(s)
      setLoading(false)
    }
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh proactif quand la session change (nouveau login)
  useEffect(() => {
    if (session) scheduleRefresh(session)
  }, [session?.access_token]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
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
    await apiAuth('update_name', { display_name: displayName }, token)
    if (session) {
      const updated = { ...session, user: { ...session.user, user_metadata: { display_name: displayName } } }
      saveSession(updated); setSession(updated)
    }
  }, [token, session])

  return { user, token, session, loading, error, isSuperAdmin, login, signup, logout, forgotPassword, resetPassword, updateDisplayName }
}