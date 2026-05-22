import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { OrbViewer } from './OrbViewer'
import { useRuntime } from '../contexts/RuntimeContext'
import type { SIOSIdentity } from '../lib/identity'
import type { AccessState, RuntimePageId } from '../lib/runtimeAccess'
import { canAccessPage } from '../lib/runtimeAccess'

export interface RuntimePageDefinition {
  id: RuntimePageId
  label: string
  asset: string
  accent: string
  summary: string
  actions: { id: string; label: string; detail: string; command: string }[]
}

interface RuntimeShellProps {
  identity: SIOSIdentity
  access: AccessState
  activePage: RuntimePageId
  pages: RuntimePageDefinition[]
  onNavigate: (page: RuntimePageId) => void
}

function LockedState({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
      <div className="rounded-[2rem] border border-white/10 bg-black/45 px-6 py-6 backdrop-blur-xl">
        <div className="text-[10px] uppercase tracking-[0.45em] text-cyan-200/70">{label}</div>
        <div className="mt-4 text-[18px] uppercase tracking-[0.28em] text-white/92">Subscription Required</div>
        <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/45">Your SIOS runtime is reserved.</div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/45">Subscribe to activate this system layer.</div>
      </div>
    </div>
  )
}

export function RuntimeShell({ identity, access, activePage, pages, onNavigate }: RuntimeShellProps) {
  const { runtime, directCommand } = useRuntime()
  const [selectedAction, setSelectedAction] = useState<{ page: string; label: string; detail: string } | null>(null)
  const [statusMessage, setStatusMessage] = useState('')

  const page = useMemo(() => pages.find((entry) => entry.id === activePage) ?? pages[0], [activePage, pages])
  const unlocked = canAccessPage(access, page.id)
  const pageIndex = pages.findIndex((entry) => entry.id === page.id)
  const nextPage = pages[(pageIndex + 1) % pages.length]
  const pageLines = {
  'command-center': ['STATUS: ONLINE', 'ORCHESTRATOR: ACTIVE', 'NODES: 2,048', 'THREAT: NOMINAL'],
  'galactic-id': ['NAME: JORGE DELGADO', 'GID: 399152573423', 'ROLE: OWNER', 'CLEARANCE: ROOT'],
  'syncori': ['ENGINE: v4.2.1', 'THREADS: 512', 'FRAMERATE: 144 FPS', 'PIPELINE: STREAMING'],
  'iot-field': ['ONLINE: 1,337', 'GLASSES: 4', 'MESH: ACTIVE', 'THROUGHPUT: 42 GB/s'],
  'alphabeta': ['SUBSCRIBERS: 88,421', 'ALPHA: 312', 'PROGRAM: PHASE III', 'COMPLIANCE: 100%'],
  'novalife-vulgate': ['NOVA: ONLINE', 'VULGATE: SYNCHRONIZED', 'INSTANCES: 7', 'HANDSHAKE: 0.001s AGO'],
  'tae-runtime': ['VERSION: 7.0.0-PRIME', 'RUNTIME: EXECUTING', 'THREADS: 4,096', 'DEMO MODE: STANDBY'],
}[page.id] || []

  const handleAction = async (action: RuntimePageDefinition['actions'][number]) => {
    setSelectedAction({ page: page.label, label: action.label, detail: action.detail })
    setStatusMessage(`${action.label.toUpperCase()} CONFIRMED`)
    
    // Command routing mapping (from reference)
    const cmdLower = action.command.toLowerCase()
    let targetId = activePage
    
    if (cmdLower.includes('identity') || cmdLower.includes('gid')) {
      targetId = 'galactic-id'
    } else if (cmdLower.includes('syncori') || cmdLower.includes('sync')) {
      targetId = 'syncori'
    } else if (cmdLower.includes('iot') || cmdLower.includes('device') || cmdLower.includes('glasses')) {
      targetId = 'iot-field'
    } else if (cmdLower.includes('alpha') || cmdLower.includes('subscriber')) {
      targetId = 'alphabeta'
    } else if (cmdLower.includes('nova') || cmdLower.includes('vulgate')) {
      targetId = 'novalife-vulgate'
    } else if (cmdLower.includes('tae') || cmdLower.includes('runtime')) {
      targetId = 'tae-runtime'
    } else if (cmdLower.includes('command') || cmdLower.includes('dashboard')) {
      targetId = 'command-center'
    }

    if (targetId !== activePage) {
      setTimeout(() => {
        onNavigate(targetId)
        setSelectedAction(null)
      }, 1500)
    }

    await directCommand(action.command)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(120,180,255,0.18),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.06),transparent_30%)]" />
      <AnimatePresence mode="wait">
        <motion.div
          key={page.id}
          initial={{ opacity: 0, scale: 1.02, filter: 'blur(18px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.985, filter: 'blur(18px)' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <img src={page.asset} alt={page.label} className="h-full w-full object-cover opacity-72" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.72))]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_18%,rgba(0,0,0,0.55)_72%)]" />
        </motion.div>
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-4 text-[10px] uppercase tracking-[0.35em] text-white/70">
        <div>SIOS</div>
        <div>{identity.mode}</div>
      </div>

      <div className="absolute inset-x-0 top-12 z-20 px-4">
        <div className="mx-auto max-w-md rounded-[1.8rem] border border-white/10 bg-black/28 px-4 py-3 backdrop-blur-xl">
          <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-200/70">{page.label}</div>
          <div className="mt-1 mb-2 text-[11px] uppercase tracking-[0.18em] text-white/55">{page.summary}</div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent my-2" />
          <div className="space-y-1">
            {pageLines.map((line, i) => (
              <div key={i} className="text-[9px] uppercase tracking-[0.2em] text-white/60">
                {line.split(':')[0]} <span className="text-white/30">........</span> <span className="text-white/80">{line.split(':')[1]}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[9px] uppercase tracking-[0.22em] text-cyan-100/60">{statusMessage || runtime.lastCommand || 'Runtime synchronized'}</div>
        </div>
      </div>

      <div className="absolute left-1/2 top-[44%] z-20 -translate-x-1/2 -translate-y-1/2">
        <OrbViewer
          size={240}
          state={runtime.taeState === 'LISTENING' ? 'listening' : runtime.taeState === 'GENERATING' ? 'generating' : access.isOwner ? 'owner_mode' : 'idle'}
          tier={access.isOwner ? 'owner' : access.tier}
          intensity={access.isOwner ? 1.08 : 0.92}
          glowPulse={access.isOwner ? 1.35 : 1.05}
        />
      </div>

      <div className="absolute inset-x-0 bottom-28 z-20 px-4">
        <div className="mx-auto mb-3 flex max-w-md items-center justify-between rounded-[1.2rem] border border-white/10 bg-black/28 px-4 py-3 text-[9px] uppercase tracking-[0.22em] text-white/55 backdrop-blur-xl">
          <span>{access.isOwner ? 'Owner runtime unlocked' : 'Public showcase mode'}</span>
          <button onClick={() => onNavigate(nextPage.id)} className="text-cyan-200/80">Next page</button>
        </div>
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          {pages.map((entry) => {
            const enabled = canAccessPage(access, entry.id)
            return (
              <button
                key={entry.id}
                onClick={() => onNavigate(entry.id)}
                className={`rounded-[1.2rem] border px-3 py-2 text-left text-[9px] uppercase tracking-[0.22em] backdrop-blur-xl transition ${entry.id === activePage ? 'border-cyan-300/60 bg-cyan-300/12 text-cyan-100' : 'border-white/10 bg-black/28 text-white/62'} ${enabled ? 'opacity-100' : 'opacity-55'}`}
              >
                <div>{entry.label}</div>
                <div className="mt-1 text-[8px] text-white/35">{enabled ? 'active' : 'locked'}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-4 z-20 px-4">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          {page.actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              className="rounded-[1.2rem] border border-white/10 bg-black/35 px-3 py-3 text-left text-[9px] uppercase tracking-[0.22em] text-white/78 backdrop-blur-xl transition hover:border-cyan-300/45 hover:text-cyan-100"
            >
              <div>{action.label}</div>
              <div className="mt-1 text-[8px] text-white/35">{action.detail}</div>
            </button>
          ))}
        </div>
      </div>

      {!unlocked && <LockedState label={page.label} />}

      <AnimatePresence>
        {selectedAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-6 backdrop-blur-md"
            onClick={() => setSelectedAction(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ duration: 0.28 }}
              className="w-full max-w-sm rounded-[2rem] border border-cyan-300/20 bg-black/72 px-5 py-5"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-200/70">{selectedAction.page}</div>
              <div className="mt-3 text-[16px] uppercase tracking-[0.22em] text-white/92">{selectedAction.label}</div>
              <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/55">{selectedAction.detail}</div>
              <div className="mt-5 flex items-center justify-between text-[10px] uppercase tracking-[0.28em] text-white/45">
                <span>{access.isOwner ? 'Prime Orchestrator Verified' : 'Runtime Action Confirmed'}</span>
                <button onClick={() => setSelectedAction(null)} className="text-cyan-200/80">Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
