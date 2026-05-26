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

const THEME_KEY = 'lc_theme'
const THEME_EVENT = 'lc-theme-change'

function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme) {
  const root = document.documentElement
  const nextTheme = normalizeTheme(theme)
  const isLight = nextTheme === 'light'

  root.setAttribute('data-theme', nextTheme)
  root.style.colorScheme = nextTheme

  if (isLight) {
    root.style.setProperty('--bg-primary', '#ffffff')
    root.style.setProperty('--bg-secondary', '#f3f4f6')
    root.style.setProperty('--bg-tertiary', '#e5e7eb')
    root.style.setProperty('--text-primary', '#111827')
    root.style.setProperty('--text-secondary', '#374151')
    root.style.setProperty('--text-tertiary', '#6b7280')
    root.style.setProperty('--border', '#e5e7eb')
    root.style.setProperty('--bubble-in', '#e5e7eb')
    root.style.setProperty('--bubble-in-text', '#111827')
    root.style.setProperty('--sidebar-bg', '#f9fafb')
  } else {
    root.style.setProperty('--bg-primary', '#111111')
    root.style.setProperty('--bg-secondary', '#1a1a1a')
    root.style.setProperty('--bg-tertiary', '#222222')
    root.style.setProperty('--text-primary', '#f0f0f0')
    root.style.setProperty('--text-secondary', '#999999')
    root.style.setProperty('--text-tertiary', '#555555')
    root.style.setProperty('--border', '#252525')
    root.style.setProperty('--bubble-in', '#1a1a1a')
    root.style.setProperty('--bubble-in-text', '#f0f0f0')
    root.style.setProperty('--sidebar-bg', '#0a0a0a')
  }
}

function readThemeFromStorage() {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem(THEME_KEY)
  return normalizeTheme(stored)
}

function syncTheme() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const theme = readThemeFromStorage()
  applyTheme(theme)

  if (!localStorage.getItem(THEME_KEY)) {
    localStorage.setItem(THEME_KEY, 'light')
  }
}

function patchLocalStorageThemeUpdates() {
  if (typeof window === 'undefined') return

  const storage = window.localStorage
  const originalSetItem = storage.setItem.bind(storage)
  const originalRemoveItem = storage.removeItem.bind(storage)

  storage.setItem = function (key, value) {
    originalSetItem(key, value)
    if (key === THEME_KEY) {
      syncTheme()
      window.dispatchEvent(new Event(THEME_EVENT))
    }
  }

  storage.removeItem = function (key) {
    originalRemoveItem(key)
    if (key === THEME_KEY) {
      syncTheme()
      window.dispatchEvent(new Event(THEME_EVENT))
    }
  }
}

;(function initTheme() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  syncTheme()
  patchLocalStorageThemeUpdates()

  window.addEventListener('storage', (event) => {
    if (event.key === THEME_KEY) {
      syncTheme()
    }
  })

  window.addEventListener(THEME_EVENT, syncTheme)
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