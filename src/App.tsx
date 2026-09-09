import { useEffect, useState } from 'react'
import { useGameStore } from './store/game'
import { NewGame } from './screens/NewGame'
import { Table } from './screens/Table'
import { Login } from './screens/Login'
import { GamesList } from './screens/GamesList'
import { Stats } from './screens/Stats'
import { Calculator } from './screens/Calculator'
import { supabase } from './supabase/client'
import { useOnline } from './store/online'
import type { User } from '@supabase/supabase-js'

type Screen = 'games' | 'newGame' | 'table' | 'stats' | 'calc'

// Метка «человек сейчас за столом» — переживает перезагрузку вкладки
const TABLE_OPEN_KEY = 'pulka-at-table'

// Тонкая полоса поверх всего, пока у планшета нет сети.
// Коротко и по делу: писать можно, но эту партию нельзя открывать на другом
// устройстве — иначе две копии разойдутся и одна затрёт другую.
function OfflineBar() {
  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-slate-900 text-center text-sm font-semibold px-3 py-1.5">
      ▲ Нет связи · записывать можно, всё сохраняется здесь · не открывай эту партию на другом
      устройстве
    </div>
  )
}

export default function App() {
  const online = useOnline()
  const game = useGameStore((s) => s.game)
  const gameId = useGameStore((s) => s.gameId)
  const recalculate = useGameStore((s) => s.recalculate)
  const attachToCloud = useGameStore((s) => s.attachToCloud)
  const [user, setUser] = useState<User | null | undefined>(undefined) // undefined = загрузка
  const [skipAuth, setSkipAuth] = useState(false)
  // Возврат за стол после перезагрузки вкладки.
  //
  // iPhone выгружает фоновые вкладки: убрал телефон в карман на пару сдач,
  // достал — браузер перезагрузил страницу, и человек оказывался в списке
  // партий, хотя играл (отчёт тестировщика 09.09). Запоминаем, что стол был
  // открыт, и возвращаемся туда, если текущая партия ещё идёт.
  const [screen, setScreen] = useState<Screen>(() => {
    try {
      return window.localStorage.getItem(TABLE_OPEN_KEY) === '1' ? 'table' : 'games'
    } catch {
      return 'games'
    }
  })
  const [importNotice, setImportNotice] = useState<string | null>(null)

  // Пересчёт из истории при загрузке
  useEffect(() => {
    recalculate()
  }, [recalculate])

  // Держим метку в согласии с экраном
  useEffect(() => {
    try {
      if (screen === 'table' && game) window.localStorage.setItem(TABLE_OPEN_KEY, '1')
      else window.localStorage.removeItem(TABLE_OPEN_KEY)
    } catch {
      /* приватный режим — не критично */
    }
  }, [screen, game])

  // Партии нет, а метка осталась (партию отложили или удалили) — идём в список
  useEffect(() => {
    if (screen === 'table' && !game) setScreen('games')
  }, [screen, game])

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
    // На экране входа полоса особенно нужна: без сети вход не пройдёт в
    // принципе, и человек будет думать, что забыл кодовое слово.
    return (
      <>
        {!online && <OfflineBar />}
        <Login onSkip={() => setSkipAuth(true)} />
      </>
    )
  }

  // Залогинен: показываем список партий или редактор
  if (user) {
    let content: JSX.Element
    if (screen === 'table' && game) {
      content = <Table onBack={() => setScreen('games')} />
    } else if (screen === 'newGame') {
      content = <NewGame onCancel={() => setScreen('games')} onCreated={() => setScreen('table')} />
    } else if (screen === 'stats') {
      content = <Stats onBack={() => setScreen('games')} />
    } else if (screen === 'calc') {
      content = <Calculator onBack={() => setScreen('games')} />
    } else {
      content = (
        <GamesList
          onOpenGame={() => setScreen('table')}
          onNewGame={() => setScreen('newGame')}
          onOpenStats={() => setScreen('stats')}
          onOpenCalc={() => setScreen('calc')}
        />
      )
    }
    return (
      <>
        {!online && <OfflineBar />}
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
  return (
    <div className="min-h-screen">
      {!online && <OfflineBar />}
      {game ? <Table /> : <NewGame />}
    </div>
  )
}
