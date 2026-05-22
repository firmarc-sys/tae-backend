import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { RuntimeProvider } from './contexts/RuntimeContext'
import { BootScreen } from './components/BootScreen'
import { Onboarding } from './components/Onboarding'
import { RuntimeShell } from './components/RuntimeShell'
import { OpeningCinematic } from './components/OpeningCinematic'
import { RuntimeVerification } from './components/RuntimeVerification'
import { PortraitFrame } from './components/PortraitFrame'
import type { SIOSIdentity } from './lib/identity'
import { OWNER_IDENTITY, applyIdentityColors, isOwner } from './lib/identity'
import { clearIdentity, loadIdentity, saveIdentity, saveSession } from './lib/storage'
import { getSession, onAuthChange, signOut } from './lib/supabase'
import { createIdentityRender } from './runtime/IdentityRender'
import { audioReactor } from './runtime/AudioReactor'
import { tae } from './runtime/TAE'
import { getAccessState, type RuntimePageId, updateSubscriberRecord } from './lib/runtimeAccess'
import { RUNTIME_PAGES } from './lib/runtimePages'

type AppPhase = 'boot' | 'onboarding' | 'runtime'

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('boot')
  const [identity, setIdentity] = useState<SIOSIdentity | null>(null)
  const [activePage, setActivePage] = useState<RuntimePageId>('command-center')
  const [showOpening, setShowOpening] = useState(false)
  const [showVerification, setShowVerification] = useState(false)

  useEffect(() => {
    audioReactor.resume()
    const saved = loadIdentity()
    if (saved) {
      setIdentity(saved)
      applyIdentityColors(saved.renderProfile)
      createIdentityRender(saved)
      setPhase('runtime')
      tae.activateState('idle')
      setShowOpening(true)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      const session = await getSession()
      const email = session?.user?.email ?? null
      if (!email) return
      if (isOwner(email)) {
        const ownerIdentity = { ...OWNER_IDENTITY, email }
        setIdentity(ownerIdentity)
        saveIdentity(ownerIdentity)
        saveSession(ownerIdentity.gid, ownerIdentity.role)
        applyIdentityColors(ownerIdentity.renderProfile)
        createIdentityRender(ownerIdentity)
        setPhase('runtime')
        setShowOpening(true)
        tae.activateState('awakening')
      }
    }
    init()

    const unsub = onAuthChange((event, email) => {
      if (event === 'SIGNED_IN' && email && isOwner(email)) {
        const ownerIdentity = { ...OWNER_IDENTITY, email }
        setIdentity(ownerIdentity)
        saveIdentity(ownerIdentity)
        saveSession(ownerIdentity.gid, ownerIdentity.role)
        applyIdentityColors(ownerIdentity.renderProfile)
        createIdentityRender(ownerIdentity)
        setPhase('runtime')
        setShowOpening(true)
      }
      if (event === 'SIGNED_OUT') {
        clearIdentity()
        setIdentity(null)
        setPhase('boot')
      }
    })

    return unsub
  }, [])

  const access = useMemo(() => getAccessState(identity), [identity])

  const handleOnboardingComplete = (nextIdentity: SIOSIdentity) => {
    setIdentity(nextIdentity)
    saveIdentity(nextIdentity)
    saveSession(nextIdentity.gid, nextIdentity.role)
    applyIdentityColors(nextIdentity.renderProfile)
    createIdentityRender(nextIdentity)
    updateSubscriberRecord({}, nextIdentity)
    setPhase('runtime')
    setShowOpening(true)
  }

  const handleNavigate = (page: RuntimePageId) => {
    setActivePage(page)
    tae.queueCommand(`open ${page}`)
  }

  const handleOpeningComplete = () => {
    setShowOpening(false)
    setShowVerification(true)
    tae.activateState(access.isOwner ? 'owner_mode' : 'idle')
  }

  const handleVerificationDone = () => {
    setShowVerification(false)
    setActivePage('command-center')
  }

  const handleLogout = async () => {
    clearIdentity()
    setIdentity(null)
    setPhase('boot')
    await signOut().catch(() => {})
  }

  return (
    <RuntimeProvider identity={identity}>
      <div className="relative h-screen w-full overflow-hidden bg-black text-white" style={{ fontFamily: 'var(--font-main)' }}>
        <PortraitFrame>
          <AnimatePresence mode="wait">
            {phase === 'boot' && <BootScreen key="boot" onComplete={() => setPhase('onboarding')} />}
            {phase === 'onboarding' && <Onboarding key="onboarding" onComplete={handleOnboardingComplete} />}
            {phase === 'runtime' && identity && (
              <RuntimeShell
                key="runtime"
                identity={identity}
                access={access}
                activePage={activePage}
                pages={RUNTIME_PAGES}
                onNavigate={handleNavigate}
              />
            )}
          </AnimatePresence>

          <OpeningCinematic active={showOpening} onComplete={handleOpeningComplete} />
          <RuntimeVerification active={showVerification} onDone={handleVerificationDone} />

          {phase === 'runtime' && identity && (
            <button
              onClick={handleLogout}
              className="absolute right-4 top-4 z-50 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-[10px] uppercase tracking-[0.28em] text-white/65 backdrop-blur-xl"
            >
              Logout
            </button>
          )}
        </PortraitFrame>
      </div>
    </RuntimeProvider>
  )
}
