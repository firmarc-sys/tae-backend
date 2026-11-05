import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type SpokenWelcomeProps = {
  onComplete: () => void
}

type VoicePhase = 'ready' | 'speaking' | 'complete' | 'text-only'

const LINES = [
  'I am Jahorin.',
  'As I speak, your space takes form.',
  'The interface responds to intention.',
  'Meet Jahorin. Tell me what you want to create.',
] as const

const LAST_LINE = LINES[LINES.length - 1]

/**
 * The boot sequence hands off here. Browser speech boundary events reveal
 * the spoken words and progressively materialize the welcome surfaces.
 *
 * This is deterministic speech-led UI construction, not an AI-generated
 * layout or an always-listening microphone. No external TTS credentials.
 */
export function SpokenWelcome({ onComplete }: SpokenWelcomeProps) {
  const [phase, setPhase] = useState<VoicePhase>('ready')
  const [lineIndex, setLineIndex] = useState(-1)
  const [revealed, setRevealed] = useState(0)
  const [voiceError, setVoiceError] = useState(false)
  const running = useRef(false)
  const timers = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer)
    timers.current = []
  }, [])

  const stopVoice = useCallback(() => {
    running.current = false
    clearTimers()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }, [clearTimers])

  useEffect(() => () => stopVoice(), [stopVoice])

  const revealWithoutSpeech = useCallback(() => {
    stopVoice()
    setLineIndex(LINES.length - 1)
    setRevealed(LAST_LINE.length)
    setPhase('text-only')
  }, [stopVoice])

  const begin = useCallback(() => {
    const supported = typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && 'SpeechSynthesisUtterance' in window

    if (!supported) {
      setVoiceError(true)
      revealWithoutSpeech()
      return
    }

    stopVoice()
    setVoiceError(false)
    setPhase('speaking')
    setLineIndex(-1)
    setRevealed(0)
    running.current = true
    const synth = window.speechSynthesis
    let index = 0

    const speakNext = () => {
      if (!running.current) return
      if (index >= LINES.length) {
        running.current = false
        setPhase('complete')
        return
      }

      const words = LINES[index]
      setLineIndex(index)
      setRevealed(0)
      const utterance = new SpeechSynthesisUtterance(words)
      utterance.lang = 'en-US'
      utterance.rate = 0.88
      utterance.pitch = 0.9
      utterance.volume = 1

      let gotBoundary = false
      let settled = false
      let wordCursor = 0
      const ends = Array.from(words.matchAll(/\S+\s*/g), match =>
        (match.index ?? 0) + match[0].length
      )

      // Some mobile speech engines omit boundary events. In that case,
      // approximate word pacing while speech plays, and expose no false
      // claim of phoneme-accurate synchronization.
      const pace = window.setInterval(() => {
        if (!running.current || gotBoundary || wordCursor >= ends.length) return
        setRevealed(ends[wordCursor])
        wordCursor += 1
      }, 260)
      timers.current.push(pace)

      const watchdog = window.setTimeout(() => {
        if (!running.current || settled) return
        settled = true
        setVoiceError(true)
        revealWithoutSpeech()
      }, 12000)
      timers.current.push(watchdog)

      const completeLine = () => {
        if (!running.current || settled) return
        settled = true
        window.clearInterval(pace)
        window.clearTimeout(watchdog)
        setRevealed(words.length)
        const pause = window.setTimeout(() => {
          index += 1
          speakNext()
        }, 440)
        timers.current.push(pause)
      }

      utterance.onboundary = event => {
        if (!running.current) return
        gotBoundary = true
        const endOfWord = words.indexOf(' ', event.charIndex)
        setRevealed(endOfWord < 0 ? words.length : endOfWord + 1)
      }
      utterance.onend = completeLine
      utterance.onerror = () => {
        if (!running.current || settled) return
        settled = true
        setVoiceError(true)
        revealWithoutSpeech()
      }

      synth.speak(utterance)
    }

    speakNext()
  }, [revealWithoutSpeech, stopVoice])

  const material = lineIndex >= 0
  const viewport = lineIndex >= 1
  const intent = lineIndex >= 2
  const complete = phase === 'complete' || phase === 'text-only'
  const spokenLine = lineIndex >= 0 ? LINES[lineIndex] : ''
  const transcript = spokenLine.slice(0, revealed)

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto overflow-x-hidden bg-[#02040a] text-white"
      aria-label="Jahorin spoken welcome">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_65%,rgba(40,84,132,0.22),transparent_70%),linear-gradient(180deg,#030817_0%,#071422_52%,#010306_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[46%] h-[20%] bg-[linear-gradient(180deg,transparent,rgba(255,186,92,0.1),transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] opacity-70"
        style={{ background: 'repeating-linear-gradient(178deg,rgba(189,220,249,0.11) 0px,transparent 2px,transparent 25px),linear-gradient(180deg,transparent,rgba(6,30,52,0.55))' }} />

      <header className="relative z-10 mx-auto flex w-full max-w-[1280px] items-center justify-between px-6 pt-7 sm:px-12">
        <span className="text-xs font-semibold tracking-[0.42em] text-white/85">JAHORIN</span>
        <span className="text-[9px] uppercase tracking-[0.2em] text-sky-100/55">UNITED AGENTIC ECOSYSTEM</span>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100dvh-110px)] w-full max-w-[1280px] items-center gap-5 px-6 pb-10 pt-5 sm:px-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="relative mx-auto flex h-[min(39vh,380px)] w-full max-w-[570px] items-center justify-center sm:h-[min(44vh,480px)] lg:h-[min(70vh,660px)]">
          <AnimatePresence>
            {material && (
              <motion.div
                initial={{ opacity: 0, scale: 0.38, filter: 'blur(28px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                className="absolute aspect-square w-[min(57vw,300px)] rounded-full sm:w-[min(48vw,370px)] lg:w-[min(28vw,400px)]"
                style={{
                  background: 'radial-gradient(circle at 30% 23%,rgba(255,255,255,0.98) 0%,rgba(228,238,247,0.92) 13%,rgba(105,132,158,0.88) 33%,rgba(8,22,42,0.98) 67%,rgba(165,194,217,0.84) 88%,rgba(235,245,251,0.98) 100%)',
                  boxShadow: 'inset -22px -26px 42px rgba(0,0,0,0.85),inset 18px 14px 30px rgba(255,255,255,0.55),0 0 85px rgba(153,198,233,0.17)',
                }}
              >
                <motion.div
                  animate={{ borderRadius: ['46% 54% 48% 52%', '52% 43% 57% 48%', '45% 55% 44% 56%', '46% 54% 48% 52%'], rotate: [0, 12, -8, 0] }}
                  transition={{ duration: 12, ease: 'easeInOut', repeat: Infinity }}
                  className="absolute inset-[7%] border border-white/20 bg-[radial-gradient(ellipse_at_65%_70%,rgba(238,249,255,0.4),transparent_40%)]"
                />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {viewport && (
              <motion.div
                initial={{ opacity: 0, scale: 0.68, borderRadius: 150 }}
                animate={{ opacity: 1, scale: 1, borderRadius: 28 }}
                transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                className="absolute h-[78%] w-[94%] border border-sky-100/20 bg-[linear-gradient(145deg,rgba(217,239,255,0.09),rgba(5,14,29,0.1)_60%,rgba(174,215,248,0.05))] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_24px_90px_rgba(0,0,0,0.4)] backdrop-blur-[2px]"
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {intent && (
              <motion.div
                initial={{ opacity: 0, y: 30, filter: 'blur(12px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                className="absolute bottom-[4%] flex w-[86%] items-center justify-between rounded-2xl border border-sky-200/25 bg-[#091526]/65 px-5 py-4 shadow-xl backdrop-blur-xl"
              >
                <span className="text-[11px] uppercase tracking-[0.2em] text-sky-100/75">INTENTION → INTERFACE</span>
                <span className="h-2 w-2 rounded-full bg-sky-200 shadow-[0_0_18px_rgba(180,220,255,0.7)]" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <section className="relative mx-auto flex w-full max-w-[530px] flex-col items-start gap-5">
          <p className="text-[10px] uppercase tracking-[0.35em] text-sky-200/65">THE AWAKENING · WELCOME</p>
          <h1 className="max-w-[16ch] text-[clamp(2.2rem,5vw,4.5rem)] font-light leading-[1.07] tracking-[-0.04em] text-white">
            An interface spoken into existence.
          </h1>
          <div className="min-h-[95px] w-full rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-lg"
            role="status" aria-live="polite" aria-atomic="true">
            <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-sky-100/50">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-200" />
              {phase === 'speaking' ? 'JAHORIN SPEAKING' : complete ? 'VOICE SEQUENCE COMPLETE' : 'AWAITING AUDIO ACTIVATION'}
            </div>
            <p className="min-h-[28px] text-[clamp(1rem,2vw,1.3rem)] tracking-wide text-sky-50/90">
              {transcript || (phase === 'ready' ? 'Activate the voice to begin creating your space.' : ' ')}
              {phase === 'speaking' && <span className="ml-1 inline-block h-4 w-px animate-pulse bg-white/60" />}
            </p>
          </div>
          {voiceError && (
            <p className="text-sm text-amber-100/80">
              Audible narration is unavailable in this browser session. The visual sequence remains accessible.
            </p>
          )}
          <div className="flex w-full flex-wrap gap-3">
            {phase === 'ready' && (
              <button type="button" onClick={begin} className="rounded-full border border-sky-200/40 bg-sky-100/15 px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-50 hover:bg-sky-100/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-200">
                Begin audible awakening
              </button>
            )}
            {phase === 'speaking' && (
              <button type="button" onClick={revealWithoutSpeech} className="rounded-full border border-white/15 px-5 py-3 text-xs uppercase tracking-[0.18em] text-white/70 hover:bg-white/10">
                Continue without audio
              </button>
            )}
            {complete && (
              <>
                <button type="button" onClick={() => { stopVoice(); onComplete() }} className="rounded-full border border-sky-200/40 bg-sky-100/20 px-7 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-sky-100/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-200">
                  Meet Jahorin
                </button>
                <button type="button" onClick={begin} className="rounded-full border border-white/20 px-5 py-3 text-xs uppercase tracking-[0.18em] text-white/65 hover:bg-white/10">
                  Replay narration
                </button>
              </>
            )}
          </div>
          <p className="text-xs leading-relaxed text-white/40">
            The welcome surfaces form in sync with Jahorin's narration. Voice playback requires browser audio permission.
          </p>
        </section>
      </main>
    </div>
  )
}
