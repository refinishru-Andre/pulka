// Справочник игроков — CRUD через Supabase.
// Имя нормализуется: trim + первая буква заглавная. Уникальность по lowercase.

import { supabase } from './client'

export interface Person {
  id: string
  name: string
}

interface CloudPerson {
  id: string
  owner_id: string
  name: string
  name_lc: string
  created_at: string
}

function normalizeName(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ')
  if (!t) return ''
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Загрузить всех своих игроков
export async function fetchPeople(): Promise<Person[]> {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return []
  const { data, error } = await supabase.from('people').select('id, name').order('name')
  if (error) {
    console.error('[people] fetch failed:', error)
    return []
  }
  return (data as CloudPerson[]).map((p) => ({ id: p.id, name: p.name }))
}

// Добавить нового игрока (или вернуть существующего с таким же именем)
export async function upsertPerson(rawName: string): Promise<Person | null> {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return null
  const name = normalizeName(rawName)
  if (!name) return null
  const name_lc = name.toLowerCase()

  // Проверяем есть ли уже
  const { data: existing } = await supabase
    .from('people')
    .select('id, name')
    .eq('name_lc', name_lc)
    .maybeSingle()
  if (existing) return existing as Person

  const { data, error } = await supabase
    .from('people')
    .insert({ owner_id: user.id, name, name_lc })
    .select('id, name')
    .single()
  if (error) {
    console.error('[people] upsert failed:', error)
    return null
  }
  return data as Person
}

// Импорт имён из существующих партий (первый вход — заполняем справочник)
export async function importFromGames(games: { players: Record<string, string> }[]): Promise<void> {
  const names = new Set<string>()
  for (const g of games) {
    for (const p of Object.values(g.players)) {
      const n = normalizeName(p)
      if (n) names.add(n)
    }
  }
  for (const n of names) {
    await upsertPerson(n).catch(() => {})
  }
}

// Переименовать игрока (обновить в справочнике)
export async function renamePerson(id: string, newRawName: string): Promise<Person | null> {
  const name = normalizeName(newRawName)
  if (!name) return null
  const { data, error } = await supabase
    .from('people')
    .update({ name, name_lc: name.toLowerCase() })
    .eq('id', id)
    .select('id, name')
    .single()
  if (error) return null
  return data as Person
}

// Удалить (не рекомендуется если игрок участвовал в партиях)
export async function deletePerson(id: string): Promise<boolean> {
  const { error } = await supabase.from('people').delete().eq('id', id)
  return !error
}
