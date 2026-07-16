// Авторизация по кодовому слову.
// Email = детерминированный хэш(код) → одинаковый код всегда даёт одного пользователя.
// Пароль = сам код.

import { supabase } from './client'

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function normalize(code: string): string {
  return code.trim().toLowerCase()
}

async function credentialsFor(code: string): Promise<{ email: string; password: string }> {
  const normalized = normalize(code)
  const hash = await sha256Hex('pulka-app-v1:' + normalized)
  const email = `u-${hash.slice(0, 40)}@pulka.local`
  // Пароль: хешируем — так даже владельцу БД не виден исходный код в чистом виде
  const password = await sha256Hex('pw:' + normalized)
  return { email, password }
}

// Войти или зарегистрироваться по кодовому слову
export async function loginWithCode(code: string): Promise<void> {
  const cred = await credentialsFor(code)
  // Пробуем войти
  const signIn = await supabase.auth.signInWithPassword(cred)
  if (!signIn.error && signIn.data.session) return

  // Не получилось → регистрируемся
  const signUp = await supabase.auth.signUp(cred)
  if (signUp.error) {
    throw new Error(`Регистрация: ${signUp.error.message}`)
  }
  // После signUp с autoconfirm сессия должна установиться автоматически.
  // На всякий случай попробуем ещё раз signIn если сессии нет.
  if (!signUp.data.session) {
    const retry = await supabase.auth.signInWithPassword(cred)
    if (retry.error) throw new Error(`Вход после регистрации: ${retry.error.message}`)
  }
}
