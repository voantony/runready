import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f3ecdf",
        ink: "#1b1714",
        stamp: "#9c2f2f",
        pass: "#1d6b45",
        line: "#d9d0c1",
        moss: "#3d4a38",
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', "Palatino", '"Palatino Linotype"', "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        ticket: "0 18px 50px rgba(60, 40, 20, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
