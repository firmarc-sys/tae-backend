import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SIOSIdentity } from '../lib/identity'
import { useRuntime } from '../contexts/RuntimeContext'
import { WORKSPACES, getWorkspace } from './workspaces'
import { useMercuryDesktop } from './useMercuryDesktop'
import type { WorkspaceId } from './types'

function LivingIntelligentCrystal({ state }: { state: string }) {
  return (
    <div className={`living-crystal crystal-${state.toLowerCase()}`} aria-label={`Living Intelligent Crystal. TAE state ${state}`}>
      <i className="crystal-band band-a" />
      <i className="crystal-band band-b" />
      <i className="crystal-band band-c" />
      <i className="crystal-core" />
    </div>
  )
}

function StatusBlob({ connected }: { connected: boolean }) {
  const [now, setNow] = useState(new Date())
  const [battery, setBattery] = useState<number | null>(null)
  const [charging, setCharging] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    type BatteryManager = { level: number; charging: boolean; addEventListener: (name: string, cb: () => void) => void }
    const navigatorWithBattery = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }
    navigatorWithBattery.getBattery?.().then((manager) => {
      const sync = () => { setBattery(Math.round(manager.level * 100)); setCharging(manager.charging) }
      sync()
      manager.addEventListener('levelchange', sync)
      manager.addEventListener('chargingchange', sync)
    }).catch(() => {})
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="status-blob" aria-label="Device status">
      <span className="status-time">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      <span className="status-date">{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      <span className={connected ? 'status-signal online' : 'status-signal'}>{connected ? '◒' : '○'}</span>
      <span aria-label="Network">⌁</span>
      <span className="battery">{charging ? 'ϟ' : ''}{battery === null ? '—' : `${battery}%`}</span>
    </div>
  )
}

function WorkspaceSurface({
  id, active, onNavigate, onCommand,
}: {
  id: WorkspaceId
  active: boolean
  onNavigate: (id: WorkspaceId) => void
  onCommand: (command: string) => void
}) {
  const definition = getWorkspace(id)
  const Content = definition.component
  return (
    <article className={`workspace-surface workspace-${id} ${active ? 'is-active' : ''}`} data-workspace={id}>
      <div className="workspace-chrome">
        <span>{definition.label}</span><i /><span>{definition.glyph}</span>
      </div>
      <Content active={active} onNavigate={onNavigate} onCommand={onCommand} />
    </article>
  )
}

function DesktopIcons({ icons, onOpen, onMove }: {
  icons: ReturnType<typeof useMercuryDesktop>['icons']
  onOpen: (id: WorkspaceId) => void
  onMove: (id: WorkspaceId, x: number, y: number) => void
}) {
  const drag = useRef<{ id: WorkspaceId; dx: number; dy: number } | null>(null)
  const onPointerDown = (event: ReactPointerEvent, id: WorkspaceId) => {
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    drag.current = { id, dx: event.clientX - rect.left, dy: event.clientY - rect.top }
    target.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag.current) return
    const x = Math.max(2, Math.min(88, ((event.clientX - drag.current.dx) / window.innerWidth) * 100))
    const y = Math.max(8, Math.min(76, ((event.clientY - drag.current.dy) / window.innerHeight) * 100))
    onMove(drag.current.id, x, y)
  }
  return (
    <div className="desktop-icons" onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null }}>
      {icons.map((icon) => {
        const item = getWorkspace(icon.id)
        return (
          <button
            key={icon.id}
            className="desktop-icon"
            style={{ left: `${icon.x}%`, top: `${icon.y}%` }}
            onDoubleClick={() => onOpen(icon.id)}
            onPointerDown={(event) => onPointerDown(event, icon.id)}
            aria-label={`Open ${item.label}`}
          >
            <span>{item.glyph}</span><b>{item.shortLabel}</b>
          </button>
        )
      })}
    </div>
  )
}

