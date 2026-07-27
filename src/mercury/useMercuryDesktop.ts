import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BootPhase, DesktopIconPosition, WorkspaceId } from './types'
import { WORKSPACES } from './workspaces'

const ICON_KEY = 'mercury.desktop.icons.v1'
const ACTIVE_KEY = 'mercury.desktop.active.v1'

const defaultIcons: DesktopIconPosition[] = WORKSPACES.slice(3).map((workspace, index) => ({
  id: workspace.id,
  x: 4 + (index % 2) * 11,
  y: 14 + Math.floor(index / 2) * 15,
}))

export function useMercuryDesktop() {
  const [bootPhase, setBootPhase] = useState<BootPhase>('void')
  const [activeId, setActiveIdState] = useState<WorkspaceId>(() => {
    const saved = localStorage.getItem(ACTIVE_KEY) as WorkspaceId | null
    return WORKSPACES.some((item) => item.id === saved) ? saved! : 'home'
  })
  const [icons, setIcons] = useState<DesktopIconPosition[]>(() => {
    try { return JSON.parse(localStorage.getItem(ICON_KEY) || '') as DesktopIconPosition[] } catch { return defaultIcons }
  })
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [demoMode, setDemoMode] = useState(false)

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setBootPhase('forming'), 250),
      window.setTimeout(() => setBootPhase('declaration'), 1700),
      window.setTimeout(() => setBootPhase('ready'), 3000),
    ]
    return () => timers.forEach(window.clearTimeout)
  }, [])

  const setActiveId = useCallback((id: WorkspaceId) => {
    setActiveIdState(id)
    localStorage.setItem(ACTIVE_KEY, id)
    setLauncherOpen(false)
    history.replaceState({}, '', `#/${id}`)
  }, [])

  useEffect(() => {
    const route = location.hash.replace(/^#\//, '') as WorkspaceId
    if (WORKSPACES.some((item) => item.id === route)) setActiveId(route)
  }, [setActiveId])

  const updateIcon = useCallback((id: WorkspaceId, x: number, y: number) => {
    setIcons((current) => {
      const next = current.map((icon) => icon.id === id ? { ...icon, x, y } : icon)
      localStorage.setItem(ICON_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const slots = useMemo(() => {
    const active = WORKSPACES.find((item) => item.id === activeId)!
    if (active.slot === 'left') return [activeId, 'home', 'canvas'] as WorkspaceId[]
    if (active.slot === 'right') return ['interweb', 'home', activeId] as WorkspaceId[]
    return ['interweb', activeId, 'canvas'] as WorkspaceId[]
  }, [activeId])

  return {
    bootPhase, activeId, setActiveId, slots, icons, updateIcon,
    launcherOpen, setLauncherOpen, demoMode, setDemoMode,
  }
}
