import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './router'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/sora/600.css'
import '@fontsource/sora/700.css'
import '@fontsource/sora/800.css'
import './styles/index.css'

;(function applyStoredTheme() {
  const theme = localStorage.getItem('lc_theme') || 'dark'
  const r = document.documentElement.style
  document.documentElement.setAttribute('data-theme', theme)
  if (theme === 'light') {
    r.setProperty('--bg-primary',     '#ffffff')
    r.setProperty('--bg-secondary',   '#f3f4f6')
    r.setProperty('--bg-tertiary',    '#e5e7eb')
    r.setProperty('--text-primary',   '#111827')
    r.setProperty('--text-secondary', '#374151')
    r.setProperty('--text-tertiary',  '#6b7280')
    r.setProperty('--border',         '#e5e7eb')
    r.setProperty('--bubble-in',      '#e5e7eb')
    r.setProperty('--bubble-in-text', '#111827')
    r.setProperty('--sidebar-bg',     '#f9fafb')
  } else {
    r.setProperty('--bg-primary',     '#111111')
    r.setProperty('--bg-secondary',   '#1a1a1a')
    r.setProperty('--bg-tertiary',    '#222222')
    r.setProperty('--text-primary',   '#f0f0f0')
    r.setProperty('--text-secondary', '#999999')
    r.setProperty('--text-tertiary',  '#555555')
    r.setProperty('--border',         '#252525')
    r.setProperty('--bubble-in',      '#1a1a1a')
    r.setProperty('--bubble-in-text', '#f0f0f0')
    r.setProperty('--sidebar-bg',     '#0a0a0a')
  }
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
)