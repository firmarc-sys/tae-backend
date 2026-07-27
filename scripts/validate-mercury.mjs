import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const required = [
  'src/mercury/MercuryDesktop.tsx',
  'src/mercury/mercury.css',
  'src/mercury/workspaces.tsx',
  'src/mercury/useMercuryDesktop.ts',
  'docs/00_SOURCE_OF_TRUTH.md',
  'reports/GAP_ANALYSIS.md',
  'reports/MISSING_AND_NEEDED.md',
  'contracts/workspace-manifest.schema.json',
  'contracts/render-spec.schema.json',
  'public/manifest.json',
  'public/sw.js',
]

const failures = required.filter((file) => !existsSync(resolve(file)))
const source = readFileSync(resolve('src/mercury/MercuryDesktop.tsx'), 'utf8')
const css = readFileSync(resolve('src/mercury/mercury.css'), 'utf8')

for (const [name, condition] of [
  ['canonical GID', source.includes('identity.gid')],
  ['fixed Liquid Dock', css.includes('.liquid-dock') && css.includes('position: fixed')],
  ['portrait compositor', css.includes('max-aspect-ratio: 1/1')],
  ['48:9 compositor', css.includes('min-aspect-ratio: 4/1')],
  ['reduced motion', css.includes('prefers-reduced-motion')],
]) {
  if (!condition) failures.push(name)
}

if (failures.length) {
  console.error('Mercury validation failed:', failures.join(', '))
  process.exit(1)
}

console.log('Agentic Mercury TimeRunner structural validation passed.')
