import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FlaskConical } from 'lucide-react'
import { gameById } from '../data/sample'
import { rangeLabels, type Range } from '../lib/metrics'
import { isDemo } from '../lib/supabase'
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

// Sadece demo modda görünür; gerçek modda örnek veri hiç gösterilmez
export function SampleBanner({ children }: { children?: ReactNode }) {
  if (!isDemo) return null
  return (
    <div className="sample-banner fade-in">
      <FlaskConical size={14} />
      <span>{children ?? 'Demo mod: örnek veriler gösteriliyor.'}</span>
    </div>
  )
}

export function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  if (!isFinite(value)) return null
  const good = invert ? value <= 0 : value >= 0
  return (
    <span className={`delta ${good ? 'up' : 'down'}`}>
      {value >= 0 ? '▲' : '▼'} %{Math.abs(value).toFixed(0)}
    </span>
  )
}

// Yumuşak eğri: değer listesinden SVG yolu
export function curvePath(vals: number[], w: number, h: number, pad = 6) {
  if (!vals.length) return ''
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const span = max - min || 1
  const x = (i: number) => (vals.length === 1 ? w / 2 : (i / (vals.length - 1)) * w)
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2)
  let d = `M${x(0).toFixed(1)} ${y(vals[0]).toFixed(1)}`
  for (let i = 1; i < vals.length; i++) {
    const cx = ((x(i - 1) + x(i)) / 2).toFixed(1)
    d += ` C${cx} ${y(vals[i - 1]).toFixed(1)} ${cx} ${y(vals[i]).toFixed(1)} ${x(i).toFixed(1)} ${y(vals[i]).toFixed(1)}`
  }
  return d
}

export function Sparkline({ values, width = 150, height = 60, color = '#FFFFFF', dots = true }: { values: number[]; width?: number; height?: number; color?: string; dots?: boolean }) {
  if (values.length < 2) return null
  const d = curvePath(values, width, height)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const pts = [Math.floor(values.length * 0.35), Math.floor(values.length * 0.7)]
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" style={{ overflow: 'visible' }}>
      <path d={d} stroke={color} strokeWidth="1.4" />
      {dots &&
        pts.map((i) => (
          <circle key={i} cx={(i / (values.length - 1)) * width} cy={height - 6 - ((values[i] - min) / span) * (height - 12)} r="3.5" fill="#0B0B0B" stroke={color} strokeWidth="1.4" />
        ))}
    </svg>
  )
}

export function StatCard(props: {
  label: string
  value: number | null
  format: (v: number) => string
  delta?: number
  invertDelta?: boolean
  note?: string
  spark?: number[]
  icon?: ReactNode
  color?: string
}) {
  const v = useCountUp(props.value ?? 0)
  return (
    <div className="card stat fade-in">
      {props.spark && props.spark.length > 1 && Math.max(...props.spark) > Math.min(...props.spark) && (
        <div className="stat-spark">
          <Sparkline values={props.spark} width={120} height={40} />
        </div>
      )}
      <span className="stat-label">{props.label}</span>
      <div className="stat-value">
        {props.value == null ? '—' : props.format(v)}
        {props.value != null && props.delta !== undefined && <Delta value={props.delta} invert={props.invertDelta} />}
        {props.note && <span className="delta">{props.note}</span>}
      </div>
    </div>
  )
}

