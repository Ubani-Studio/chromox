import { join } from 'path';

export default {
  content: [join(__dirname, 'index.html'), join(__dirname, 'src/**/*.{ts,tsx}')],
  theme: {
    extend: {
      colors: {
        // Mmuo Dark Palette - masquerade / ceremonial / calm-expensive
        canvas: '#000000',
        surface: '#0A0A0A',
        elevated: '#141414',
        overlay: '#1A1A1A',
        'border-default': '#1F1F1F',
        'border-subtle': '#141414',
        'border-emphasis': '#66023C',
        primary: '#F5F5F5',
        secondary: '#A0A0A0',
        muted: '#6A6A6A',
        disabled: '#3A3A3A',
        // Accent = tyrian magenta (was reserved for waveforms, now the
        // brand colour). Dark palette needs warmer accent contrast.
        accent: '#66023C',
        'accent-hover': '#8B0A50',
        'accent-subtle': 'rgba(102, 2, 60, 0.12)',
        // Waveform stays tyrian for consistency with the accent
        waveform: '#66023C',
        'waveform-hover': '#8B0A50',
        // Status colors
        success: '#1A7F37',
        error: '#CF222E',
        warning: '#9A6700',
        info: '#0969DA'
      },
      fontFamily: {
        // Swanblade Typography Stack
        sans: ['Sohne', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'Times New Roman', 'serif'],
        ui: ['Sohne', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif']
      },
      borderRadius: {
        // Swanblade: Sharp edges (no rounded corners)
        'none': '0',
        'sm': '2px',
        'DEFAULT': '0',
        'md': '0',
        'lg': '0',
        'xl': '0',
        '2xl': '0',
        '3xl': '0',
        'full': '9999px'
      },
      spacing: {
        'xs': '8px',
        'sm': '16px',
        'md': '24px',
        'lg': '32px',
        'xl': '48px',
        '2xl': '64px',
        '3xl': '96px'
      }
    }
  },
  plugins: []
};
