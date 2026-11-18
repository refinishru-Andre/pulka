import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Обновление приложения. Раньше новая версия подхватывалась только после
// полного перезапуска, а открытое на телефоне приложение часами держало старый
// код — исправления «не применялись» (18.11.2026). Теперь проверяем сайт при
// каждом возвращении в приложение и раз в 10 минут; нашлась новая версия —
// страница перезагружается сама. Партия хранится в памяти устройства и не
// теряется; пропадёт разве что недозаполненная форма сдачи.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => {
      if (navigator.onLine) reg.update().catch(() => {})
    }
    setInterval(check, 10 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
