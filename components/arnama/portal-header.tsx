import Link from 'next/link'
import { Settings } from 'lucide-react'
import { NotificationBell } from './notification-bell'

export function PortalHeader() {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex size-11 shrink-0 rotate-3 items-center justify-center rounded-2xl border-4 border-black bg-pink font-display text-lg shadow-brutal-sm sm:size-12"
          style={{ color: '#000' }}
        >
          a
        </div>
        <div className="min-w-0">
          <h1
            className="truncate font-display text-lg leading-none sm:text-2xl"
            style={{ color: '#FFFDF5' }}
          >
            arnama
          </h1>
          <p
            className="mt-1 truncate text-xs font-bold sm:mt-1.5 sm:text-sm"
            style={{ color: 'rgba(255,253,245,0.6)' }}
          >
            our little corner of the internet
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <NotificationBell />
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex size-11 items-center justify-center rounded-2xl border-4 border-black shadow-brutal-sm transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
          style={{ backgroundColor: '#E2F0D9', color: '#000' }}
        >
          <Settings className="size-5" strokeWidth={2.75} />
        </Link>
      </div>
    </header>
  )
}