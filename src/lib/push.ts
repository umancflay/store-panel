import { supabase } from './supabase'

// Web push aboneliği. Bildirimi GitHub Actions gönderir (4. aşamada bağlanacak).
// VAPID public key herkese açıktır; private key sadece GitHub Secrets'ta durur.
const vapidPublic = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const pushConfigured = !!vapidPublic

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export async function enablePush(): Promise<string | null> {
  if (!pushSupported) return 'Bu tarayıcı bildirimleri desteklemiyor. iPhone\'da önce siteyi ana ekrana eklemelisin.'
  if (!vapidPublic || !supabase) return 'Bildirim anahtarı (VAPID) henüz ayarlanmamış. README\'deki adımlara bak.'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'Bildirim izni verilmedi.'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublic) })
  const json = sub.toJSON()
  const { data: user } = await supabase.auth.getUser()
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: json.endpoint, keys: json.keys, user_id: user.user?.id })
  return error ? error.message : null
}

// Uygulama her açıldığında: izin verilmişse bu cihazın kaydını tazele. iPhone'da uygulama yeniden eklenince ya da
// iOS aboneliği yenileyince eski kayıt sessizce boşa gidiyordu; böylece veritabanında hep güncel kayıt olur.
export async function refreshPush() {
  if (!pushSupported || !vapidPublic || !supabase || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublic) }))
    const json = sub.toJSON()
    const { data: user } = await supabase.auth.getUser()
    if (user.user) await supabase.from('push_subscriptions').upsert({ endpoint: json.endpoint, keys: json.keys, user_id: user.user.id })
  } catch {
    /* sessizce geç; Ayarlar'dan elle açılabilir */
  }
}

// Bu cihazın durumu: izin ve kayıt
export async function pushState(): Promise<'unsupported' | 'denied' | 'off' | 'on'> {
  if (!pushSupported) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off'
}

// Test bildirimi: kuyruğa yazar, Asistan işi 10 dakika içinde telefona gönderir
export async function sendTestPush(email: string) {
  if (!supabase) return 'Demo modda gönderilmez.'
  const { error } = await supabase.from('notify_outbox').insert({
    to_email: email, title: 'Test bildirimi', body: 'Bu bildirimi görüyorsan telefon bildirimleri çalışıyor 🎉', url: './#/ayarlar',
  })
  return error ? error.message : null
}
