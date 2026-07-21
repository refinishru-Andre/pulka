import { useEffect, useState } from 'react'
import { useGameStore } from './store/game'
import { NewGame } from './screens/NewGame'
import { Table } from './screens/Table'
import { Login } from './screens/Login'
import { GamesList } from './screens/GamesList'
import { supabase } from './supabase/client'
import type { User } from '@supabase/supabase-js'

type Screen = 'games' | 'newGame' | 'table'

export default function App() {
  const game = useGameStore((s) => s.game)
  const gameId = useGameStore((s) => s.gameId)
  const recalculate = useGameStore((s) => s.recalculate)
  const attachToCloud = useGameStore((s) => s.attachToCloud)
  const [user, setUser] = useState<User | null | undefined>(undefined) // undefined = загрузка
  const [skipAuth, setSkipAuth] = useState(false)
  const [screen, setScreen] = useState<Screen>(game ? 'table' : 'games')
  const [importNotice, setImportNotice] = useState<string | null>(null)

  // Пересчёт из истории при загрузке
  useEffect(() => {
    recalculate()
  }, [recalculate])

  // Отслеживание сессии Supabase
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Автоматически подтягиваем локальную игру в облако при первом входе
  useEffect(() => {
    if (user && game && !gameId) {
      attachToCloud().then((id) => {
        if (id) setImportNotice('Локальная партия загружена в облако ✓')
      })
    }
  }, [user, game, gameId, attachToCloud])

  // Загрузка ещё в процессе
  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">Загрузка...</div>
      </div>
    )
  }

  // Не залогинен и не пропустил → показать Login
  if (!user && !skipAuth) {
    return <Login onSkip={() => setSkipAuth(true)} />
  }

  // Залогинен: показываем список партий или редактор
  if (user) {
    let content: JSX.Element
    if (screen === 'table' && game) {
      content = <Table onBack={() => setScreen('games')} />
    } else if (screen === 'newGame') {
      content = <NewGame onCancel={() => setScreen('games')} onCreated={() => setScreen('table')} />
    } else {
      content = (
        <GamesList onOpenGame={() => setScreen('table')} onNewGame={() => setScreen('newGame')} />
      )
    }
    return (
      <>
        {content}
        {importNotice && (
          <div
            className="fixed top-5 right-5 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg cursor-pointer"
            onClick={() => setImportNotice(null)}
          >
            {importNotice}
          </div>
        )}
      </>
    )
  }

  // Гость (без аккаунта) — старая логика с одной игрой в LocalStorage
  return <div className="min-h-screen">{game ? <Table /> : <NewGame />}</div>
}
