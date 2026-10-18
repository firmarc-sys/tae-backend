import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

export interface ChromePanelProps extends HTMLAttributes<HTMLDivElement> {
  /** "soft" = low-contrast surface (badges, chips). "strong" = primary card. */
  tone?: "soft" | "strong";
  radius?: "sm" | "md" | "lg" | "xl" | "pill";
}

const RADIUS: Record<NonNullable<ChromePanelProps["radius"]>, string> = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  pill: "var(--radius-pill)",
};

/**
 * The base metallic-chrome surface every Agentic OS panel is built from —
 * buttons, cards, badges. Per platform canon (GFX-001/DSA-001/FRA-001):
 * opaque gradient + specular rim highlight, no backdrop-filter blur — the
 * material is living chrome, not frosted glass. Wraps children; imposes
 * no padding or layout so callers stay in control of their own spacing.
 */
export const ChromePanel = forwardRef<HTMLDivElement, ChromePanelProps>(
  ({ tone = "soft", radius = "lg", style, className = "", children, ...rest }, ref) => {
    const fill =
      tone === "strong"
        ? "linear-gradient(155deg, rgba(70,73,82,0.92), rgba(16,17,21,0.95) 45%, rgba(30,32,39,0.95))"
        : "linear-gradient(155deg, rgba(52,54,62,0.72), rgba(14,15,19,0.78) 45%, rgba(24,26,32,0.78))";
    const border = tone === "strong" ? "var(--glass-border-bright)" : "var(--glass-border)";
    return (
      <div
        ref={ref}
        className={className}
        style={{
          background: fill,
          border: `1px solid ${border}`,
          borderRadius: RADIUS[radius],
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
ChromePanel.displayName = "ChromePanel";
