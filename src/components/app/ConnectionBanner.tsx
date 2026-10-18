import { WifiSlashIcon } from '@phosphor-icons/react'
import { useOnline } from '@/hooks/useOnline'

/** Study §4.8: a clear banner when the browser is offline. Request failures show in place, with Retry. */
export function ConnectionBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="motion-enter sticky top-0 z-40 flex items-center justify-center gap-2 bg-red-bg px-4 py-2 text-sm text-red-fg">
      <WifiSlashIcon className="size-4" />
      No internet connection. Changes cannot be saved or posted until it returns. Unsaved drafts stay on this device.
    </div>
  )
}