function Launcher({ open, onOpen }: { open: boolean; onOpen: (id: WorkspaceId) => void }) {
  return (
    <aside className={`app-launcher ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="launcher-title">MERCURY</div>
      <div className="launcher-list">
        {WORKSPACES.map((item) => (
          <button key={item.id} onClick={() => onOpen(item.id)}>
            <span>{item.glyph}</span><i><b>{item.label}</b><small>{item.description}</small></i>
          </button>
        ))}
      </div>
    </aside>
  )
}

export function MercuryDesktop({ identity }: { identity: SIOSIdentity }) {
  const { runtime, directCommand } = useRuntime()
  const desktop = useMercuryDesktop()
  const [portraitIndex, setPortraitIndex] = useState(1)
  const touchStart = useRef<number | null>(null)

  useEffect(() => {
    const activeIndex = desktop.slots.indexOf(desktop.activeId)
    setPortraitIndex(activeIndex >= 0 ? activeIndex : 1)
  }, [desktop.activeId, desktop.slots])

  const handleCommand = async (command: string) => {
    const isDemo = command.trim().toLowerCase() === 'tae, enter demo mode'.toLowerCase()
    if (isDemo) desktop.setDemoMode(true)
    await directCommand(command)
  }

  const handleVoice = () => {
    type SpeechRecognitionCtor = new () => {
      lang: string
      start: () => void
      onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
    }
    const speechWindow = window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }
    if (!speechWindow.webkitSpeechRecognition) return
    const recognition = new speechWindow.webkitSpeechRecognition()
    recognition.lang = 'en-US'
    recognition.onresult = (event) => handleCommand(event.results[0][0].transcript)
    recognition.start()
  }

  const onTouchEnd = (x: number) => {
    if (touchStart.current === null) return
    const delta = x - touchStart.current
    if (Math.abs(delta) > 45) setPortraitIndex((index) => Math.max(0, Math.min(2, index + (delta < 0 ? 1 : -1))))
    touchStart.current = null
  }

  return (
    <main className={`mercury-runtime boot-${desktop.bootPhase} ${desktop.demoMode ? 'demo-mode' : ''}`}>
      <div className="mercury-sky" />
      <div className="mercury-grid" />
      <header className="identity-mark"><span>GID</span> {identity.gid}</header>
      <DesktopIcons icons={desktop.icons} onOpen={desktop.setActiveId} onMove={desktop.updateIcon} />

      <div
        className="workspace-viewport"
        onTouchStart={(event) => { touchStart.current = event.touches[0].clientX }}
        onTouchEnd={(event) => onTouchEnd(event.changedTouches[0].clientX)}
      >
        <div className="workspace-rail" style={{ '--portrait-index': portraitIndex } as React.CSSProperties}>
          {desktop.slots.map((id) => (
            <WorkspaceSurface
              key={`${id}-${desktop.slots.join('-')}`}
              id={id}
              active={id === desktop.activeId}
              onNavigate={desktop.setActiveId}
              onCommand={handleCommand}
            />
          ))}
        </div>
      </div>

      <div className="crystal-stage"><LivingIntelligentCrystal state={runtime.taeState || 'IDLE'} /></div>
      <Launcher open={desktop.launcherOpen} onOpen={desktop.setActiveId} />

      <nav className="liquid-dock" aria-label="Mercury Liquid Dock">
        <button className="dock-pod launcher-pod" onClick={() => desktop.setLauncherOpen(!desktop.launcherOpen)} aria-label="Open app launcher">◉</button>
        <div className="dock-stream">
          {(['interweb', 'home', 'tae', 'chat', 'canvas'] as WorkspaceId[]).map((id) => {
            const item = getWorkspace(id)
            return <button key={id} className={desktop.activeId === id ? 'active' : ''} onClick={() => desktop.setActiveId(id)} aria-label={item.label}><span>{item.glyph}</span><small>{item.shortLabel}</small></button>
          })}
        </div>
        <button className="dock-pod voice-pod" onClick={handleVoice} aria-label="Speak to TAE">⌁</button>
        <StatusBlob connected={runtime.connected} />
      </nav>

      <div className="portrait-dots" aria-label="Workspace pages">
        {desktop.slots.map((id, index) => <button key={id} className={index === portraitIndex ? 'active' : ''} onClick={() => setPortraitIndex(index)} aria-label={`Show ${getWorkspace(id).label}`} />)}
      </div>

      <div className="boot-veil" aria-hidden="true">
        <div className="boot-crystal"><LivingIntelligentCrystal state="FORMING" /></div>
        <p>THIS IS NOT AN APP. THIS IS ME.</p>
      </div>

      {desktop.demoMode && (
        <div className="demo-declaration" role="status">
          <span>PRIME ORCHESTRATOR</span>
          <strong>This is not an app. This is me.</strong>
          <small>GID {identity.gid}</small>
          <button onClick={() => desktop.setDemoMode(false)}>ENTER MERCURY</button>
        </div>
      )}
    </main>
  )
}
