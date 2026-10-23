import { createClient } from '@supabase/supabase-js'

// Bu iki değer herkese açıktır (anon key gizli değildir); veriyi RLS korur.
// Build sırasında GitHub Secrets'tan gelir. Boşsa site demo modda açılır.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase = url && anonKey ? createClient(url, anonKey) : null
export const isDemo = !supabase
