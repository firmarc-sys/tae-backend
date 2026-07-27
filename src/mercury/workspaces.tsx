import { useState } from 'react'
import type { WorkspaceDefinition, WorkspaceProps } from './types'

function ChromeAction({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <button className="mercury-action" onClick={onClick}>{children}</button>
}

function Interweb({ onCommand }: WorkspaceProps) {
  const [query, setQuery] = useState('')
  return (
    <section className="workspace-content interweb-content" aria-label="Interweb workspace">
      <div className="workspace-kicker">INTERWEB</div>
      <h1>The world, inside your world.</h1>
      <form onSubmit={(event) => { event.preventDefault(); onCommand(`interweb ${query}`) }}>
        <label className="mercury-input">
          <span>Navigate</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask, search, or enter a destination" />
        </label>
      </form>
      <div className="signal-line"><i /><span>INTERSPACE · CONNECTED</span><i /></div>
      <p>Routes, agents, skills, pages, and tools resolve through one intent-aware network surface.</p>
    </section>
  )
}

function Home({ onNavigate }: WorkspaceProps) {
  return (
    <section className="workspace-content home-content" aria-label="Mercury home">
      <div className="workspace-kicker">MERCURY RUNTIME</div>
      <h1>Welcome home.</h1>
      <p className="home-declaration">This is not an app. This is me.</p>
      <div className="home-actions">
        <ChromeAction onClick={() => onNavigate('tae')}>Enter TAE</ChromeAction>
        <ChromeAction onClick={() => onNavigate('build')}>Build</ChromeAction>
      </div>
    </section>
  )
}

function InfiniteCanvas({ onNavigate }: WorkspaceProps) {
  return (
    <section className="workspace-content canvas-content" aria-label="Infinite Canvas workspace">
      <div className="workspace-kicker">INFINITE CANVAS</div>
      <h1>Behold the infinite canvas.</h1>
      <div className="canvas-map" aria-hidden="true">
        <span className="canvas-node node-a">PLAN</span>
        <span className="canvas-node node-b">BUILD</span>
        <span className="canvas-node node-c">REALIZE</span>
        <svg viewBox="0 0 400 180"><path d="M92 92 C150 12 247 12 310 88 M92 92 C164 162 244 156 310 88" /></svg>
      </div>
      <div className="home-actions">
        <ChromeAction onClick={() => onNavigate('plan')}>Plan</ChromeAction>
        <ChromeAction onClick={() => onNavigate('build')}>Build</ChromeAction>
      </div>
    </section>
  )
}

function Tae({ onCommand }: WorkspaceProps) {
  const [command, setCommand] = useState('TAE, enter Demo Mode')
  return (
    <section className="workspace-content tae-content" aria-label="TAE workspace">
      <div className="workspace-kicker">TAE · PRIME ORCHESTRATOR</div>
      <h1>Timeline Augmentation Engine</h1>
      <p>Tell. Evaluate. Accept.</p>
      <form onSubmit={(event) => { event.preventDefault(); onCommand(command) }}>
        <label className="mercury-input">
          <span>Command</span>
          <input value={command} onChange={(event) => setCommand(event.target.value)} />
        </label>
      </form>
    </section>
  )
}

function GenericWorkspace({ title, copy, command, onCommand }: WorkspaceProps & { title: string; copy: string; command: string }) {
  return (
    <section className="workspace-content generic-content">
      <div className="workspace-kicker">{title}</div>
      <h1>{copy}</h1>
      <ChromeAction onClick={() => onCommand(command)}>Activate</ChromeAction>
    </section>
  )
}

const generic = (title: string, copy: string, command: string) =>
  (props: WorkspaceProps) => <GenericWorkspace {...props} title={title} copy={copy} command={command} />

export const WORKSPACES: WorkspaceDefinition[] = [
  { id: 'interweb', label: 'Interweb', shortLabel: 'WEB', description: 'In-app intelligent browser', slot: 'left', glyph: '◎', component: Interweb },
  { id: 'home', label: 'Home', shortLabel: 'HOME', description: 'Persistent Mercury desktop', slot: 'center', glyph: '◉', component: Home },
  { id: 'canvas', label: 'Infinite Canvas', shortLabel: '∞', description: 'Spatial plan and realization canvas', slot: 'right', glyph: '∞', component: InfiniteCanvas },
  { id: 'tae', label: 'TAE', shortLabel: 'TAE', description: 'Timeline Augmentation Engine', slot: 'center', glyph: '△', component: Tae },
  { id: 'chat', label: 'Chat / Terminal', shortLabel: 'CHAT', description: 'Voice, text, and command workspace', slot: 'center', glyph: '⌁', component: generic('CHAT / TERMINAL', 'One conversation. Every tool.', 'open chat') },
  { id: 'plan', label: 'Plan', shortLabel: 'PLAN', description: 'Plans, approvals, and timelines', slot: 'right', glyph: '◇', component: generic('PLAN', 'Turn intent into an executable timeline.', 'open plan') },
  { id: 'build', label: 'Build', shortLabel: 'BUILD', description: 'Builder Canvas and preview', slot: 'right', glyph: '▱', component: generic('BUILD', 'Make the plan real.', 'open build') },
  { id: 'scribe', label: 'J A . i Scribe', shortLabel: 'SCRIBE', description: 'Physical notebook intelligence', slot: 'right', glyph: '✎', component: generic('J A . i SCRIBE', 'Write, edit, extract, and finish.', 'open scribe') },
  { id: 'loop', label: 'Loop Station', shortLabel: 'LOOP', description: 'Augmented audio looper', slot: 'right', glyph: '↻', component: generic('LOOP STATION', '∞ LOOP ACTIVE', 'open loop station') },
  { id: 'files', label: 'Files', shortLabel: 'FILES', description: 'Identity-owned file space', slot: 'left', glyph: '▤', component: generic('FILES', 'Your work remains yours.', 'open files') },
  { id: 'media', label: 'Media', shortLabel: 'MEDIA', description: 'Playback and realization media', slot: 'right', glyph: '▷', component: generic('MEDIA', 'See, hear, and shape the signal.', 'open media') },
  { id: 'settings', label: 'Settings', shortLabel: 'SET', description: 'Runtime and device controls', slot: 'center', glyph: '⚙', component: generic('SETTINGS', 'Control your environment.', 'open settings') },
]

export function getWorkspace(id: string) {
  return WORKSPACES.find((workspace) => workspace.id === id) ?? WORKSPACES[1]
}
