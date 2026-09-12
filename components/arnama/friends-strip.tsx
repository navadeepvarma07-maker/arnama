const friends = [
  { initials: 'MI', name: 'mika', color: 'bg-mint', online: true },
  { initials: 'JO', name: 'jonas', color: 'bg-pink', online: true },
  { initials: 'LE', name: 'lena', color: 'bg-lavender', online: true },
  { initials: 'RA', name: 'rae', color: 'bg-mint', online: false },
  { initials: 'TO', name: 'tobi', color: 'bg-pink', online: false },
]

export function FriendsStrip() {
  const onlineCount = friends.filter((f) => f.online).length

  return (
    <div className="rounded-3xl border-4 border-ink bg-card p-5 shadow-brutal">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-[0.7rem] text-ink">THE CREW</h2>
        <span className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-mint px-2.5 py-1 text-xs font-bold text-ink">
          <span className="size-2 rounded-full border border-ink bg-mint-deep" />
          {onlineCount} on
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {friends.map((f) => (
          <li key={f.name} className="flex items-center gap-3">
            <div className="relative">
              <div
                className={`flex size-11 items-center justify-center rounded-xl border-4 border-ink font-display text-[0.6rem] text-ink ${f.color}`}
              >
                {f.initials}
              </div>
              <span
                className={`absolute -bottom-1 -right-1 size-4 rounded-full border-2 border-ink ${
                  f.online ? 'bg-mint-deep' : 'bg-cream'
                }`}
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{f.name}</p>
              <p className="text-xs font-semibold text-ink/50">
                {f.online ? 'in the portal' : 'away'}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
