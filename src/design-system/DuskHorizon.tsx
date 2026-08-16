export interface DuskHorizonProps {
  /** Horizontal sun position as a percentage of width (0–100). */
  sunX?: number;
  /** Vertical sun position as a percentage of height (0–100). */
  sunY?: number;
  className?: string;
}

/**
 * Layered sunset mountain-lake backdrop used behind the canonical J.A.I
 * home surface. Built from gradients + SVG rather than a bitmap so any
 * CSIOS surface can reuse it at any resolution and re-tune the sun
 * position without shipping new imagery.
 */
export function DuskHorizon({ sunX = 68, sunY = 40, className = "" }: DuskHorizonProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden bg-black ${className}`} aria-hidden>
      {/* Sky base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #060b18 0%, #0d1a30 22%, #17273f 38%, #2c3548 52%, #4a3a3c 64%, #7a4a3a 76%, #a8622f 86%, #d98a3a 96%)",
        }}
      />

      {/* Crepuscular ray sweep radiating from the sun */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: `repeating-conic-gradient(from 205deg at ${sunX}% ${sunY}%, rgba(255,205,150,0.14) 0deg 4deg, transparent 4deg 11deg)`,
          maskImage: `radial-gradient(circle at ${sunX}% ${sunY}%, black 0%, black 30%, transparent 72%)`,
          WebkitMaskImage: `radial-gradient(circle at ${sunX}% ${sunY}%, black 0%, black 30%, transparent 72%)`,
        }}
      />

      {/* Sun glow */}
      <div
        className="absolute rounded-full"
        style={{
          left: `${sunX}%`,
          top: `${sunY}%`,
          width: 130,
          height: 130,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(255,225,180,0.7), rgba(255,170,90,0.32) 42%, transparent 72%)",
          filter: "blur(2px)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: `${sunX}%`,
          top: `${sunY}%`,
          width: 34,
          height: 34,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, #fff6e6, #ffcf8a 60%, #ff9d4d 100%)",
          boxShadow: "0 0 34px 8px rgba(255, 190, 120, 0.5)",
        }}
      />

      {/* Cloud texture */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 400 300">
        <defs>
          <filter id="ds-cloud-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g filter="url(#ds-cloud-blur)" opacity="0.55">
          <ellipse cx="120" cy="55" rx="90" ry="14" fill="#0d1626" />
          <ellipse cx="260" cy="80" rx="120" ry="18" fill="#1a2436" />
          <ellipse cx="60" cy="100" rx="70" ry="12" fill="#25201f" />
          <ellipse cx="300" cy="120" rx="100" ry="16" fill="#3a2b26" />
          <ellipse cx="180" cy="140" rx="140" ry="14" fill="#5a3a30" opacity="0.6" />
        </g>
      </svg>

      {/* Stars (upper sky only) */}
      <div
        className="absolute inset-x-0 top-0 h-[30%]"
        style={{
          backgroundImage:
            "radial-gradient(1.4px 1.4px at 14% 20%, #fff, transparent), radial-gradient(1px 1px at 28% 50%, rgba(255,255,255,.85), transparent), radial-gradient(1.5px 1.5px at 72% 15%, #fff, transparent), radial-gradient(1px 1px at 84% 38%, rgba(255,255,255,.8), transparent), radial-gradient(1.2px 1.2px at 44% 10%, rgba(255,255,255,.7), transparent), radial-gradient(1px 1px at 8% 65%, rgba(255,255,255,.7), transparent)",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Mountains + lake */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[60%] w-full"
        preserveAspectRatio="none"
        viewBox="0 0 400 220"
      >
        <defs>
          <linearGradient id="ds-mtn-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a3a4a" />
            <stop offset="100%" stopColor="#1c1d28" />
          </linearGradient>
          <linearGradient id="ds-mtn-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14141c" />
            <stop offset="100%" stopColor="#050508" />
          </linearGradient>
          <linearGradient id="ds-lake" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#120c10" />
            <stop offset="100%" stopColor="#04030a" />
          </linearGradient>
        </defs>

        {/* Far ridge */}
        <polygon
          fill="url(#ds-mtn-far)"
          opacity="0.85"
          points="0,70 40,42 90,62 150,25 210,55 260,32 320,64 360,40 400,60 400,110 0,110"
        />
        {/* Near ridge */}
        <polygon
          fill="url(#ds-mtn-near)"
          points="0,110 30,74 70,98 120,58 180,92 230,64 280,96 330,68 380,100 400,82 400,130 0,130"
        />

        {/* Lake surface */}
        <rect x="0" y="130" width="400" height="90" fill="url(#ds-lake)" />

        {/* Shoreline lights */}
        {[18, 46, 82, 120, 168, 244, 288, 322, 360].map((x, i) => (
          <circle key={x} cx={x} cy={129 + (i % 3)} r={i % 2 === 0 ? 1.4 : 0.9} fill="#ffcf8a" opacity="0.85" />
        ))}
      </svg>

      {/* Sun reflection column on the lake (CSS, not SVG, so it isn't
          distorted by the mountain SVG's non-uniform preserveAspectRatio) */}
      <div
        className="absolute bottom-0"
        style={{
          left: `${sunX}%`,
          top: "76%",
          width: 130,
          transform: "translateX(-50%)",
          background: "radial-gradient(ellipse 35% 100% at 50% 0%, rgba(255,207,138,0.4), transparent 72%)",
        }}
      />

      {/* Overall depth vignette so foreground UI stays legible */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 22%, transparent 70%, rgba(0,0,0,0.55) 100%)" }}
      />
    </div>
  );
}
