import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** "soft" = low-contrast surface (badges, chips). "strong" = primary card. */
  tone?: "soft" | "strong";
  radius?: "sm" | "md" | "lg" | "xl" | "pill";
}

const RADIUS: Record<NonNullable<GlassPanelProps["radius"]>, string> = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  pill: "var(--radius-pill)",
};

/**
 * The base glass/chrome material every Agentic OS surface panel is built
 * from — buttons, cards, badges. Wraps children; does not impose padding
 * or layout so callers stay in control of their own spacing.
 */
export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ tone = "soft", radius = "lg", style, className = "", children, ...rest }, ref) => {
    const fill = tone === "strong" ? "var(--glass-fill-strong)" : "var(--glass-fill)";
    const border = tone === "strong" ? "var(--glass-border-bright)" : "var(--glass-border)";
    return (
      <div
        ref={ref}
        className={className}
        style={{
          background: fill,
          border: `1px solid ${border}`,
          borderRadius: RADIUS[radius],
          backdropFilter: "blur(var(--blur-glass-soft))",
          WebkitBackdropFilter: "blur(var(--blur-glass-soft))",
          boxShadow: "var(--shadow-glass-sm)",
          ...style,
        }}
        {...rest}
      >
        {children}
      </div>
    );
  }
);
GlassPanel.displayName = "GlassPanel";
