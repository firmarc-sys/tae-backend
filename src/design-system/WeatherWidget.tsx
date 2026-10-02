export interface WeatherWidgetProps {
  location: string;
  tempF: number;
  condition: string;
  feelsLike: number;
  /** Defaults to a sun-behind-cloud glyph matching the canonical reference. */
  icon?: React.ReactNode;
  className?: string;
}

function DefaultConditionIcon() {
  return (
    <div className="relative h-14 w-14 shrink-0" aria-hidden>
      <div
        className="absolute left-1 top-0 h-9 w-9 rounded-full"
        style={{
          background: "radial-gradient(circle at 35% 30%, #ffe9b0, #ffb23e 55%, #e88a12)",
          boxShadow: "0 0 18px 2px rgba(255, 178, 62, 0.55)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 h-7 w-12 rounded-full"
        style={{
          background: "linear-gradient(180deg, #f4f6fa, #d9dee6)",
          boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
        }}
      />
      <div
        className="absolute bottom-1 left-4 h-6 w-9 rounded-full"
        style={{ background: "linear-gradient(180deg, #ffffff, #e4e8ee)" }}
      />
    </div>
  );
}

/**
 * Ambient conditions readout used on Agentic OS home surfaces. Pure
 * presentation — data comes from whatever location/weather source the
 * host screen wires in.
 */
export function WeatherWidget({ location, tempF, condition, feelsLike, icon, className = "" }: WeatherWidgetProps) {
  return (
    <div className={`select-none font-body ${className}`}>
      <div className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--color-text-secondary)]">
        {location}
      </div>
      <div className="mt-1 font-display text-[52px] leading-none text-[color:var(--color-text-primary)]">
        {tempF}°F
      </div>
      <div className="mt-3">{icon ?? <DefaultConditionIcon />}</div>
      <div className="mt-2 text-[12px] uppercase tracking-[0.2em] text-[color:var(--color-text-secondary)]">
        {condition}
      </div>
      <div className="mt-1 text-[13px] text-[color:var(--color-text-tertiary)]">Feels like {feelsLike}°</div>
    </div>
  );
}
