import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Palette } from 'lucide-react'
import { PRESETS, applyBackground, compressImage, useBackground, type Background } from '../lib/background'
import { usePeople } from '../lib/data'
import { useStore } from '../lib/store'

// Ayarlar › Görünüm: arka plan fotoğrafı (hazır ya da kendi fotoğrafın) ve karartma; klasik koyu tema da seçilebilir
export default function Appearance() {
  const { me } = usePeople()
  const { toast } = useStore()
  const [bg, save] = useBackground(me.email)
  const input = useRef<HTMLInputElement>(null)
  // Kaydırırken sadece ekranda değişir; bırakınca kaydedilir
  const [dim, setDim] = useState(bg.kind === 'none' ? 0.35 : bg.dim)
  useEffect(() => { if (bg.kind !== 'none') setDim(bg.dim) }, [bg])

  const pick = (next: Background) => save(next).catch((e) => toast('Kaydedilemedi: ' + (e as Error).message, 'warn'))
  async function upload(f: File) {
    if (!f.type.startsWith('image/')) return toast('Bir fotoğraf seç', 'warn')
    try {
      const url = await compressImage(f)
      await pick({ kind: 'custom', url, dim })
      toast('Arka plan değişti')
    } catch (e) {
      toast('Fotoğraf okunamadı: ' + (e as Error).message, 'warn')
    }
  }

  return (
    <section className="card">
      <div className="card-title flex" style={{ gap: 8 }}><Palette size={16} /> Görünüm</div>
      <div className="card-sub" style={{ marginBottom: 12 }}>Arka plan fotoğrafı ve buzlu cam kartlar · bu hesapta her cihazda aynı</div>

      <div className="bg-grid">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={`bg-opt ${bg.kind === 'preset' && bg.id === p.id ? 'on' : ''}`} style={{ backgroundImage: `url(${p.thumb})` }} onClick={() => pick({ kind: 'preset', id: p.id, dim })} aria-label={p.name}>
            <span>{p.name}</span>
          </button>
        ))}
        {bg.kind === 'custom' && (
          <button type="button" className="bg-opt on" style={{ backgroundImage: `url(${bg.url})` }} aria-label="Senin fotoğrafın"><span>Senin fotoğrafın</span></button>
        )}
        <button type="button" className="bg-opt add" onClick={() => input.current?.click()} aria-label="Fotoğraf yükle">
          <span style={{ position: 'static', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}><ImagePlus size={18} /> Fotoğraf yükle</span>
        </button>
        <button type="button" className={`bg-opt dark ${bg.kind === 'none' ? 'on' : ''}`} onClick={() => pick({ kind: 'none' })} aria-label="Klasik koyu"><span>Klasik koyu</span></button>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />

      {bg.kind !== 'none' && (
        <label className="flex" style={{ gap: 10, marginTop: 14, fontSize: 12 }}>
          <span className="muted" style={{ whiteSpace: 'nowrap' }}>Karartma</span>
          <input type="range" min={0} max={0.7} step={0.05} value={dim} style={{ flex: 1, accentColor: '#8FD3AE' }}
            onChange={(e) => { const v = Number(e.target.value); setDim(v); applyBackground({ ...bg, dim: v }) }}
            onPointerUp={() => pick({ ...bg, dim })} onKeyUp={() => pick({ ...bg, dim })} aria-label="Arka plan karartma" />
          <span className="muted" style={{ width: 34, textAlign: 'right' }}>%{Math.round(dim * 100)}</span>
        </label>
      )}
    </section>
  )
}
