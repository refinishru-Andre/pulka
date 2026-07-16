// Supabase-клиент. Использует схему pulka.
// ANON_KEY публичный — безопасно хранить в JS-бандле.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pulka-api-178-154-204-13.sslip.io'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.2a5F_ptyl3Cs2az7K8NF-KhCc5xi8f74nBfZkYm_Xao'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
    storage: window.localStorage,
    storageKey: 'pulka-auth',
  },
  db: {
    schema: 'pulka',
  },
})

// Проверка авторизации при старте
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}
