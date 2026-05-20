// components/InvitePage.tsx
// Page d'onboarding pour les invités — affichée via /#invite
// Gère la définition du mot de passe après invitation

import { useState, useEffect } from 'react'

const C = { bg: '#071212', surface: '#0d1f1f', border: '#1a3535', primary: '#317979', light: '#a3f1eb', text: '#f6f6f6', muted: '#4a7a7a', dim: '#2a5050' }

function pwdStrength(p: string) {
  if (!p) return { score: 0, color: C.dim, label: '' }
  let s = 0
  if (p.length >= 8) s++; if (p.length >= 12) s++
  if (/[A-Z]/.test(p)) s++; if (/[0-9]/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++
  const levels = [
    { color: C.dim, label: '' },
    { color: '#ef4444', label: 'Très faible' },
    { color: '#f59e0b', label: 'Faible' },
    { color: '#317979', label: 'Correct' },
    { color: '#22c55e', label: 'Fort' },
    { color: '#22c55e', label: 'Très fort' },
  ]
  return { score: s, ...levels[Math.min(s, 5)] }
}

interface Props {
  onDone: () => void // appelé après succès → redirige vers l'app
}

export function InvitePage({ onDone }: Props) {
  const [token, setToken]           = useState<string | null>(null)
  const [email, setEmail]           = useState<string | null>(null)
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [status, setStatus]         = useState<'idle' | 'loading' | 'success' | 'error' | 'invalid'>('idle')
  const [error, setError]           = useState('')
  const str = pwdStrength(password)

  // Extraire token depuis le hash URL (#access_token=...&type=invite)
  useEffect(() => {
    const hash = window.location.hash
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const t = params.get('access_token')
    const type = params.get('type')
    const mail = params.get('email')

    if (t && (type === 'invite' || type === 'recovery' || type === 'signup')) {
      setToken(t)
      if (mail) setEmail(decodeURIComponent(mail))
      window.history.replaceState(null, '', window.location.pathname)
    } else {
      setStatus('invalid')
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('8 caractères minimum'); return }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return }
    if (str.score < 2) { setError('Mot de passe trop faible — ajoutez des chiffres et des majuscules'); return }
    setStatus('loading'); setError('')

    try {
      const res = await fetch('/api/auth?action=reset_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, new_password: password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erreur lors de la création'); setStatus('error'); return }

      // Auto-login avec le token d'invitation
      setStatus('success')
      setTimeout(() => onDone(), 2000)
    } catch (e: any) {
      setError(e.message); setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', boxSizing: 'border-box',
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9,
    fontSize: 13, color: C.text, outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>◈</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Position Tracker</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Créez votre mot de passe pour accéder à votre invitation</div>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 28px' }}>

          {/* Invalid token */}
          {status === 'invalid' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f87171', marginBottom: 8 }}>Lien invalide ou expiré</div>
              <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.65, marginBottom: 20 }}>
                Ce lien d'invitation a expiré (valable 24h) ou a déjà été utilisé.<br />
                Demandez un nouvel email d'invitation.
              </p>
              <button onClick={() => window.location.href = '/'} style={{ padding: '10px 24px', background: C.primary, color: C.bg, border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Retour à la connexion
              </button>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>Compte créé !</div>
              <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
                Votre mot de passe a été défini. Redirection en cours…
              </p>
              <div style={{ marginTop: 20, height: 3, background: C.border, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: C.primary, animation: 'progress 2s linear forwards', borderRadius: 99 }} />
                <style>{`@keyframes progress { from { width: 0% } to { width: 100% } }`}</style>
              </div>
            </div>
          )}

          {/* Form */}
          {(status === 'idle' || status === 'loading' || status === 'error') && token && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                  Bienvenue sur Position Tracker
                </div>
                {email && (
                  <div style={{ fontSize: 11, color: C.muted }}>
                    Invitation pour <span style={{ color: C.light }}>{email}</span>
                  </div>
                )}
              </div>

              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                {/* Password */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>
                    Nouveau mot de passe
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPwd ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="8 caractères minimum" autoFocus required
                      style={{ ...inputStyle, paddingRight: 44 }} />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: C.muted }}>
                      {showPwd ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {/* Strength bar */}
                  {password && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: str.score >= i ? str.color : C.border, transition: 'background 0.2s' }} />
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                        <span style={{ color: str.color }}>{str.label}</span>
                        <span style={{ color: C.dim }}>
                          {password.length < 8 ? `${8 - password.length} car. manquants` : ''}
                          {password.length >= 8 && !/[A-Z]/.test(password) ? 'Ajouter une majuscule' : ''}
                          {password.length >= 8 && /[A-Z]/.test(password) && !/[0-9]/.test(password) ? 'Ajouter un chiffre' : ''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm */}
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>
                    Confirmer le mot de passe
                  </label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    placeholder="Répétez le mot de passe" required
                    style={{ ...inputStyle, borderColor: confirm && confirm !== password ? '#ef4444' : C.border }} />
                  {confirm && confirm !== password && (
                    <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>Les mots de passe ne correspondent pas</div>
                  )}
                </div>
              </div>

              {/* Requirements */}
              <div style={{ background: C.bg, borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { ok: password.length >= 8, label: '8 caractères minimum' },
                  { ok: /[A-Z]/.test(password), label: 'Une lettre majuscule' },
                  { ok: /[0-9]/.test(password), label: 'Un chiffre' },
                  { ok: password === confirm && confirm.length > 0, label: 'Mots de passe identiques' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <span style={{ color: r.ok ? '#22c55e' : C.dim }}>{r.ok ? '✓' : '○'}</span>
                    <span style={{ color: r.ok ? C.muted : C.dim }}>{r.label}</span>
                  </div>
                ))}
              </div>

              {error && (
                <div style={{ background: '#2a0d0d', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#f87171' }}>
                  {error}
                </div>
              )}

              <button type="submit"
                disabled={status === 'loading' || !password || !confirm || password !== confirm || str.score < 2}
                style={{
                  padding: '12px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
                  background: (status === 'loading' || !password || !confirm || password !== confirm || str.score < 2) ? C.dim : C.primary,
                  color: C.bg,
                }}>
                {status === 'loading' ? '⏳ Création en cours…' : 'Créer mon compte →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}