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
  if (typeof window === 'undefined') return

  const stored = localStorage.getItem('lc_theme')
  const theme = stored === 'dark' ? 'dark' : 'light'

  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme

  if (!stored) {
    localStorage.setItem('lc_theme', 'light')
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