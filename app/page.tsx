import AuthWidget from '@/components/auth-widget';
import { PortalHeader } from '@/components/arnama/portal-header';
import { PlayerCard } from '@/components/arnama/player-card';
import { FriendsStrip } from '@/components/arnama/friends-strip';
import { ArcadeGrid } from '@/components/arnama/arcade-grid';
import { ActivityTicker } from '@/components/arnama/activity-ticker';
import { StoryProvider } from '@/components/arnama/story-context';

export default function Page() {
  return (
    <StoryProvider>
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-8">
        <PortalHeader />

        <div className="grid flex-1 gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="flex flex-col gap-6">
            <PlayerCard />
            <AuthWidget />
            <FriendsStrip />
          </aside>

          <ArcadeGrid />
        </div>

        <ActivityTicker />

        <footer className="pb-2 text-center text-xs font-bold text-ink/40">
          arnama · members only · be nice to each other
        </footer>
      </main>
    </StoryProvider>
  );
}