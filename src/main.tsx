import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './theme'
import { LineNamesProvider } from './lineNames'
import { AuthProvider } from './auth/AuthProvider'
import { backend } from './auth/backend'
import { AuthGate, MissingConfig } from './AuthGate'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LineNamesProvider>
        {backend ? (
          <AuthProvider backend={backend}>
            <AuthGate />
          </AuthProvider>
        ) : (
          <MissingConfig />
        )}
      </LineNamesProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
