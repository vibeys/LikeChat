import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

export default function ErrorBoundary({ children }) {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const handleError = (error) => {
      console.error('Caught error:', error)
      setHasError(true)
      toast.error('Something went wrong. Please refresh the page.')
    }

    const handleUnhandledRejection = (event) => {
      console.error('Unhandled promise rejection:', event.reason)
      setHasError(true)
      toast.error('Something went wrong. Please refresh the page.')
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  if (hasError) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-0)',
        flexDirection: 'column',
        gap: '16px',
        padding: '24px',
        textAlign: 'center'
      }}>
        <h1 style={{ color: 'var(--text-1)', fontSize: '24px', fontWeight: '700' }}>
          Oops! Something went wrong
        </h1>
        <p style={{ color: 'var(--text-2)', maxWidth: '400px' }}>
          We encountered an unexpected error. Try refreshing the page or contact support if the problem persists.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Refresh Page
        </button>
      </div>
    )
  }

  return children
}
