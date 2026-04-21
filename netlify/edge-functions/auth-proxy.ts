// netlify/edge-functions/auth-proxy.ts
// Auth proxy — wraps Supabase Auth API
// Handles: login, signup, logout, refresh, forgot_password, reset_password, update_name
// project_members CRUD handled via supabase-js with user JWT (RLS enforced)

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON        = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPERADMINS          = (Deno.env.get('SUPERADMINS') ?? 'guillaume@deux.io').split(',').map(e => e.trim())

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })

  const url    = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {}

    // ── LOGIN ───────────────────────────────────────────────────
    if (action === 'login') {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
        body: JSON.stringify({ email: body.email, password: body.password }),
      })
      const data = await res.json()
      if (!res.ok) return json({ error: data.error_description || data.msg || 'Identifiants incorrects' }, 401)
      return json({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: { ...data.user, is_super_admin: SUPERADMINS.includes(data.user?.email) },
      })
    }

    // ── SIGNUP ──────────────────────────────────────────────────
    if (action === 'signup') {
      if (!SUPABASE_SERVICE_KEY) return json({ error: 'Configuration manquante' }, 500)
      const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ email: body.email, password: body.password, email_confirm: true }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) {
        const msg = createData.message || createData.error_description || 'Erreur lors de la création'
        return json({ error: msg }, createRes.status === 422 ? 409 : 400)
      }
      // Auto-login after signup
      const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
        body: JSON.stringify({ email: body.email, password: body.password }),
      })
      const loginData = await loginRes.json()
      if (!loginRes.ok) return json({ error: 'Compte créé. Connectez-vous manuellement.' }, 200)
      return json({
        access_token: loginData.access_token,
        refresh_token: loginData.refresh_token,
        user: { ...loginData.user, is_super_admin: SUPERADMINS.includes(loginData.user?.email) },
      })
    }

    // ── REFRESH ─────────────────────────────────────────────────
    if (action === 'refresh') {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
        body: JSON.stringify({ refresh_token: body.refresh_token }),
      })
      const data = await res.json()
      if (!res.ok) return json({ error: 'Session expirée' }, 401)
      return json({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: { ...data.user, is_super_admin: SUPERADMINS.includes(data.user?.email) },
      })
    }

    // ── FORGOT PASSWORD ─────────────────────────────────────────
    if (action === 'forgot_password') {
      if (!body.email) return json({ error: 'Email requis' }, 400)
      await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
        body: JSON.stringify({ email: body.email.toLowerCase().trim() }),
      })
      return json({ success: true })
    }

    // ── RESET PASSWORD ──────────────────────────────────────────
    if (action === 'reset_password') {
      if (!body.access_token || !body.new_password) return json({ error: 'Paramètres manquants' }, 400)
      if (body.new_password.length < 8) return json({ error: 'Mot de passe trop court' }, 400)
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${body.access_token}` },
        body: JSON.stringify({ password: body.new_password }),
      })
      const data = await res.json()
      if (!res.ok) return json({ error: data.message || 'Erreur réinitialisation' }, 400)
      return json({ success: true })
    }

    // ── UPDATE DISPLAY NAME ─────────────────────────────────────
    if (action === 'update_name') {
      const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
      if (!token) return json({ error: 'Non authentifié' }, 401)
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: { display_name: body.display_name || '' } }),
      })
      const data = await res.json()
      if (!res.ok) return json({ error: data.message || 'Erreur mise à jour' }, 400)
      return json({ user: data })
    }

    return json({ error: 'Action inconnue' }, 400)
  } catch (e: any) {
    return json({ error: e.message }, 500)
  }
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}

export const config = { path: '/api/auth' }