import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        toss: {
          blue: "#3182f6",
          blueDark: "#1b64da",
          bg: "#f2f4f6",
          card: "#ffffff",
          gray: "#6b7684",
          ink: "#191f28",
          line: "#e5e8eb",
          red: "#f04452",
          yellow: "#ff9500",
        },
      },
      borderRadius: {
        "4xl": "28px",
      },
      boxShadow: {
        toss: "0 2px 16px rgba(0,0,0,0.06)",
        sheet: "0 -8px 40px rgba(0,0,0,0.12)",
      },
      fontFamily: {
        sans: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
