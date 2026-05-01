import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#05070b",
        panel: "#0b1018",
        panelSoft: "#101722",
        elevated: "#131d2a",
        line: "#202a3a",
        lineStrong: "#2d3a4d",
        cyan: "#27d7f2",
        blue: "#4f8bff",
        purple: "#8b5cf6",
        success: "#25d366",
        warning: "#f6b73c",
        danger: "#ff4d5e"
      },
      boxShadow: {
        premium: "0 18px 60px rgba(0, 0, 0, 0.34)",
        glowCyan: "0 0 0 1px rgba(39, 215, 242, 0.16), 0 18px 48px rgba(39, 215, 242, 0.1)",
        glowGreen: "0 0 0 1px rgba(37, 211, 102, 0.14), 0 18px 48px rgba(37, 211, 102, 0.08)",
        insetPanel: "inset 0 1px 0 rgba(255, 255, 255, 0.04)"
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
} satisfies Config;
