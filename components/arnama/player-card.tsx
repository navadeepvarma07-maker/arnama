import { Coins, Star, Zap } from 'lucide-react'

export function PlayerCard() {
  return (
    <div className="rounded-3xl border-4 border-ink bg-card p-5 shadow-brutal">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 animate-float items-center justify-center rounded-2xl border-4 border-ink bg-lavender font-display text-lg text-ink">
          YU
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-[0.7rem] text-ink">
            player_you
          </p>
          <p className="mt-1 text-sm font-bold text-ink/60">
            Portal keeper · lvl 27
          </p>
        </div>
      </div>

      {/* XP bar */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-ink/60">
          <span className="flex items-center gap-1">
            <Zap className="size-3.5" strokeWidth={3} /> XP
          </span>
          <span>720 / 1000</span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-full border-4 border-ink bg-cream">
          <div
            className="h-full rounded-r-full bg-mint-deep"
            style={{ width: '72%' }}
          />
        </div>
      </div>

      {/* stat stickers */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 rounded-2xl border-4 border-ink bg-pink px-3 py-2.5 shadow-brutal-sm">
          <Coins className="size-5 text-ink" strokeWidth={2.75} />
          <div className="leading-none">
            <p className="font-display text-[0.65rem] text-ink">348</p>
            <p className="mt-1 text-[0.7rem] font-bold text-ink/60">coins</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border-4 border-ink bg-mint px-3 py-2.5 shadow-brutal-sm">
          <Star className="size-5 text-ink" strokeWidth={2.75} />
          <div className="leading-none">
            <p className="font-display text-[0.65rem] text-ink">14</p>
            <p className="mt-1 text-[0.7rem] font-bold text-ink/60">streak</p>
          </div>
        </div>
      </div>
    </div>
  )
}
