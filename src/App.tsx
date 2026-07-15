import { useGameStore } from './store/game'
import { NewGame } from './screens/NewGame'
import { Table } from './screens/Table'

export default function App() {
  const game = useGameStore((s) => s.game)
  return (
    <div className="min-h-screen">{game ? <Table /> : <NewGame />}</div>
  )
}
