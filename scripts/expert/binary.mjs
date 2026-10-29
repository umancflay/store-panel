// İkili dosya yardımcıları: Android native kütüphanelerinin (.so) bellek sayfası hizalaması ve bayt içinde metin arama.
// Google Play, Android 15+ hedefleyen uygulamalarda 16 KB sayfa boyutu uyumu istiyor: PT_LOAD hizalaması 16384 olmalı.

const PT_LOAD = 1

// PT_LOAD segmentlerinin en küçük p_align değeri; ELF değilse ya da segment yoksa null
export function elfLoadAlign(buf) {
  if (buf.length < 52 || buf.toString('latin1', 0, 4) !== '\x7fELF') return null
  const is64 = buf[4] === 2
  const le = buf[5] === 1
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o))
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
  const u64 = (o) => Number(le ? buf.readBigUInt64LE(o) : buf.readBigUInt64BE(o))

  const phoff = is64 ? u64(32) : u32(28)
  const phentsize = is64 ? u16(54) : u16(42)
  const phnum = is64 ? u16(56) : u16(44)
  let min = null
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize
    if (o + phentsize > buf.length) break
    if (u32(o) !== PT_LOAD) continue
    const align = is64 ? u64(o + 48) : u32(o + 28)
    if (min === null || align < min) min = align
  }
  return min
}

// Verilen metinlerden bayt dizisinde geçenleri döndürür (sıra korunur)
export function findNeedles(buf, needles) {
  return needles.filter((n) => buf.indexOf(n, 0, 'latin1') !== -1)
}
