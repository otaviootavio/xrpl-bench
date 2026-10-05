import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerServiceWorker } from '@/lib/sw-register'
import './index.css'
import App from './App.tsx'

// Static app shell only — see vite.config.ts and docs/decisions.md
// guardrail #6: RPC/ledger traffic is never served from this cache.
// AD-11: one registration path, shared with `useAppUpdate`; whichever module
// asks first, there is exactly one worker registered.
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
