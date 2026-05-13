import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import App from './App'

const root = document.getElementById('app')
if (root) {
  createRoot(root).render(createElement(App))
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silently fail - app works offline anyway
    })
  })
}
