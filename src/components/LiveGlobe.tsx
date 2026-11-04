import { useEffect, useRef } from 'react'
import { CENTERS, LAND } from '../data/globe'

// Noktalı dünya küresi: yavaşça döner, sürükleyince çevrilir. İşaretler ülke merkezinde, büyüklüğü değere göre.
// Çizim kütüphanesi yok: ortografik izdüşüm elle (canvas 2D).

export type GlobeMark = { code: string; value: number; label?: string }

const RAD = Math.PI / 180

export default function LiveGlobe({ marks, height = 300 }: { marks: GlobeMark[]; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const state = useRef({ lng: -30, lat: 22, drag: null as null | { x: number; y: number; lng: number; lat: number }, t: 0 })
  const marksRef = useRef(marks)
  marksRef.current = marks

  useEffect(() => {
    const c = canvas.current!
    const ctx = c.getContext('2d')!
    let raf = 0
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function draw(now: number) {
      const s = state.current
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = c.clientWidth
      const h = c.clientHeight
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (!s.drag && !reduce) s.lng += 0.04
      s.t = now
      const r = Math.min(w, h) * 0.46
      const cx = w / 2
      const cy = h / 2
      const l0 = s.lng * RAD
      const p0 = s.lat * RAD
      const sp0 = Math.sin(p0)
      const cp0 = Math.cos(p0)
      // Enlem/boylam → ekran; arka yüzdeyse null
      const project = (lat: number, lng: number) => {
        const p = lat * RAD
        const dl = lng * RAD + l0
        const cosc = sp0 * Math.sin(p) + cp0 * Math.cos(p) * Math.cos(dl)
        if (cosc < 0) return null
        return { x: cx + r * Math.cos(p) * Math.sin(dl), y: cy - r * (cp0 * Math.sin(p) - sp0 * Math.cos(p) * Math.cos(dl)), z: cosc }
      }

      // Hale ve küre
      const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.25)
      halo.addColorStop(0, 'rgba(255,122,60,.28)')
      halo.addColorStop(1, 'rgba(255,122,60,0)')
      ctx.fillStyle = halo
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2); ctx.fill()
      const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r)
      body.addColorStop(0, '#2a2522')
      body.addColorStop(1, '#0d0b0a')
      ctx.fillStyle = body
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()

      // Kara noktaları
      for (let i = 0; i < LAND.length; i += 2) {
        const q = project(LAND[i] / 10, LAND[i + 1] / 10)
        if (!q) continue
        ctx.fillStyle = `rgba(235,228,220,${0.15 + q.z * 0.55})`
        ctx.fillRect(q.x - 0.9, q.y - 0.9, 1.8, 1.8)
      }

      // İşaretler: değere göre büyüklük, nabız gibi atan halka
      const list = marksRef.current
      const max = Math.max(...list.map((m) => m.value), 1)
      const top = new Set([...list].sort((a, b) => b.value - a.value).slice(0, 3).map((m) => m.code))
      for (const m of list) {
        const ll = CENTERS[m.code]
        if (!ll) continue
        const q = project(ll[0], ll[1])
        if (!q) continue
        const k = Math.sqrt(m.value / max)
        const size = 2.5 + k * 6
        const pulse = (Math.sin(now / 600 + ll[1]) + 1) / 2
        ctx.strokeStyle = `rgba(255,140,70,${0.5 * (1 - pulse)})`
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(q.x, q.y, size + 4 + pulse * 8, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = '#ff7a3c'
        ctx.shadowColor = '#ff7a3c'
        ctx.shadowBlur = 12
        ctx.beginPath(); ctx.arc(q.x, q.y, size, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
        if (top.has(m.code) && m.label && q.z > 0.35) {
          ctx.font = '600 11px Poppins, system-ui, sans-serif'
          const tw = ctx.measureText(m.label).width
          // Sağa sığmıyorsa noktanın soluna yaz
          const lx = q.x + size + 5 + tw + 12 > w ? q.x - size - 5 - tw - 12 : q.x + size + 5
          ctx.fillStyle = 'rgba(15,12,10,.75)'
          ctx.beginPath(); ctx.roundRect(lx, q.y - 10, tw + 12, 20, 6); ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.fillText(m.label, lx + 6, q.y + 4)
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    // Sürükleyerek çevirme
    const down = (e: PointerEvent) => { const s = state.current; s.drag = { x: e.clientX, y: e.clientY, lng: s.lng, lat: s.lat }; c.setPointerCapture(e.pointerId) }
    const move = (e: PointerEvent) => {
      const s = state.current
      if (!s.drag) return
      s.lng = s.drag.lng + (e.clientX - s.drag.x) * 0.35
      s.lat = Math.max(-70, Math.min(70, s.drag.lat + (e.clientY - s.drag.y) * 0.35))
    }
    const up = () => { state.current.drag = null }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
    return () => {
      cancelAnimationFrame(raf)
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointercancel', up)
    }
  }, [])

  return <canvas ref={canvas} className="live-globe" style={{ height }} aria-label="Gelirin geldiği ülkeler, dünya küresi" />
}
