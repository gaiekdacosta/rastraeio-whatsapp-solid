import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme'

export function ThemeToggle() {
  const { pref, setPref } = useTheme()
  const cycle = () => setPref(pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system')
  const Icon = pref === 'system' ? Monitor : pref === 'light' ? Sun : Moon
  const label = pref === 'system' ? 'Tema: automático' : pref === 'light' ? 'Tema: claro' : 'Tema: escuro'
  return (
    <button type="button" className="icon-btn" onClick={cycle} title={label} aria-label={label}>
      <Icon size={16} />
    </button>
  )
}
