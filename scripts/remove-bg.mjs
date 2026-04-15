// Removes near-white background from public/logo.png
// Also flood-fills from the edges so only the OUTER white area becomes transparent,
// leaving any white pixels inside the mascot intact (e.g. eyes, highlights).
import { Jimp } from 'jimp'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const inputPath = path.join(__dirname, '..', 'public', 'logo.png')
const outputPath = inputPath

// Tolerance: how close to pure white must a pixel be to count as background?
// 0 = only pure white, 30 = very close to white. Tweak if needed.
const TOLERANCE = 25

const img = await Jimp.read(inputPath)
const { width, height } = img.bitmap

const isWhitish = (r, g, b) =>
  r >= 255 - TOLERANCE && g >= 255 - TOLERANCE && b >= 255 - TOLERANCE

// Flood fill from every edge pixel that's whitish, marking which pixels are
// "outside" background. Only those pixels get cleared to transparent.
const visited = new Uint8Array(width * height)
const stack = []

const push = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const idx = y * width + x
  if (visited[idx]) return
  const pixelIdx = idx * 4
  const r = img.bitmap.data[pixelIdx]
  const g = img.bitmap.data[pixelIdx + 1]
  const b = img.bitmap.data[pixelIdx + 2]
  if (!isWhitish(r, g, b)) return
  visited[idx] = 1
  stack.push(x, y)
}

// Seed from all four edges
for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1) }
for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y) }

while (stack.length) {
  const y = stack.pop()
  const x = stack.pop()
  push(x + 1, y)
  push(x - 1, y)
  push(x, y + 1)
  push(x, y - 1)
}

// Clear alpha for every pixel marked as exterior background
let cleared = 0
for (let i = 0; i < visited.length; i++) {
  if (visited[i]) {
    img.bitmap.data[i * 4 + 3] = 0
    cleared++
  }
}

await img.write(outputPath)
console.log(`Done. Cleared ${cleared} of ${width * height} pixels (${((cleared / (width * height)) * 100).toFixed(1)}%).`)
console.log(`Output: ${outputPath}`)
