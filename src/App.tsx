import { RuntimeProvider } from './contexts/RuntimeContext'
import { OWNER_IDENTITY } from './lib/identity'
import { MercuryDesktop } from './mercury/MercuryDesktop'
import './mercury/mercury.css'

export default function App() {
  return (
    <RuntimeProvider identity={OWNER_IDENTITY}>
      <MercuryDesktop identity={OWNER_IDENTITY} />
    </RuntimeProvider>
  )
}
