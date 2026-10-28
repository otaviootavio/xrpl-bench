import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerServiceWorker } from '@/lib/sw-register'
import { rewriteBootLocation } from '@/lib/route'
import './index.css'
import App from './App.tsx'

// Static app shell only — see vite.config.ts and docs/decisions.md
// guardrail #6: RPC/ledger traffic is never served from this cache.
// AD-11: one registration path, shared with `useAppUpdate`; whichever module
// asks first, there is exactly one worker registered.
registerServiceWorker()

// AD-32: before the first render, so a bookmark or reload can never mount an
// in-wallet screen. Not an effect, and does not wait for Gate.
rewriteBootLocation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
