import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { OnboardingData, UploadRef } from "../lib/identity";
import { isOwner, GOALS, generateGID, OWNER_IDENTITY } from "../lib/identity";
import { buildIdentity } from "../lib/identity";
import type { SIOSIdentity } from "../lib/identity";
import { sendMagicLink } from "../lib/supabase";

interface OnboardingProps {
  onComplete: (identity: SIOSIdentity) => void;
}

// Step config
const TOTAL_STEPS = 7;

const overlay = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: "easeOut" } },
  exit:    { opacity: 0, y: -20, filter: "blur(8px)", transition: { duration: 0.4 } },
};

// Styled input component
function ChromeInput({
  type = "text", placeholder, value, onChange, autoFocus, maxLength,
}: {
  type?: string; placeholder: string; value: string; onChange: (v: string) => void;
  autoFocus?: boolean; maxLength?: number;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      maxLength={maxLength}
      onChange={e => onChange(e.target.value)}
      autoFocus={autoFocus}
      className="w-full outline-none text-white placeholder:text-white/20 bg-transparent"
      style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: "0.1em" }}
    />
  );
}

function Field({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="space-y-1.5">
      {label && <div className="label" style={{ fontSize: 8 }}>{label}</div>}
      <div
        className="w-full px-4 py-3.5 rounded-2xl"
        style={{
          background: "rgba(4,8,20,0.8)",
          border: "1px solid var(--user-border, rgba(80,140,255,0.22))",
          boxShadow: "0 0 16px rgba(60,120,255,0.08), inset 0 0 8px rgba(60,120,255,0.04)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function NextBtn({ onClick, label = "CONTINUE", disabled = false }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className="w-full py-4 rounded-2xl font-bold tracking-[0.3em] text-sm transition-all"
      style={{
        background: disabled
          ? "rgba(30,50,100,0.3)"
          : "radial-gradient(ellipse at 50% 0%, rgba(80,160,255,0.35) 0%, rgba(20,50,140,0.6) 100%)",
        border: `1px solid ${disabled ? "rgba(60,100,200,0.15)" : "rgba(80,160,255,0.45)"}`,
        color: disabled ? "rgba(120,160,220,0.3)" : "rgba(200,230,255,0.95)",
        boxShadow: disabled ? "none" : "0 0 20px rgba(60,130,255,0.25), inset 0 0 12px rgba(60,130,255,0.08)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </motion.button>
  );
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Partial<OnboardingData>>({
    goals: [],
    uploads: [],
  });
  const [generating, setGenerating] = useState(false);
  const [gidResult, setGidResult] = useState<{ gid: string; lifePathNumber: number; lifePathSum: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Magic link state
  const [magicSending, setMagicSending]   = useState(false);
  const [magicSent, setMagicSent]         = useState(false);
  const [magicError, setMagicError]       = useState<string | null>(null);

  const update = (patch: Partial<OnboardingData>) =>
    setData(prev => ({ ...prev, ...patch }));

  useEffect(() => {
    // keep hook order stable across renders
  }, []);

  const next = () => setStep(s => s + 1);

  // Step 0: Email — owner bypasses straight in; everyone else gets a magic link
  const handleEmail = async () => {
    if (!data.email) return;

    // Owner shortcut — no magic link needed
    if (isOwner(data.email)) {
      onComplete({ ...OWNER_IDENTITY, email: data.email });
      return;
    }

    // Send magic link
    setMagicSending(true);
    setMagicError(null);
    const { error } = await sendMagicLink(data.email);
    setMagicSending(false);

    if (error) {
      setMagicError(error);
      return;
    }

    setMagicSent(true);
    // Don't advance — user must click link in email.
    // App.tsx onAuthStateChange will fire SIGNED_IN and call handleSignedIn.
  };

  // Step 5: goals toggle
  const toggleGoal = (id: string) => {
    const goals = data.goals ?? [];
    update({ goals: goals.includes(id) ? goals.filter(g => g !== id) : [...goals, id] });
  };

  // Step 6: upload reference
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const ref: UploadRef = {
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      url,
      uploadedAt: new Date().toISOString(),
    };
    update({ uploads: [...(data.uploads ?? []), ref] });
  };

  // Step 7: generate GID + complete
  const handleGenerate = async () => {
    setGenerating(true);
    await new Promise(r => setTimeout(r, 2200)); // cinematic delay
    const res = generateGID(data.birthdate!, data.favoriteNumber!);
    setGidResult(res);
    await new Promise(r => setTimeout(r, 1800));
    const identity = buildIdentity({
      email: data.email!,
      name: data.name!,
      alias: data.alias,
      birthdate: data.birthdate!,
      favoriteNumber: data.favoriteNumber!,
      perfectLife: data.perfectLife ?? '',
      goals: data.goals ?? [],
      uploads: data.uploads ?? [],
      subscriptionTier: 'free',
    });
    onComplete(identity);
  };

  // Mini orb that pulses throughout
  const MiniOrb = ({ size = 100 }: { size?: number }) => (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="css-orb" style={{ width: size, height: size }} />
      <div className="orb-ring-anim" style={{ width: size + 20, height: size + 20 }} />
      <div className="orb-ring-anim" style={{ width: size + 20, height: size + 20 }} />
    </div>
  );

  const stepTitles = [
    "IDENTIFY YOURSELF TO THE SYSTEM",
    "WHAT DO YOU CALL YOURSELF?",
    "WHEN WERE YOU BORN INTO THIS FREQUENCY?",
    "CHOOSE YOUR RESONANCE NUMBER",
    "DESCRIBE YOUR PERFECT REALITY",
    "SELECT YOUR INTENT FIELDS",
    "UPLOAD YOUR REFERENCE",
    "TAE IS CALIBRATING YOUR IDENTITY",
  ];

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(ellipse 70% 60% at 50% 40%, #010308 0%, #000 100%)" }}
    >
      {/* Ambient particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 18 }).map((_, i) => (
          <motion.div key={i}
            animate={{ opacity: [0, 0.3, 0], y: [0, -60, -120] }}
            transition={{ duration: 4 + Math.random() * 3, repeat: Infinity, delay: Math.random() * 5, ease: "easeOut" }}
            className="absolute w-0.5 h-0.5 rounded-full bg-blue-400"
            style={{ left: `${10 + Math.random() * 80}%`, top: `${40 + Math.random() * 50}%`, boxShadow: "0 0 4px #60a5fa" }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-12 text-center">
        <div className="sios-logo mb-1">S I O S</div>
        <div className="label tracking-[0.2em] text-blue-300/40">SPATIAL IDENTITY SYSTEM</div>
      </div>

      {/* Progress dots */}
      <div className="absolute top-28 flex items-center gap-2">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i}
            className="rounded-full transition-all duration-500"
            style={{
              width: i === step ? 20 : 6,
              height: 6,
              background: i < step ? "rgba(96,165,250,0.8)" : i === step ? "white" : "rgba(255,255,255,0.15)",
              boxShadow: i === step ? "0 0 8px rgba(96,200,255,0.7)" : "none",
            }}
          />
        ))}
      </div>

      {/* Orb + form panel */}
      <div className="flex flex-col items-center w-full max-w-sm px-5 space-y-6">
        <MiniOrb size={generating ? 140 : 90} />

        {/* Step title */}
        <AnimatePresence mode="wait">
          <motion.div key={`title-${step}`} {...{ initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }}
            className="label text-center tracking-[0.2em] text-blue-300/70" style={{ fontSize: 9 }}
          >
            {stepTitles[step]}
          </motion.div>
        </AnimatePresence>

        {/* Form panel */}
        <AnimatePresence mode="wait">
          <motion.div key={`step-${step}`} variants={overlay} initial="hidden" animate="visible" exit="exit"
            className="w-full space-y-4"
          >
            {/* STEP 0: Email + Magic Link */}
            {step === 0 && (
              <>
                {!magicSent ? (
                  <>
                    <Field label="EMAIL ADDRESS">
                      <ChromeInput placeholder="you@yourdomain.com" value={data.email ?? ''} onChange={v => { update({ email: v }); setMagicError(null); }} autoFocus type="email" />
                    </Field>

                    {magicError && (
                      <div className="px-3 py-2 rounded-xl text-center mono"
                        style={{ background: "rgba(255,60,60,0.1)", border: "1px solid rgba(255,60,60,0.25)", fontSize: 9, color: "rgba(255,120,100,0.9)", letterSpacing: "0.08em" }}>
                        {magicError}
                      </div>
                    )}

                    <NextBtn
                      onClick={handleEmail}
                      label={magicSending ? "SENDING..." : "IDENTIFY"}
                      disabled={!data.email?.includes('@') || magicSending}
                    />
                    <div className="text-center label text-white/20" style={{ fontSize: 8 }}>
                      IDENTITY IS FREQUENCY. YOU ARE THE SIGNAL.
                    </div>
                  </>
                ) : (
                  // ── Magic link sent ──
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-5 py-4"
                  >
                    <motion.div animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 2.2, repeat: Infinity }}
                      className="text-4xl">✉️</motion.div>

                    <div>
                      <div className="font-bold tracking-[0.15em] text-white/90" style={{ fontSize: 13 }}>
                        CHECK YOUR EMAIL
                      </div>
                      <div className="mono mt-2" style={{ fontSize: 9, color: "rgba(150,200,255,0.6)", letterSpacing: "0.1em" }}>
                        A secure sign-in link was sent to
                      </div>
                      <div className="mono mt-1 font-bold" style={{ fontSize: 10, color: "var(--user-primary, #60a5fa)" }}>
                        {data.email}
                      </div>
                    </div>

                    <div className="label text-white/30" style={{ fontSize: 8 }}>
                      CLICK THE LINK TO ACTIVATE YOUR TAE RUNTIME.
                    </div>

                    <div className="flex items-center gap-2 justify-center">
                      <motion.div className="w-1.5 h-1.5 rounded-full bg-blue-400"
                        animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.4, repeat: Infinity }} />
                      <span className="mono" style={{ fontSize: 7.5, color: "rgba(120,180,255,0.5)", letterSpacing: "0.18em" }}>
                        AWAITING AUTHENTICATION
                      </span>
                    </div>

                    <button onClick={() => { setMagicSent(false); setMagicError(null); }}
                      className="label text-white/25 underline-offset-2 underline"
                      style={{ fontSize: 8, letterSpacing: "0.12em" }}>
                      Use a different email
                    </button>
                  </motion.div>
                )}
              </>
            )}

            {/* STEP 1: Name */}
            {step === 1 && (
              <>
                <Field label="FULL NAME">
                  <ChromeInput placeholder="Your name" value={data.name ?? ''} onChange={v => update({ name: v })} autoFocus />
                </Field>
                <Field label="ALIAS (OPTIONAL)">
                  <ChromeInput placeholder="What the system should call you" value={data.alias ?? ''} onChange={v => update({ alias: v })} />
                </Field>
                <NextBtn onClick={next} label="CONTINUE" disabled={!data.name?.trim()} />
              </>
            )}

            {/* STEP 2: Birthdate */}
            {step === 2 && (
              <>
                <Field label="DATE OF BIRTH">
                  <ChromeInput type="date" placeholder="YYYY-MM-DD" value={data.birthdate ?? ''} onChange={v => update({ birthdate: v })} autoFocus />
                </Field>
                {data.birthdate && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="text-center mono" style={{ fontSize: 9, color: "var(--user-primary, #60a5fa)" }}
                  >
                    {(() => {
                      const { lifePathNumber } = generateGID(data.birthdate, 1);
                      return `LIFE PATH ${lifePathNumber} · FREQUENCY DETECTED`;
                    })()}
                  </motion.div>
                )}
                <NextBtn onClick={next} label="LOCK IN" disabled={!data.birthdate} />
              </>
            )}

            {/* STEP 3: Favorite Number */}
            {step === 3 && (
              <>
                <Field label="RESONANCE NUMBER (1–99)">
                  <ChromeInput type="number" placeholder="Enter any number 1–99" value={data.favoriteNumber?.toString() ?? ''}
                    onChange={v => update({ favoriteNumber: Math.min(99, Math.max(1, parseInt(v) || 1)) })} autoFocus maxLength={2} />
                </Field>
                <div className="grid grid-cols-9 gap-1">
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <button key={n} onClick={() => update({ favoriteNumber: n })}
                      className="py-2 rounded-xl text-xs transition-all"
                      style={{
                        background: data.favoriteNumber === n ? "rgba(60,120,255,0.4)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${data.favoriteNumber === n ? "rgba(80,160,255,0.6)" : "rgba(255,255,255,0.08)"}`,
                        color: data.favoriteNumber === n ? "white" : "rgba(255,255,255,0.3)",
                      }}
                    >{n}</button>
                  ))}
                </div>
                <NextBtn onClick={next} label="SET FREQUENCY" disabled={!data.favoriteNumber} />
              </>
            )}

            {/* STEP 4: Perfect Life */}
            {step === 4 && (
              <>
                <div className="space-y-1.5">
                  <div className="label" style={{ fontSize: 8 }}>YOUR PERFECT REALITY</div>
                  <textarea
                    placeholder="Describe your perfect life in one sentence..."
                    value={data.perfectLife ?? ''}
                    onChange={e => update({ perfectLife: e.target.value })}
                    autoFocus
                    rows={4}
                    className="w-full px-4 py-3.5 rounded-2xl outline-none resize-none text-white placeholder:text-white/20 bg-transparent"
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.05em",
                      background: "rgba(4,8,20,0.8)",
                      border: "1px solid var(--user-border, rgba(80,140,255,0.22))",
                    }}
                  />
                </div>
                <NextBtn onClick={next} label="INSCRIBE" disabled={!data.perfectLife?.trim()} />
              </>
            )}

            {/* STEP 5: Goals */}
            {step === 5 && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {GOALS.map(g => {
                    const sel = data.goals?.includes(g.id);
                    return (
                      <button key={g.id} onClick={() => toggleGoal(g.id)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-2xl text-left transition-all"
                        style={{
                          background: sel ? "rgba(60,120,255,0.25)" : "rgba(4,8,20,0.7)",
                          border: `1px solid ${sel ? "rgba(80,160,255,0.55)" : "rgba(80,120,200,0.15)"}`,
                          color: sel ? "rgba(200,230,255,0.95)" : "rgba(140,170,220,0.5)",
                          boxShadow: sel ? "0 0 14px rgba(60,120,255,0.2)" : "none",
                        }}
                      >
                        <span style={{ fontSize: 14, color: sel ? "white" : "rgba(80,120,200,0.5)" }}>{g.icon}</span>
                        <span style={{ fontSize: 10, letterSpacing: "0.12em" }}>{g.label.toUpperCase()}</span>
                      </button>
                    );
                  })}
                </div>
                <NextBtn onClick={next} label="SET INTENT" disabled={(data.goals?.length ?? 0) === 0} />
              </>
            )}

            {/* STEP 6: Upload Reference */}
            {step === 6 && (
              <>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 rounded-2xl flex flex-col items-center gap-3 cursor-pointer transition-all"
                  style={{
                    background: "rgba(4,8,20,0.7)",
                    border: "1px dashed rgba(80,140,255,0.3)",
                  }}
                >
                  {data.uploads && data.uploads.length > 0 ? (
                    <>
                      <img src={data.uploads[data.uploads.length - 1].url} alt="upload"
                        className="w-20 h-20 object-cover rounded-2xl border border-blue-500/30"
                      />
                      <div className="label text-green-400">REFERENCE UPLOADED</div>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl opacity-30">⬆</div>
                      <div className="label text-white/30 text-center tracking-[0.15em]">
                        LOGO · SELFIE · BRAND ART<br />TAE WILL USE THIS TO RENDER YOUR WORLD
                      </div>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                <NextBtn onClick={handleGenerate} label={data.uploads?.length ? "GENERATE MY GID" : "SKIP & GENERATE"} />
              </>
            )}

            {/* STEP 7: GID Generation */}
            {step === 7 || generating ? (
              <div className="flex flex-col items-center gap-6 py-4">
                {!gidResult ? (
                  <>
                    <div className="flex gap-2">
                      {[0, 1, 2].map(i => (
                        <motion.div key={i} className="w-2 h-2 rounded-full bg-blue-400"
                          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.3 }}
                        />
                      ))}
                    </div>
                    <div className="label text-blue-300/60 tracking-[0.25em]">TAE IS READING YOUR FREQUENCY...</div>
                  </>
                ) : (
                  <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                    className="text-center space-y-3"
                  >
                    <div className="label text-blue-300/50">YOUR GALACTIC ID</div>
                    <div className="mono text-2xl glow-text tracking-[0.15em]" style={{ color: "var(--user-primary, #60a5fa)" }}>
                      {gidResult.gid}
                    </div>
                    <div className="label text-white/30">
                      LIFE PATH {gidResult.lifePathNumber} · MATERIALIZATION COMPLETE
                    </div>
                  </motion.div>
                )}
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Pool and drips below orb */}
      <div className="absolute bottom-12 flex flex-col items-center pointer-events-none" style={{ left: "50%", transform: "translateX(-50%)" }}>
        <div className="pool-glow" style={{ width: 180, height: 50 }}>
          <div className="ripple-pool" style={{ width: 180, height: 50 }}>
            {[0,1,2].map(i=><div key={i} className="ripple-ring" style={{ width: 20, height: 20 }} />)}
          </div>
        </div>
        <div className="label text-white/15 mt-2 tracking-[0.3em]" style={{ fontSize: 8 }}>
          GID: {data.birthdate && data.favoriteNumber ? generateGID(data.birthdate, data.favoriteNumber).gid : '···'}
        </div>
      </div>
    </div>
  );
}
