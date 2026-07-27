import type { ComponentType } from 'react'

export type WorkspaceId =
  | 'interweb'
  | 'home'
  | 'canvas'
  | 'tae'
  | 'chat'
  | 'plan'
  | 'build'
  | 'scribe'
  | 'loop'
  | 'files'
  | 'media'
  | 'settings'

export interface WorkspaceDefinition {
  id: WorkspaceId
  label: string
  shortLabel: string
  description: string
  slot: 'left' | 'center' | 'right'
  glyph: string
  component: ComponentType<WorkspaceProps>
}

export interface WorkspaceProps {
  active: boolean
  onNavigate: (id: WorkspaceId) => void
  onCommand: (command: string) => void
}

export interface DesktopIconPosition {
  id: WorkspaceId
  x: number
  y: number
}

export type BootPhase = 'void' | 'forming' | 'declaration' | 'ready'
