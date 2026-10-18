import type { ReactNode } from "react";

export interface LiquidDockItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface LiquidDockProps {
  items: LiquidDockItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Rendered inside the leading (leftmost) lens. Defaults to a plain mark. */
  leading?: ReactNode;
  /** Rendered inside the trailing (rightmost) lens — clock, status glyphs, etc. */
  trailing?: ReactNode;
  className?: string;
}

const GOO_ID = "ds-liquid-dock-goo";
const CAP_SIZE = 84;
const BAR_HEIGHT = 62;
const OVERLAP = 22;

const dockFill =
  "linear-gradient(155deg, rgba(58,61,69,0.94), rgba(12,13,16,0.96) 34%, rgba(21,23,29,0.96) 62%, rgba(43,46,54,0.94))";

/**
 * The canonical Agentic OS bottom navigation surface: a continuous "liquid
 * metal" capsule formed by gooifying three overlapping shapes (leading
 * lens, nav bar, trailing lens) via an SVG blur+contrast filter — the same
 * technique used for metaball UI. Content renders in an unfiltered layer
 * stacked on top so icons/text stay crisp.
 */
export function LiquidDock({ items, activeId, onSelect, leading, trailing, className = "" }: LiquidDockProps) {
  return (
    <div className={`relative w-full select-none ${className}`} style={{ height: CAP_SIZE }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id={GOO_ID}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -11"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>

      {/* Ambient shadow/elevation behind the fused shape */}
      <div
        className="absolute inset-x-2 bottom-0 rounded-ds-pill"
        style={{ height: BAR_HEIGHT, boxShadow: "var(--shadow-liquid-dock)" }}
      />

      {/* Goo layer — three overlapping shapes fused into one liquid capsule */}
      <div
        className="absolute inset-0 flex items-center"
        style={{ filter: `url(#${GOO_ID})` }}
        aria-hidden
      >
        <div style={{ width: CAP_SIZE, height: CAP_SIZE, borderRadius: "50%", background: dockFill }} />
        <div
          style={{
            flex: 1,
            height: BAR_HEIGHT,
            marginLeft: -OVERLAP,
            marginRight: -OVERLAP,
            borderRadius: "var(--radius-pill)",
            background: dockFill,
          }}
        />
        <div style={{ width: CAP_SIZE, height: CAP_SIZE, borderRadius: "50%", background: dockFill }} />
      </div>

      {/* Sheen highlight, clipped roughly to the fused silhouette */}
      <div
        className="pointer-events-none absolute inset-x-2 top-0 rounded-ds-pill"
        style={{
          height: CAP_SIZE * 0.55,
          background: "linear-gradient(180deg, var(--chrome-highlight), transparent)",
          opacity: 0.35,
          mixBlendMode: "overlay",
        }}
      />

      {/* Content layer — identical geometry, unfiltered, crisp */}
      <div className="absolute inset-0 flex items-center">
        <div
          style={{ width: CAP_SIZE, height: CAP_SIZE }}
          className="flex shrink-0 items-center justify-center"
        >
          {leading}
        </div>
        <div
          style={{ flex: 1, height: BAR_HEIGHT, marginLeft: -OVERLAP, marginRight: -OVERLAP }}
          className="flex items-center justify-evenly px-4"
        >
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect?.(item.id)}
                className="flex w-16 shrink-0 flex-col items-center gap-1 font-mono text-[8px] uppercase tracking-[0.06em] transition-colors"
                style={{ color: active ? "#3ac8ff" : "var(--color-text-tertiary)" }}
              >
                <span className="text-[18px] leading-none">{item.icon}</span>
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
        <div
          style={{ width: CAP_SIZE, height: CAP_SIZE }}
          className="flex shrink-0 items-center justify-center"
        >
          {trailing}
        </div>
      </div>
    </div>
  );
}
