// Есть ли у устройства сеть.
//
// Зачем отдельно от статуса записи (sync-status): тот показывает, доехала ли
// ПОСЛЕДНЯЯ сдача, и загорается только после неудачной попытки. А человеку
// нужно видеть обрыв сразу — до того, как он что-то запишет и решит, что всё
// уехало. Замечание Андрея 09.09.2026: «чтобы не накосячить».
//
// navigator.onLine честен только в одну сторону: false — сети точно нет,
// true — она может быть, а сервер всё равно недоступен (так бывает с доменом
// sslip.io у мобильных операторов). Второй случай ловит sync-status.

import { useEffect, useState } from 'react'

export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
