/**
 * Web Push subscribe/unsubscribe helpers (spec 063) — pure browser-API
 * wiring kept separate from PublicPortalView.vue, matching this repo's
 * convention of extracting non-Vue logic into src/utils/.
 */
import { supabase } from '@/services/api/config.js'

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

/** Registers the service worker and subscribes via PushManager, then
 * registers the subscription with subscribe-push (spec 063). Returns the
 * PushSubscription on success. */
export async function subscribeToPush({ countryCode, regionCode, hazardTypeFilter }) {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) throw new Error('Push notifications are not configured for this deployment.')
  if (!isPushSupported()) throw new Error('Push notifications are not supported in this browser.')

  const registration = await navigator.serviceWorker.register('/sw.js')
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })

  const { error } = await supabase.functions.invoke('subscribe-push', {
    body: {
      countryCode,
      regionCode: regionCode || null,
      hazardTypeFilter: hazardTypeFilter || null,
      subscription: subscription.toJSON(),
    },
  })
  if (error) throw error

  return subscription
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await supabase.functions.invoke('subscribe-push', {
    body: { action: 'unsubscribe', endpoint: subscription.endpoint },
  })
  await subscription.unsubscribe()
}

export async function getExistingPushSubscription() {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  return (await registration?.pushManager.getSubscription()) ?? null
}
