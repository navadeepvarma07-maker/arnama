import { Bell, Settings } from 'lucide-react'

export function PortalHeader() {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-11 shrink-0 rotate-3 items-center justify-center rounded-2xl border-4 border-ink bg-pink font-display text-lg text-ink shadow-brutal-sm sm:size-12">
          a
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg leading-none text-ink sm:text-2xl">
            arnama
          </h1>
          <p className="mt-1 truncate text-xs font-bold text-ink/60 sm:mt-1.5 sm:text-sm">
            our little corner of the internet
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-11 items-center justify-center rounded-2xl border-4 border-ink bg-lavender text-ink shadow-brutal-sm transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
        >
          <Bell className="size-5" strokeWidth={2.75} />
          <span className="absolute -right-1.5 -top-1.5 size-4 rounded-full border-2 border-ink bg-pink-deep" />
        </button>
        <button
          type="button"
          aria-label="Settings"
          className="flex size-11 items-center justify-center rounded-2xl border-4 border-ink bg-mint text-ink shadow-brutal-sm transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
        >
          <Settings className="size-5" strokeWidth={2.75} />
        </button>
      </div>
    </header>
  )
}