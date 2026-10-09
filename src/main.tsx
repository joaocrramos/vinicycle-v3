/* Main entry point for the application - renders the root React component */
import { createRoot } from 'react-dom/client'
import '../apps/web/src/main'

// @skip-protected: Do not remove. Required for React rendering.
const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(null)
}
