// Авторизация по кодовому слову.
// Email = детерминированный хэш(код) → одинаковый код всегда даёт одного пользователя.
// Пароль = хэш кода.
//
// ВАЖНО: «Войти» и «Создать новую коллекцию» — РАЗНЫЕ действия.
// Раньше при опечатке приложение молча регистрировало новый пустой аккаунт,
// человек этого не замечал и партия уходила «не туда». Теперь опечатка = понятная ошибка.

import { supabase } from './client'

const HINT_KEY = 'pulka-code-hint'

export type AuthErrorKind = 'network' | 'not_found' | 'taken' | 'unknown'

export class AuthError extends Error {
  kind: AuthErrorKind
  constructor(kind: AuthErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

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

// Связи с сервером нет (домен заблокирован провайдером, нет интернета и т.п.)
function isNetworkError(msg: string): boolean {
  const m = msg.toLowerCase()
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed')
  )
}

// Запомнить кодовое слово для показа в интерфейсе («ты сейчас в коллекции ...»)
function rememberHint(code: string) {
  try {
    window.localStorage.setItem(HINT_KEY, normalize(code))
  } catch {
    /* приватный режим браузера — не критично */
  }
}

export function getCodeHint(): string | null {
  try {
    return window.localStorage.getItem(HINT_KEY)
  } catch {
    return null
  }
}

export function clearCodeHint() {
  try {
    window.localStorage.removeItem(HINT_KEY)
  } catch {
    /* игнорируем */
  }
}

// ВХОД в существующую коллекцию. Новый аккаунт НЕ создаётся никогда.
export async function signInWithCode(code: string): Promise<void> {
  const cred = await credentialsFor(code)
  const { data, error } = await supabase.auth.signInWithPassword(cred)
  if (!error && data.session) {
    rememberHint(code)
    return
  }
  const msg = error?.message ?? 'Не удалось войти'
  if (isNetworkError(msg)) {
    throw new AuthError(
      'network',
      'Нет связи с сервером. Проверь интернет — и попробуй мобильный интернет вместо Wi-Fi (или наоборот).',
    )
  }
  if (msg.toLowerCase().includes('invalid login credentials')) {
    throw new AuthError(
      'not_found',
      'Такого кодового слова нет. Проверь опечатку и раскладку клавиатуры. Новая коллекция сама не создастся — для этого есть отдельная кнопка внизу.',
    )
  }
  throw new AuthError('unknown', msg)
}

// СОЗДАНИЕ новой коллекции — только по явному нажатию отдельной кнопки.
//
// СЛОВО ПРОВЕРЯЕТСЯ НА ЗАНЯТОСТЬ. Раньше занятое слово молча ВПУСКАЛО в чужую
// коллекцию: пароль выводится из того же слова, значит вход подходил. Пока
// приложением пользовались трое, это было незаметно. Как только ссылку раздают
// друзьям, два человека, придумавших «преферанс», оказались бы в одной записи
// и писали бы друг другу в партии (решение Андрея 09.09.2026).
//
// Проверка простая: пробуем войти этим словом. Вход прошёл — слово занято,
// сразу выходим обратно, чтобы человек не оказался в чужой коллекции даже на
// мгновение, и просим придумать другое.
export async function createCollectionWithCode(code: string): Promise<{ joinedExisting: boolean }> {
  const cred = await credentialsFor(code)

  const probe = await supabase.auth.signInWithPassword(cred)
  if (!probe.error && probe.data.session) {
    await supabase.auth.signOut()
    throw new AuthError(
      'taken',
      'Это кодовое слово уже занято — по нему есть коллекция. Придумай другое, подлиннее и своё: например «синий-чайник-77». Если коллекция твоя — входи кнопкой «Войти», а не создавай новую.',
    )
  }
  const probeMsg = probe.error?.message ?? ''
  if (isNetworkError(probeMsg)) {
    throw new AuthError('network', 'Нет связи с сервером. Проверь интернет и попробуй ещё раз.')
  }

  const signUp = await supabase.auth.signUp(cred)

  if (signUp.error) {
    const msg = signUp.error.message
    if (isNetworkError(msg)) {
      throw new AuthError('network', 'Нет связи с сервером. Проверь интернет и попробуй ещё раз.')
    }
    // Подстраховка: сервер сам сказал, что такое слово уже есть
    if (
      msg.toLowerCase().includes('already registered') ||
      (signUp.error as { code?: string }).code === 'user_already_exists'
    ) {
      throw new AuthError(
        'taken',
        'Это кодовое слово уже занято. Придумай другое, подлиннее и своё.',
      )
    }
    throw new AuthError('unknown', msg)
  }

  // При autoconfirm сессия приходит сразу; если нет — доводим вход руками
  if (!signUp.data.session) {
    await signInWithCode(code)
    return { joinedExisting: false }
  }
  rememberHint(code)
  return { joinedExisting: false }
}
