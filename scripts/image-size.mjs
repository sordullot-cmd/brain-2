/**
 * Lecture des dimensions d'une image en lisant seulement son en-tete.
 *
 * Sans dependance : le vault doit s'indexer hors ligne, et on ne veut pas
 * decoder 400 images a chaque `npm run dev`. On lit les premiers octets, on y
 * trouve largeur/hauteur, on s'arrete.
 *
 * Formats : PNG, JPEG, GIF, WebP, SVG. Retourne null si illisible.
 */
import fs from 'node:fs'

/** Lit au plus `n` octets en tete de fichier. */
function head(file, n = 65536) {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(n)
    const read = fs.readSync(fd, buf, 0, n, 0)
    return buf.subarray(0, read)
  } finally {
    fs.closeSync(fd)
  }
}

function png(b) {
  if (b.length < 24) return null
  // Signature PNG puis chunk IHDR : largeur et hauteur en big-endian.
  if (b.readUInt32BE(0) !== 0x89504e47) return null
  if (b.subarray(12, 16).toString('latin1') !== 'IHDR') return null
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

function gif(b) {
  if (b.length < 10 || b.subarray(0, 3).toString('latin1') !== 'GIF') return null
  return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) }
}

function jpeg(b) {
  if (b.length < 4 || b.readUInt16BE(0) !== 0xffd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1]
    // SOF0-3, SOF5-7, SOF9-11, SOF13-15 portent les dimensions.
    const isSOF =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    if (isSOF) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const len = b.readUInt16BE(i + 2)
    if (len < 2) return null
    i += 2 + len
  }
  return null
}

function webp(b) {
  if (b.length < 30) return null
  if (b.subarray(0, 4).toString('latin1') !== 'RIFF') return null
  if (b.subarray(8, 12).toString('latin1') !== 'WEBP') return null
  const chunk = b.subarray(12, 16).toString('latin1')

  if (chunk === 'VP8X') {
    const w = b.readUIntLE(24, 3) + 1
    const h = b.readUIntLE(27, 3) + 1
    return { w, h }
  }
  if (chunk === 'VP8 ') {
    return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24]
    const w = (((b1 & 0x3f) << 8) | b0) + 1
    const h = (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) + 1
    return { w, h }
  }
  return null
}

function svg(b) {
  const t = b.toString('utf8')
  const tag = /<svg\b[^>]*>/i.exec(t)
  if (!tag) return null
  const open = tag[0]

  const box = /viewBox\s*=\s*["']\s*[-\d.eE]+[\s,]+[-\d.eE]+[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)/i.exec(open)
  if (box) {
    const w = parseFloat(box[1])
    const h = parseFloat(box[2])
    if (w > 0 && h > 0) return { w, h }
  }

  // Pas de viewBox : on retombe sur width/height, a condition qu'ils soient absolus.
  const num = (attr) => {
    const m = new RegExp(`\\b${attr}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`, 'i').exec(open)
    return m ? parseFloat(m[1]) : null
  }
  const w = num('width')
  const h = num('height')
  return w > 0 && h > 0 ? { w, h } : null
}

const BINARY = [png, jpeg, gif, webp]
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'])

/**
 * Dimensions d'une image, ou null (format non gere ou fichier abime).
 *
 * Le format est reconnu a la signature, pas a l'extension : le vault contient
 * des JPEG nommes .png, et l'inverse arrive aussi.
 */
export function imageSize(file, ext) {
  if (!IMAGE_EXT.has(ext)) return null
  try {
    const b = head(file, 65536)
    let r = null
    for (const reader of BINARY) {
      r = reader(b)
      if (r) break
    }
    if (!r) r = svg(b)
    if (!r || !(r.w > 0) || !(r.h > 0)) return null
    return { w: Math.round(r.w), h: Math.round(r.h) }
  } catch {
    return null
  }
}
