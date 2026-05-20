// netlify/edge-functions/invite-proxy.ts
// @ts-nocheck
// Gère l'invitation d'un utilisateur sur un projet :
// 1. Crée le compte Supabase (email_confirm: false)
// 2. Génère un lien d'invitation magique
// 3. Envoie un email via Supabase Auth (ou Resend si configuré)

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON        = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SITE_URL             = Deno.env.get('SITE_URL') ?? 'https://votre-site.netlify.app'

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url    = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    const body = await req.json().catch(() => ({}))

    // ── INVITE ──────────────────────────────────────────────────────────
    // Crée l'utilisateur et envoie un email d'invitation avec lien de setup
    if (action === 'invite') {
      const { email, project_name, invited_by, role } = body
      if (!email) return json({ error: 'Email requis' }, 400)
      if (!SUPABASE_SERVICE_KEY) return json({ error: 'Configuration manquante' }, 500)

      // Vérifier si l'utilisateur existe déjà
      const listRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      )
      const listData = await listRes.json()
      const existingUser = (listData.users ?? []).find((u: any) => u.email === email.toLowerCase().trim())

      let userId: string

      if (existingUser) {
        // Utilisateur existant — on lui envoie juste un email de notification
        userId = existingUser.id
        await sendInviteEmail({ email, project_name, invited_by, role, isExisting: true, siteUrl: SITE_URL })
        return json({ success: true, isExisting: true })
      }

      // Créer le compte via Admin API (sans mot de passe — l'utilisateur le définira)
      const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          email_confirm: false, // l'email sera confirmé via le lien d'invitation
          user_metadata: { invited_by, invited_to: project_name },
        }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) {
        return json({ error: createData.message || 'Erreur création compte' }, 400)
      }
      userId = createData.id

      // Générer un lien magique (magic link) pour la définition du mot de passe
      // On utilise generateLink avec type "invite"
      const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          type: 'invite',
          email: email.toLowerCase().trim(),
          options: {
            redirect_to: `${SITE_URL}/#invite`,
          },
        }),
      })
      const linkData = await linkRes.json()
      const inviteLink = linkData.action_link ?? `${SITE_URL}/#invite`

      // Envoyer l'email d'invitation
      await sendInviteEmail({ email, project_name, invited_by, role, isExisting: false, inviteLink, siteUrl: SITE_URL })

      return json({ success: true, isExisting: false })
    }

    return json({ error: 'Action inconnue' }, 400)
  } catch (e: any) {
    return json({ error: e.message }, 500)
  }
}

// ── Email via Supabase SMTP ou Resend ────────────────────────────────────────
async function sendInviteEmail({
  email, project_name, invited_by, role, isExisting, inviteLink, siteUrl
}: {
  email: string; project_name: string; invited_by: string; role: string
  isExisting: boolean; inviteLink?: string; siteUrl: string
}) {
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
  const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@votre-domaine.com'

  const roleLabel = role === 'admin' ? 'Administrateur' : role === 'editor' ? 'Éditeur' : 'Lecteur'
  const subject   = `${invited_by} vous invite sur ${project_name} — Position Tracker`

  const htmlBody = isExisting
    ? `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#071212;color:#f6f6f6;padding:32px;border-radius:16px">
        <div style="font-size:22px;font-weight:700;color:#a3f1eb;margin-bottom:8px">◈ Position Tracker</div>
        <h2 style="font-size:18px;color:#f6f6f6;margin:24px 0 12px">Accès accordé à ${project_name}</h2>
        <p style="color:#4a7a7a;line-height:1.7">${invited_by} vous a donné accès au projet <strong style="color:#a3f1eb">${project_name}</strong> en tant que <strong style="color:#317979">${roleLabel}</strong>.</p>
        <p style="color:#4a7a7a;line-height:1.7">Connectez-vous avec votre compte existant pour accéder au projet.</p>
        <a href="${siteUrl}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:#317979;color:#071212;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">Accéder à Position Tracker</a>
      </div>`
    : `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#071212;color:#f6f6f6;padding:32px;border-radius:16px">
        <div style="font-size:22px;font-weight:700;color:#a3f1eb;margin-bottom:8px">◈ Position Tracker</div>
        <h2 style="font-size:18px;color:#f6f6f6;margin:24px 0 12px">Vous êtes invité sur ${project_name}</h2>
        <p style="color:#4a7a7a;line-height:1.7">${invited_by} vous invite à rejoindre le projet <strong style="color:#a3f1eb">${project_name}</strong> en tant que <strong style="color:#317979">${roleLabel}</strong>.</p>
        <p style="color:#4a7a7a;line-height:1.7">Cliquez sur le bouton ci-dessous pour créer votre mot de passe et accéder à la plateforme.</p>
        <a href="${inviteLink}" style="display:inline-block;margin-top:24px;padding:14px 32px;background:#317979;color:#071212;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Créer mon compte →</a>
        <p style="color:#2a5050;font-size:11px;margin-top:24px;line-height:1.6">Ce lien est valable 24h. Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
        <p style="color:#2a5050;font-size:10px;margin-top:8px">Invité par ${invited_by} · Position Tracker</p>
      </div>`

  if (RESEND_KEY) {
    // Envoyer via Resend (recommandé)
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html: htmlBody }),
    })
  } else {
    // Fallback : Supabase Auth email (limité mais fonctionnel)
    // L'email est envoyé automatiquement par Supabase lors de generate_link
    // Pas d'action supplémentaire nécessaire
    console.log('No RESEND_API_KEY — using Supabase default email')
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

export const config = { path: '/api/invite' }