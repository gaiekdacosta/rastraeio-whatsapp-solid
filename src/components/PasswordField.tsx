import { useState } from 'react'
import { Eye, EyeOff, Wand2 } from 'lucide-react'

interface Props {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  autoFocus?: boolean
  required?: boolean
  placeholder?: string
  /** Mostra o botão "Gerar", que preenche uma senha aleatória e a deixa visível para copiar. */
  canGenerate?: boolean
}

// Sem caracteres que se confundem ao ditar ou copiar à mão (0/O, 1/l/I).
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export function PasswordField({ id, label, value, onChange, autoComplete, autoFocus, required, placeholder, canGenerate }: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          placeholder={placeholder}
          spellCheck={false}
        />
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          title={visible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {visible ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
        </button>
        {canGenerate && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              onChange(generatePassword())
              setVisible(true)
            }}
            title="Gerar senha aleatória"
          >
            <Wand2 size={14} aria-hidden /> Gerar
          </button>
        )}
      </div>
    </div>
  )
}
