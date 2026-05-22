import type { RuntimePageDefinition } from '../components/RuntimeShell'

export const RUNTIME_PAGES: RuntimePageDefinition[] = [
  {
    id: 'command-center',
    label: 'Command Center',
    asset: '/assets/pages/home-core.png',
    accent: 'cyan',
    summary: 'Prime Orchestrator Dashboard',
    actions: [
      { id: 'cc-status', label: 'Check Status', detail: 'Verify system status', command: 'check status' },
      { id: 'cc-nodes', label: 'View Nodes', detail: 'Show connected nodes', command: 'view connected nodes' }
    ]
  },
  {
    id: 'galactic-id',
    label: 'Galactic Identity',
    asset: '/assets/profile/galactic-id-card.png',
    accent: 'violet',
    summary: 'Owner Profile — ROOT Clearance',
    actions: [
      { id: 'id-profile', label: 'Profile Detail', detail: 'Open profile detail', command: 'open profile' },
      { id: 'id-clearance', label: 'Clearance Level', detail: 'Check root clearance', command: 'check clearance' }
    ]
  },
  {
    id: 'syncori',
    label: 'Syncori Render Engine',
    asset: '/assets/pages/syncori-studio.png',
    accent: 'magenta',
    summary: 'Real-Time Render Pipeline',
    actions: [
      { id: 'sync-engine', label: 'Engine Status', detail: 'View render status', command: 'view syncori status' },
      { id: 'sync-pipeline', label: 'Pipeline Pulse', detail: 'Check pipeline buffer', command: 'check syncori pipeline' }
    ]
  },
  {
    id: 'iot-field',
    label: 'IoT Field',
    asset: '/assets/pages/iot-bridge.png',
    accent: 'teal',
    summary: 'Device Management Matrix',
    actions: [
      { id: 'iot-devices', label: 'Active Devices', detail: 'List connected devices', command: 'list iot devices' },
      { id: 'iot-mesh', label: 'Sensor Mesh', detail: 'Check sensor status', command: 'check sensor mesh' }
    ]
  },
  {
    id: 'alphabeta',
    label: 'AlphaBeta Program',
    asset: '/assets/pages/alphabeta.png',
    accent: 'gold',
    summary: 'Subscriber & Program Management',
    actions: [
      { id: 'ab-subs', label: 'Subscribers', detail: 'View subscriber count', command: 'view subscribers' },
      { id: 'ab-status', label: 'Program Phase', detail: 'Check active phase', command: 'check program status' }
    ]
  },
  {
    id: 'novalife-vulgate',
    label: 'NovaLife / Vulgate',
    asset: '/assets/pages/nova-life.png',
    accent: 'blue',
    summary: 'Nova & Vulgate Module Interface',
    actions: [
      { id: 'nv-modules', label: 'Module Sync', detail: 'Synchronize modules', command: 'sync novalife modules' },
      { id: 'nv-instances', label: 'Active Instances', detail: 'View vulgate instances', command: 'view vulgate instances' }
    ]
  },
  {
    id: 'tae-runtime',
    label: 'TAE Runtime',
    asset: '/assets/pages/home-core.png',
    accent: 'indigo',
    summary: 'TAE System Runtime Status',
    actions: [
      { id: 'tae-status', label: 'Runtime Status', detail: 'View active threads', command: 'check tae runtime' },
      { id: 'tae-demo', label: 'Demo Mode', detail: 'Trigger orchestrator demo', command: 'TAE, enter Demo Mode' }
    ]
  }
]
