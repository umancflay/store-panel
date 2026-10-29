import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elfLoadAlign, findNeedles } from './binary.mjs'

// En küçük 64-bit little-endian ELF: başlık + program başlıkları
function elf64(aligns) {
  const phoff = 64
  const phentsize = 56
  const buf = Buffer.alloc(phoff + phentsize * aligns.length)
  buf.write('\x7fELF', 0, 'latin1')
  buf[4] = 2 // 64-bit
  buf[5] = 1 // little-endian
  buf.writeBigUInt64LE(BigInt(phoff), 32)
  buf.writeUInt16LE(phentsize, 54)
  buf.writeUInt16LE(aligns.length, 56)
  aligns.forEach((a, i) => {
    const o = phoff + i * phentsize
    buf.writeUInt32LE(1, o) // PT_LOAD
    buf.writeBigUInt64LE(BigInt(a), o + 48)
  })
  return buf
}

test('elfLoadAlign: PT_LOAD segmentlerinin en küçük hizalaması', () => {
  assert.equal(elfLoadAlign(elf64([0x4000, 0x1000])), 4096)
  assert.equal(elfLoadAlign(elf64([0x4000, 0x4000])), 16384)
})

test('elfLoadAlign: ELF olmayan dosya → null', () => {
  assert.equal(elfLoadAlign(Buffer.from('PK\x03\x04 bir zip')), null)
})

test('findNeedles: bulunan iğneleri döndürür', () => {
  const buf = Buffer.from('xx ca-app-pub-3940256099942544 yy Lcom/unity3d/ads/ zz')
  assert.deepEqual(findNeedles(buf, ['ca-app-pub-3940256099942544', 'zzz', 'Lcom/unity3d/ads/']), [
    'ca-app-pub-3940256099942544',
    'Lcom/unity3d/ads/',
  ])
})
