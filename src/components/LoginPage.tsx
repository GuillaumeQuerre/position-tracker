import { useState } from 'react'

const C = { bg: '#071212', border: '#1a3535', surface: '#0d1f1f', primary: '#317979', light: '#a3f1eb', text: '#f6f6f6', muted: '#4a7a7a', dim: '#2a5050', error: '#ef4444', success: '#22c55e' }

interface Props {
  onLogin: (email: string, password: string) => Promise<any>
  onSignup: (email: string, password: string) => Promise<{ user: any; needsVerification: boolean }>
  onForgotPassword: (email: string) => Promise<void>
  loading: boolean
  error: string | null
}

export function LoginPage({ onLogin, onSignup, onForgotPassword, loading, error }: Props) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(''); setSuccess('')

    if (mode === 'forgot') {
      try { await onForgotPassword(email); setSuccess('Si ce compte existe, un email a été envoyé.') }
      catch (e: any) { setLocalError(e.message) }
      return
    }
    if (mode === 'signup') {
      if (password !== confirm) { setLocalError('Les mots de passe ne correspondent pas'); return }
      if (password.length < 8) { setLocalError('8 caractères minimum'); return }
      try {
        const { needsVerification } = await onSignup(email, password)
        if (needsVerification) { setSuccess('Compte créé ! Vérifiez votre email.'); setMode('login'); setPassword(''); setConfirm('') }
      } catch (e: any) { setLocalError(e.message) }
      return
    }
    try { await onLogin(email, password) }
    catch (e: any) { setLocalError(e.message) }
  }

  function pwdStrength(p: string) {
    if (!p) return { w: '0%', color: C.border, label: '' }
    let s = 0
    if (p.length >= 8) s++; if (p.length >= 12) s++
    if (/[A-Z]/.test(p)) s++; if (/[0-9]/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++
    const levels = [
      { w: '0%', color: C.border, label: '' },
      { w: '20%', color: '#ef4444', label: 'Très faible' },
      { w: '40%', color: '#f59e0b', label: 'Faible' },
      { w: '60%', color: '#3b82f6', label: 'Correct' },
      { w: '80%', color: C.primary, label: 'Fort' },
      { w: '100%', color: C.light, label: 'Très fort' },
    ]
    return levels[Math.min(s, 5)]
  }
  const str = pwdStrength(mode === 'signup' ? password : '')

  const inp = {
    className: 'w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors',
    style: { background: C.surface, border: `1px solid ${C.border}`, color: C.text } as React.CSSProperties
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>◈</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.light }}>Position Tracker</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {mode === 'login' ? 'Connectez-vous pour accéder à vos projets' :
             mode === 'signup' ? 'Créez votre compte' : 'Réinitialiser le mot de passe'}
          </div>
        </div>

        {/* Card */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28 }}>

          {/* Tabs login/signup */}
          {mode !== 'forgot' && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: C.bg, borderRadius: 10, padding: 3 }}>
              {(['login', 'signup'] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setLocalError(''); setSuccess('') }}
                  style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: mode === m ? C.primary : 'transparent',
                    color: mode === m ? C.bg : C.muted }}>
                  {m === 'login' ? 'Connexion' : 'Créer un compte'}
                </button>
              ))}
            </div>
          )}

          {/* Alerts */}
          {(localError || error) && (
            <div style={{ background: '#2a0d0d', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fca5a5', marginBottom: 14 }}>
              {localError || error}
            </div>
          )}
          {success && (
            <div style={{ background: '#0d2a1a', border: `1px solid ${C.primary}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.light, marginBottom: 14 }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 5 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="vous@exemple.com" {...inp} />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 5 }}>Mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="8 caractères minimum"
                    style={{ ...inp.style, width: '100%', paddingRight: 40, borderRadius: 8, padding: '10px 40px 10px 12px', fontSize: 13 }} />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: C.muted }}>
                    {showPwd ? '🙈' : '👁'}
                  </button>
                </div>
                {mode === 'signup' && password && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 3, borderRadius: 2, background: C.border, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: str.w, background: str.color, transition: 'width 0.3s, background 0.3s' }} />
                    </div>
                    {str.label && <div style={{ fontSize: 10, color: str.color, marginTop: 2 }}>{str.label}</div>}
                  </div>
                )}
              </div>
            )}

            {mode === 'signup' && (
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 5 }}>Confirmer</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Répétez le mot de passe"
                  style={{ ...inp.style, border: `1px solid ${confirm && confirm !== password ? '#7f1d1d' : C.border}` }} />
                {confirm && confirm !== password && <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 3 }}>Mots de passe différents</div>}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ padding: '10px', background: loading ? C.muted : C.primary, color: loading ? C.bg : C.bg, border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}>
              {loading ? '…' : mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Envoyer le lien'}
            </button>
          </form>

          {mode === 'login' && (
            <button onClick={() => { setMode('forgot'); setLocalError(''); setSuccess('') }}
              style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: C.muted }}>
              Mot de passe oublié ?
            </button>
          )}
          {mode === 'forgot' && (
            <button onClick={() => { setMode('login'); setLocalError(''); setSuccess('') }}
              style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: C.muted }}>
              ← Retour à la connexion
            </button>
          )}
        </div>
      </div>
    </div>
  )
}