// Halka gösterge
export function Gauge(props: { value: number; max: number; size?: number; color?: string; color2?: string; arc?: number; children?: ReactNode; id: string }) {
  const size = props.size ?? 190
  const stroke = 12
  const r = (size - stroke) / 2
  const arc = props.arc ?? 0.75
  const circ = 2 * Math.PI * r
  const [p, setP] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setP(Math.min(1, props.value / props.max)), 80)
    return () => clearTimeout(t)
  }, [props.value, props.max])
  const rotate = 90 + (1 - arc) * 180
  const color = props.color ?? '#FFFFFF'
  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: `rotate(${rotate}deg)` }}>
        <defs>
          <linearGradient id={props.id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={props.color2 ?? color} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} strokeDasharray={`${circ * arc} ${circ}`} strokeLinecap="round" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${props.id})`} strokeWidth={stroke} strokeDasharray={`${circ * arc * p} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${color}99)` }} />
      </svg>
      <div className="gauge-center">{props.children}</div>
    </div>
  )
}

// İç içe halkalar (Gelir › Oyun sağlığı)
export function Rings({ rings, size = 170 }: { rings: { value: number; color: string }[]; size?: number }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 60)
    return () => clearTimeout(t)
  }, [])
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ flexShrink: 0 }}>
      {rings.map((ring, i) => {
        const r = c - 11 - i * 18
        const circ = 2 * Math.PI * r
        const f = Math.max(0, Math.min(1, ring.value))
        return (
          <g key={i}>
            <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="14" />
            <circle cx={c} cy={c} r={r} fill="none" stroke={ring.color} strokeWidth="14" strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`}
              strokeDasharray={`${(on ? f : 0) * circ} ${circ}`} style={{ transition: 'stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${ring.color}aa)` }} />
          </g>
        )
      })}
    </svg>
  )
}

// Halka grafik (pay dağılımı)
export function Donut({ parts, size = 140, children }: { parts: { value: number; color: string }[]; size?: number; children?: ReactNode }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  const r = size / 2 - 16
  const circ = 2 * Math.PI * r
  let off = 0
  return (
    <div style={{ position: 'relative', width: size, height: size, alignSelf: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2B2B2B" strokeWidth="20" />
        {parts.map((p, i) => {
          const len = (p.value / total) * circ
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth="20" strokeDasharray={`${Math.max(0, len - 2)} ${circ}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          off += len
          return el
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  )
}

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="seg" role="group" aria-label="Dönem">
      {([1, 7, 30] as Range[]).map((r) => (
        <button key={r} className={r === value ? 'on' : ''} aria-pressed={r === value} onClick={() => onChange(r)}>
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
        <button key={o.value} className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function initials(name: string) {
  return name.split(/[\s:]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

export function GameLogo({ id, size = 30 }: { id: string; size?: number }) {
  const g = gameById(id)
  return (
    <span className="game-logo" style={{ width: size, height: size, fontSize: size > 36 ? 14 : 11, borderRadius: Math.round(size * 0.28) }}>
      {g?.icon ? <img src={g.icon} alt="" loading="lazy" referrerPolicy="no-referrer" /> : initials(g?.name ?? id)}
    </span>
  )
}

export function GameChip({ id, platform }: { id: string; platform?: string }) {
  const g = gameById(id)
  return (
    <span className="game-chip">
      <GameLogo id={id} />
      <span>
        {g?.name ?? id}
        {platform && <span className="muted small" style={{ display: 'block' }}>{platformLabel(platform)}</span>}
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
export const sourceLabel = { play: 'Google Play', app_store: 'App Store', admob: 'AdMob', system: 'Sistem' }

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

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

// Hero kartındaki hareketli parlak küre
export function HeroOrb() {
  return (
    <svg className="hero-orb" viewBox="0 0 400 400" aria-hidden>
      <defs>
        <radialGradient id="orbCore" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="35%" stopColor="#bdbdbd" stopOpacity="0.4" />
          <stop offset="70%" stopColor="#3a3a3a" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0b0b0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0; 0 -10; 0 0" dur="6s" repeatCount="indefinite" />
        <ellipse cx="200" cy="170" rx="150" ry="115" fill="url(#orbCore)">
          <animate attributeName="ry" values="115;104;115" dur="3s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="200" cy="150" rx="105" ry="60" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1.2" />
        <ellipse cx="200" cy="170" rx="135" ry="95" fill="none" stroke="#ffffff" strokeOpacity="0.15" strokeWidth="1" />
      </g>
    </svg>
  )
}

// Ekran telefon genişliğinde mi? (bazı sayfalar telefonda farklı düzen kullanır)
export function useIsMobile(max = 900) {
  const q = `(max-width: ${max}px)`
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}
