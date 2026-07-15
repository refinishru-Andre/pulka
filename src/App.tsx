import { useEffect } from 'react'
import { useGameStore } from './store/game'
import { NewGame } from './screens/NewGame'
import { Table } from './screens/Table'

export default function App() {
  const game = useGameStore((s) => s.game)
  const recalculate = useGameStore((s) => s.recalculate)

  // При первой загрузке пересчитываем всё из истории deals — гарантия
  // что state соответствует актуальной логике движка
  useEffect(() => {
    recalculate()
  }, [recalculate])

  return <div className="min-h-screen">{game ? <Table /> : <NewGame />}</div>
}
