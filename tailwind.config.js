/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "var(--color-void)",
        ink: {
          950: "var(--color-ink-950)",
          900: "var(--color-ink-900)",
          800: "var(--color-ink-800)",
          700: "var(--color-ink-700)",
        },
        "ds-accent": {
          DEFAULT: "var(--color-accent)",
          strong: "var(--color-accent-strong)",
          dim: "var(--color-accent-dim)",
        },
        glass: {
          fill: "var(--glass-fill)",
          "fill-strong": "var(--glass-fill-strong)",
          border: "var(--glass-border)",
          "border-bright": "var(--glass-border-bright)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "ds-lg": "var(--radius-lg)",
        "ds-xl": "var(--radius-xl)",
        "ds-pill": "var(--radius-pill)",
      },
      fontFamily: {
        display: ["Marcellus", "serif"],
        body: ["Archivo", "sans-serif"],
        mono: ["Space Mono", "monospace"],
      },
      boxShadow: {
        "glass-sm": "var(--shadow-glass-sm)",
        "glass-lg": "var(--shadow-glass-lg)",
        "liquid-dock": "var(--shadow-liquid-dock)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "ds-rise": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "ds-twinkle": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "0.9" },
        },
        "ds-orb-breathe": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.92" },
          "50%": { transform: "scale(1.05)", opacity: "1" },
        },
        "ds-spin": {
          to: { transform: "rotate(360deg)" },
        },
        "ds-spin-reverse": {
          to: { transform: "rotate(-360deg)" },
        },
        "ds-pulse-ring": {
          "0%": { transform: "translate(-50%, -50%) scale(0.7)", opacity: "0.65" },
          "80%, 100%": { transform: "translate(-50%, -50%) scale(1.4)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "ds-rise": "ds-rise 0.5s var(--ease-standard) both",
        "ds-twinkle": "ds-twinkle 5s ease-in-out infinite",
        "ds-orb-breathe": "ds-orb-breathe 5s ease-in-out infinite",
        "ds-spin-slow": "ds-spin 26s linear infinite",
        "ds-spin-slow-reverse": "ds-spin-reverse 20s linear infinite",
        "ds-pulse-ring": "ds-pulse-ring 3s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
