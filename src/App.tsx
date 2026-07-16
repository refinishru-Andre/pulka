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
  const recalculate = useGameStore((s) => s.recalculate)
  const [user, setUser] = useState<User | null | undefined>(undefined) // undefined = загрузка
  const [skipAuth, setSkipAuth] = useState(false)
  const [screen, setScreen] = useState<Screen>(game ? 'table' : 'games')

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
    if (screen === 'table' && game) {
      return <Table onBack={() => setScreen('games')} />
    }
    if (screen === 'newGame') {
      return <NewGame onCancel={() => setScreen('games')} onCreated={() => setScreen('table')} />
    }
    return (
      <GamesList onOpenGame={() => setScreen('table')} onNewGame={() => setScreen('newGame')} />
    )
  }

  // Гость (без аккаунта) — старая логика с одной игрой в LocalStorage
  return <div className="min-h-screen">{game ? <Table /> : <NewGame />}</div>
}
