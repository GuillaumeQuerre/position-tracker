import React from 'react'

const C = { border: '#1a3535', surface: '#0d1f1f', pulse: '#1a3535' }

const skStyle = `
@keyframes sk-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.9; }
}
.sk { background: ${C.pulse}; border-radius: 4px; animation: sk-pulse 1.6s ease-in-out infinite; }
`

interface BoneProps {
  w?: string | number
  h?: number
  r?: number
  delay?: number
  style?: React.CSSProperties
}

function Bone({ w = '100%', h = 12, r = 4, delay = 0, style }: BoneProps) {
  return (
    <div
      className="sk"
      style={{ width: w, height: h, borderRadius: r, animationDelay: `${delay}ms`, ...style }}
    />
  )
}

// ── Chart tab ─────────────────────────────────────────────────────────────────
export function SkeletonChart() {
  return (
    <div style={{ height: 'calc(100vh - 115px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{skStyle}</style>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <Bone w={90} h={28} r={6} />
        <Bone w={90} h={28} r={6} delay={80} />
        <Bone w={60} h={22} r={6} delay={160} />
        <Bone w={60} h={22} r={6} delay={200} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Bone w={80} h={16} delay={240} />
          <Bone w={60} h={16} delay={280} />
        </div>
      </div>

      <div style={{ height: '50vh', flexShrink: 0, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bone w={18} h={8} delay={i * 60} />
            <div style={{ flex: 1, height: 1, background: C.border, opacity: 0.5 }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ width: 260, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Bone w={100} h={10} delay={100} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {Array.from({ length: 8 }).map((_, i) => <Bone key={i} h={36} r={6} delay={i * 40} />)}
          </div>
        </div>
        <div style={{ width: 240, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Bone w={80} h={10} delay={150} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bone w={120} h={12} delay={200} />
          </div>
        </div>
        <div style={{ flex: 1, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <Bone w={100} h={22} r={6} delay={100} />
            <Bone w={80} h={22} r={6} delay={140} />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bone w={8} h={8} r={99} delay={i * 50} />
              <Bone w={`${50 + Math.round(Math.sin(i) * 30)}%`} h={10} delay={i * 50 + 20} />
              <Bone w={40} h={10} delay={i * 50 + 40} style={{ marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Keywords / URLs tab ───────────────────────────────────────────────────────
export function SkeletonTable({ rows = 12 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: 'calc(100vh - 140px)' }}>
      <style>{skStyle}</style>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Bone w={200} h={28} r={6} />
        <Bone w={100} h={28} r={6} delay={60} />
        <Bone w={80} h={28} r={6} delay={120} />
      </div>
      <div style={{ display: 'flex', gap: 12, padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
        <Bone w={16} h={16} r={3} />
        <Bone w={200} h={10} delay={40} />
        <Bone w={80} h={10} delay={80} style={{ marginLeft: 'auto' }} />
        <Bone w={60} h={10} delay={100} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 12px', borderRadius: 6, background: i % 2 === 0 ? 'transparent' : C.surface }}>
            <Bone w={16} h={16} r={3} delay={i * 30} />
            <Bone w={8} h={8} r={99} delay={i * 30 + 10} />
            <Bone w={`${40 + (i * 13 % 30)}%`} h={10} delay={i * 30 + 20} />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <Bone w={40} h={18} r={99} delay={i * 30 + 30} />
              <Bone w={40} h={18} r={99} delay={i * 30 + 50} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Actions tab ───────────────────────────────────────────────────────────────
export function SkeletonActions() {
  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 140px)' }}>
      <style>{skStyle}</style>
      <div style={{ width: 384, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Bone w={160} h={14} />
        <Bone w="100%" h={36} r={8} delay={60} />
        <Bone w="100%" h={36} r={8} delay={100} />
        <Bone w="100%" h={120} r={8} delay={140} />
        <Bone w="100%" h={36} r={8} delay={180} />
        <Bone w={120} h={32} r={8} delay={220} style={{ marginLeft: 'auto' }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <Bone w={80} h={28} r={6} />
          <Bone w={80} h={28} r={6} delay={60} />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: 16, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Bone w={8} h={8} r={99} delay={i * 60} />
              <Bone w={`${50 + (i * 17 % 25)}%`} h={12} delay={i * 60 + 20} />
              <Bone w={60} h={10} delay={i * 60 + 40} style={{ marginLeft: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Bone w={60} h={18} r={99} delay={i * 60 + 60} />
              <Bone w={80} h={18} r={99} delay={i * 60 + 80} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}