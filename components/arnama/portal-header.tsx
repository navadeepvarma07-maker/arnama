import { Bell, Settings } from 'lucide-react'

export function PortalHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex size-12 rotate-3 items-center justify-center rounded-2xl border-4 border-ink bg-pink font-display text-lg text-ink shadow-brutal-sm">
          a
        </div>
        <div>
          <h1 className="font-display text-xl leading-none text-ink sm:text-2xl">
            arnama
          </h1>
          <p className="mt-1.5 text-sm font-bold text-ink/60">
            our little corner of the internet
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
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
