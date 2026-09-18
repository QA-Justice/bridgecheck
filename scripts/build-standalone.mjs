import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDirectory = resolve(projectRoot, 'dist')
const outputPath = resolve(projectRoot, 'bridgecheck.html')

let html = await readFile(resolve(distDirectory, 'index.html'), 'utf8')

const stylesheetPattern = /<link rel="stylesheet" crossorigin href="([^"]+)">/
const scriptPattern = /<script type="module" crossorigin src="([^"]+)"><\/script>/
const stylesheetMatch = html.match(stylesheetPattern)
const scriptMatch = html.match(scriptPattern)

if (!stylesheetMatch || !scriptMatch) {
  throw new Error('Could not find the Vite stylesheet and script in dist/index.html.')
}

async function readDistAsset(assetPath) {
  const relativePath = assetPath.replace(/^\.\//, '')
  return readFile(resolve(distDirectory, relativePath), 'utf8')
}

const [css, javascript] = await Promise.all([
  readDistAsset(stylesheetMatch[1]),
  readDistAsset(scriptMatch[1]),
])
const inlineStyle = `<style>\n${css}\n</style>`
const inlineScript = `<script type="module">\n${javascript.replaceAll('</script', '<\\/script')}\n</script>`

html = html
  .replace(stylesheetPattern, () => inlineStyle)
  .replace(scriptPattern, () => inlineScript)
  .replace(
    '<meta name="description"',
    '<meta name="bridgecheck-build" content="standalone" />\n    <meta name="description"',
  )

const markupOnly = html
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
const localAssetReferences = [...markupOnly.matchAll(/(?:src|href)="(?!data:|#|https?:|mailto:)([^"]+)"/g)]

if (localAssetReferences.length > 0) {
  const paths = localAssetReferences.map((match) => match[1]).join(', ')
  throw new Error(`Standalone HTML still contains local asset references: ${paths}`)
}

if (!html.includes(inlineStyle) || !html.includes(inlineScript)) {
  throw new Error('Inlined assets differ from the Vite build output.')
}

await writeFile(outputPath, html)

const sizeInKiB = (Buffer.byteLength(html) / 1024).toFixed(1)
console.log(`Created bridgecheck.html (${sizeInKiB} KiB)`)
