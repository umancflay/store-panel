import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FlaskConical, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { gameById } from '../data/sample'
import { rangeLabels, type Range } from '../lib/metrics'
import { platformLabel } from '../lib/format'

// Sayının 0'dan hedefe akarak gelmesi
export function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const begin = from.current
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      const val = begin + (target - begin) * eased
      setV(val)
      from.current = val
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

export function SampleBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="sample-banner fade-in">
      <FlaskConical size={16} />
      <span>{children ?? 'Örnek veri gösteriliyor. Gerçek veriler bağlantılar kurulunca gelecek.'}</span>
    </div>
  )
}

export function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const good = invert ? value <= 0 : value >= 0
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`delta ${good ? 'up' : 'down'}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <Icon size={14} />
      {value >= 0 ? '+' : ''}
      {value.toFixed(0)}%
    </span>
  )
}

export function StatCard(props: {
  label: string
  value: number
  format: (v: number) => string
  delta?: number
  invertDelta?: boolean
  icon: ReactNode
  color?: string
}) {
  const v = useCountUp(props.value)
  return (
    <div className="card stat fade-in">
      <div style={{ minWidth: 0 }}>
        <div className="stat-label">{props.label}</div>
        <div className="stat-value">
          {props.format(v)}
          {props.delta !== undefined && <Delta value={props.delta} invert={props.invertDelta} />}
        </div>
      </div>
      <div className="icon-box" style={props.color ? { background: props.color, boxShadow: `0 6px 18px ${props.color}55` } : undefined}>
        {props.icon}
      </div>
    </div>
  )
}

// Yarım/tam halka gösterge (Vision UI'daki "Satisfaction Rate" gibi)
export function Gauge(props: { value: number; max: number; size?: number; color?: string; color2?: string; arc?: number; children?: ReactNode; id: string }) {
  const size = props.size ?? 190
  const stroke = 12
  const r = (size - stroke) / 2
  const arc = props.arc ?? 0.75 // halkanın ne kadarı çizilsin
  const circ = 2 * Math.PI * r
  const [p, setP] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setP(Math.min(1, props.value / props.max)), 80)
    return () => clearTimeout(t)
  }, [props.value, props.max])
  const rotate = 90 + (1 - arc) * 180
  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: `rotate(${rotate}deg)` }}>
        <defs>
          <linearGradient id={props.id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={props.color2 ?? props.color ?? '#0075ff'} />
            <stop offset="100%" stopColor={props.color ?? '#0075ff'} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} strokeDasharray={`${circ * arc} ${circ}`} strokeLinecap="round" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${props.id})`}
          strokeWidth={stroke}
          strokeDasharray={`${circ * arc * p} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${props.color ?? '#0075ff'}88)` }}
        />
      </svg>
      <div className="gauge-center">{props.children}</div>
    </div>
  )
}

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="seg">
      {([1, 7, 30] as Range[]).map((r) => (
        <button key={r} className={r === value ? 'on' : ''} onClick={() => onChange(r)}>
          {rangeLabels[r]}
        </button>
      ))}
    </div>
  )
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function GameLogo({ id, size = 32 }: { id: string; size?: number }) {
  const g = gameById(id)
  if (!g) return null
  const initials = g.name.split(' ').map((w) => w[0]).join('').slice(0, 2)
  return (
    <span className="game-logo" style={{ width: size, height: size, background: `linear-gradient(135deg, ${g.color}, ${g.color}66)`, boxShadow: `0 4px 14px ${g.color}44` }}>
      {initials}
    </span>
  )
}

export function GameChip({ id, platform }: { id: string; platform?: string }) {
  const g = gameById(id)
  return (
    <span className="game-chip">
      <GameLogo id={id} />
      <span>
        {g?.name}
        {platform && <span className="muted small" style={{ display: 'block', fontWeight: 500 }}>{platformLabel(platform)}</span>}
      </span>
    </span>
  )
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? '' : 'off'}>★</span>
      ))}
    </span>
  )
}

export const levelLabel = { critical: 'Kritik', warning: 'Uyarı', info: 'Bilgi' }
export const sourceLabel = { play: 'Google Play', app_store: 'App Store', admob: 'AdMob' }

export function ChartTip({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; fmt: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tip">
      <b>{label ? new Date(label).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : ''}</b>
      {payload.map((p) => (
        <div key={p.name}>
          <span className="dot" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />
}

// Hero kartındaki hareketli parlak küre (görseldeki deniz anası yerine)
export function HeroOrb() {
  return (
    <svg className="hero-orb" viewBox="0 0 400 400" aria-hidden>
      <defs>
        <radialGradient id="orbCore" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#9fd8ff" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#3b82ff" stopOpacity="0.7" />
          <stop offset="70%" stopColor="#5b21b6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0b1033" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="orbLine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fb6ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
        <filter id="orbBlur"><feGaussianBlur stdDeviation="2" /></filter>
      </defs>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0; 0 -10; 0 0" dur="6s" repeatCount="indefinite" />
        <ellipse cx="200" cy="170" rx="150" ry="115" fill="url(#orbCore)">
          <animate attributeName="ry" values="115;104;115" dur="3s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="200" cy="150" rx="105" ry="60" fill="none" stroke="#9fd8ff" strokeOpacity="0.35" strokeWidth="1.5" />
        <ellipse cx="200" cy="170" rx="135" ry="95" fill="none" stroke="#7fb6ff" strokeOpacity="0.25" strokeWidth="1" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const x = 110 + i * 30
          return (
            <path key={i} d={`M${x} 250 C ${x - 20} 300, ${x + 20} 340, ${x - 6} 400`} stroke="url(#orbLine)" strokeWidth="2.5" fill="none" filter="url(#orbBlur)">
              <animate attributeName="d" dur={`${3 + (i % 3)}s`} repeatCount="indefinite"
                values={`M${x} 250 C ${x - 20} 300, ${x + 20} 340, ${x - 6} 400; M${x} 250 C ${x + 18} 300, ${x - 22} 340, ${x + 8} 400; M${x} 250 C ${x - 20} 300, ${x + 20} 340, ${x - 6} 400`} />
            </path>
          )
        })}
      </g>
    </svg>
  )
}
