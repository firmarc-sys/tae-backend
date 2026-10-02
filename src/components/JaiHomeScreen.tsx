import { useEffect, useState } from "react";
import { Camera, AudioLines, Settings, Globe, Box, SquareTerminal, FileText, Blocks, Cloud, Wifi, Volume2, ArrowRight } from "lucide-react";
import { DuskHorizon, LiquidDock, WeatherWidget, type LiquidDockItem } from "../design-system";

export interface JaiHomeScreenProps {
  location?: string;
  tempF?: number;
  condition?: string;
  feelsLike?: number;
  onEnterSpace: () => void;
}

const NAV_ITEMS: LiquidDockItem[] = [
  { id: "browser", label: "Browser", icon: <Globe size={18} /> },
  { id: "builder", label: "Builder", icon: <Box size={18} /> },
  { id: "terminal", label: "Terminal", icon: <SquareTerminal size={18} /> },
  { id: "documents", label: "Documents", icon: <FileText size={18} /> },
];

function ClockCluster() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(now);
  const date = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(now);

  return (
    <div className="flex flex-col items-center gap-1 font-mono text-white/90">
      <div className="text-[13px] font-bold leading-none">{time}</div>
      <div className="text-[7px] uppercase tracking-[0.1em] text-white/50">{date}</div>
      <div className="mt-1 flex items-center gap-1.5 text-white/50">
        <Cloud size={11} />
        <Wifi size={11} />
        <Volume2 size={11} />
      </div>
    </div>
  );
}

/**
 * Canonical Agentic OS home surface — the J.A.I "Liquid Dock" screen.
 * Built entirely from design-system primitives (DuskHorizon, WeatherWidget,
 * LiquidDock) so future CSIOS surfaces can restyle by swapping the accent
 * and content, not by forking this layout.
 */
export function JaiHomeScreen({
  location = "Phoenix, Arizona",
  tempF = 82,
  condition = "Partly Cloudy",
  feelsLike = 83,
  onEnterSpace,
}: JaiHomeScreenProps) {
  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden text-white"
      style={{
        // This surface's canon uses a cyan accent — overrides the design
        // system's default violet at the container level (see tokens.css).
        ["--color-accent" as string]: "#3ac8ff",
        ["--color-accent-glow" as string]: "rgba(58,200,255,0.45)",
      }}
    >
      <DuskHorizon sunX={68} sunY={38} />

      <div className="relative z-10 flex h-full flex-col">
        {/* Header */}
        <div className="grid grid-cols-3 items-center px-5 pt-5 md:px-10 md:pt-8">
          <div className="flex items-center gap-2 justify-self-start">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
            <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-white/60 md:text-[10px]">
              J.A.I Liquid Dock
            </span>
          </div>
          <div className="justify-self-center font-display text-[20px] tracking-[0.3em] md:text-[26px]">J.A.I</div>
          <div className="flex items-center gap-4 justify-self-end text-white/85">
            <Camera size={17} />
            <AudioLines size={17} />
            <Settings size={17} />
          </div>
        </div>

        {/* Weather */}
        <div className="mt-8 px-5 md:mt-10 md:px-10">
          <WeatherWidget location={location} tempF={tempF} condition={condition} feelsLike={feelsLike} />
        </div>

        {/* Hero */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center md:px-10">
          <h1 className="font-display text-[32px] tracking-wide text-white md:text-[52px]">Welcome Home</h1>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.35em] text-white/70 md:text-[12px]">
            Your Space. Your Intelligence.
          </div>
          <div className="mt-4 h-px w-10 md:w-14" style={{ background: "var(--color-accent)" }} />
          <p className="mt-4 max-w-[280px] text-[13px] leading-relaxed text-white/70 md:max-w-md md:text-[16px]">
            J.A.I is your Agentic OS. Everything you build, sync, and create lives here.
          </p>
          <button
            type="button"
            onClick={onEnterSpace}
            className="mt-6 flex items-center gap-3 rounded-ds-pill border px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.25em] text-white/90 transition-colors hover:bg-white/5 md:px-7 md:py-3 md:text-[12px]"
            style={{ borderColor: "var(--color-accent)" }}
          >
            Enter Space
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full border"
              style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
            >
              <ArrowRight size={11} />
            </span>
          </button>
        </div>

        {/* Liquid Dock */}
        <div className="px-3 pb-4 md:px-8 md:pb-6">
          <LiquidDock
            items={NAV_ITEMS}
            activeId="browser"
            leading={
              <div className="relative flex flex-col items-center">
                <Blocks size={26} className="text-white/90" />
              </div>
            }
            trailing={<ClockCluster />}
            className="mx-auto max-w-md md:max-w-xl"
          />
        </div>
      </div>
    </div>
  );
}
