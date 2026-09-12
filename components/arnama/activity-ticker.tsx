const activity = [
  'mika beat your high score in NEON DASH',
  'lena added 6 pics to the photo dump',
  'jonas started a playlist: late night drives',
  'rae dropped a wish on the board',
  'tobi is planning a hangout friday',
]

export function ActivityTicker() {
  return (
    <div className="overflow-hidden rounded-3xl border-4 border-ink bg-card shadow-brutal">
      <div className="flex items-stretch">
        <div className="flex shrink-0 items-center gap-2 border-r-4 border-ink bg-lavender px-4 py-3">
          <span className="size-2.5 animate-blink rounded-full border-2 border-ink bg-pink-deep" />
          <span className="font-display text-[0.6rem] text-ink">LIVE</span>
        </div>
        <div className="group relative flex-1 overflow-hidden py-3">
          <ul className="flex w-max animate-[ticker_28s_linear_infinite] items-center gap-8 pl-8 group-hover:[animation-play-state:paused]">
            {[...activity, ...activity].map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-3 whitespace-nowrap text-sm font-bold text-ink"
              >
                <span className="size-2 shrink-0 rotate-45 border-2 border-ink bg-mint-deep" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
