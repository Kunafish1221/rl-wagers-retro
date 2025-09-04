import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        rl: {
          bg: 'var(--rl-bg)',
          panel: 'var(--rl-panel)',
          stroke: 'var(--rl-stroke)',
          neon: 'var(--rl-neon)',
          lime: 'var(--rl-lime)',
          amber: 'var(--rl-amber)',
          red: 'var(--rl-red)',
        },
      },
      boxShadow: {
        neon: '0 0 6px rgba(255,47,146,.8), 0 0 24px rgba(255,47,146,.35)',
        card: '0 10px 30px rgba(0,0,0,.35)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
}

export default config