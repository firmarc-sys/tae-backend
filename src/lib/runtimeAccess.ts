import type { SIOSIdentity } from './identity'
import { OWNER_EMAILS, OWNER_GID } from './identity'
import type { SubscriptionTier } from './subscriptions'

export type RuntimePageId =
  | 'command-center'
  | 'galactic-id'
  | 'syncori'
  | 'iot-field'
  | 'alphabeta'
  | 'novalife-vulgate'
  | 'tae-runtime'

export type SubscriptionStatus = 'trial' | 'active' | 'inactive'

export interface SubscriberRecord {
  email: string
  name: string
  gid: string
  tier: SubscriptionTier
  subscriptionStatus: SubscriptionStatus
  trialStart: string
  trialExpires: string
  manuallyApproved: boolean
  createdAt: string
}

export interface AccessState {
  isOwner: boolean
  tier: SubscriptionTier
  subscriptionStatus: SubscriptionStatus
  trialActive: boolean
  manuallyApproved: boolean
  unlockedPages: RuntimePageId[]
  lockedReason: string | null
  subscriber: SubscriberRecord
}

const KEY_SUBSCRIBER = 'sios_subscriber_v1'
const TRIAL_MS = 24 * 60 * 60 * 1000

export const PAGE_ACCESS: Record<SubscriptionTier, RuntimePageId[]> = {
  free: ['command-center', 'galactic-id'],
  beta: ['command-center', 'galactic-id', 'syncori', 'iot-field', 'alphabeta', 'novalife-vulgate', 'tae-runtime'],
  alpha: ['command-center', 'galactic-id', 'syncori', 'iot-field', 'alphabeta', 'novalife-vulgate', 'tae-runtime'],
  owner: ['command-center', 'galactic-id', 'syncori', 'iot-field', 'alphabeta', 'novalife-vulgate', 'tae-runtime'],
}

function nowIso() {
  return new Date().toISOString()
}

function addTrialWindow(start: string) {
  return new Date(new Date(start).getTime() + TRIAL_MS).toISOString()
}

export function isOwnerIdentity(identity: Pick<SIOSIdentity, 'email' | 'gid'> | null | undefined) {
  if (!identity) return false
  return OWNER_EMAILS.includes(identity.email as (typeof OWNER_EMAILS)[number]) || identity.gid === OWNER_GID
}

export function createSubscriberRecord(identity: SIOSIdentity): SubscriberRecord {
  const createdAt = identity.createdAt || nowIso()
  const trialStart = createdAt
  return {
    email: identity.email,
    name: identity.name,
    gid: identity.gid,
    tier: isOwnerIdentity(identity) ? 'owner' : (identity.subscriptionTier ?? 'free'),
    subscriptionStatus: isOwnerIdentity(identity) ? 'active' : 'trial',
    trialStart,
    trialExpires: addTrialWindow(trialStart),
    manuallyApproved: isOwnerIdentity(identity),
    createdAt,
  }
}

export function loadSubscriberRecord(identity: SIOSIdentity | null): SubscriberRecord | null {
  if (!identity) return null
  try {
    const raw = localStorage.getItem(KEY_SUBSCRIBER)
    if (!raw) {
      const created = createSubscriberRecord(identity)
      saveSubscriberRecord(created)
      return created
    }
    const parsed = JSON.parse(raw) as SubscriberRecord
    if (parsed.email !== identity.email && parsed.gid !== identity.gid) {
      const created = createSubscriberRecord(identity)
      saveSubscriberRecord(created)
      return created
    }
    return parsed
  } catch {
    const created = createSubscriberRecord(identity)
    saveSubscriberRecord(created)
    return created
  }
}

export function saveSubscriberRecord(record: SubscriberRecord) {
  localStorage.setItem(KEY_SUBSCRIBER, JSON.stringify(record))
}

export function updateSubscriberRecord(patch: Partial<SubscriberRecord>, identity: SIOSIdentity | null) {
  const base = loadSubscriberRecord(identity)
  if (!base) return null
  const next = { ...base, ...patch }
  saveSubscriberRecord(next)
  return next
}

export function getAccessState(identity: SIOSIdentity | null): AccessState {
  if (!identity) {
    const anon = {
      email: '',
      name: '',
      gid: '',
      tier: 'free' as SubscriptionTier,
      subscriptionStatus: 'inactive' as SubscriptionStatus,
      trialStart: nowIso(),
      trialExpires: nowIso(),
      manuallyApproved: false,
      createdAt: nowIso(),
    }
    return {
      isOwner: false,
      tier: 'free',
      subscriptionStatus: 'inactive',
      trialActive: false,
      manuallyApproved: false,
      unlockedPages: ['home-core'],
      lockedReason: 'SUBSCRIPTION REQUIRED',
      subscriber: anon,
    }
  }

  const owner = isOwnerIdentity(identity)
  const subscriber = loadSubscriberRecord(identity) ?? createSubscriberRecord(identity)
  if (owner) {
    const ownerRecord = { ...subscriber, tier: 'owner' as SubscriptionTier, subscriptionStatus: 'active' as SubscriptionStatus, manuallyApproved: true }
    saveSubscriberRecord(ownerRecord)
    return {
      isOwner: true,
      tier: 'owner',
      subscriptionStatus: 'active',
      trialActive: true,
      manuallyApproved: true,
      unlockedPages: PAGE_ACCESS.owner,
      lockedReason: null,
      subscriber: ownerRecord,
    }
  }

  const trialActive = Date.now() <= new Date(subscriber.trialExpires).getTime()
  const unlockedBySubscription = subscriber.manuallyApproved || subscriber.subscriptionStatus === 'active'
  const tier = unlockedBySubscription ? subscriber.tier : 'free'
  const unlockedPages = unlockedBySubscription ? PAGE_ACCESS[tier] : trialActive ? ['home-core', 'galactic-id'] : ['home-core']

  return {
    isOwner: false,
    tier,
    subscriptionStatus: subscriber.subscriptionStatus,
    trialActive,
    manuallyApproved: subscriber.manuallyApproved,
    unlockedPages,
    lockedReason: unlockedPages.length > 1 ? null : 'SUBSCRIPTION REQUIRED',
    subscriber,
  }
}

export function canAccessPage(access: AccessState, page: RuntimePageId) {
  return access.unlockedPages.includes(page)
}
