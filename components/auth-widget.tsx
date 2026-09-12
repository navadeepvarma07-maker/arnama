'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AuthWidget() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (loading) return null;

  if (!email) {
    return (
      <Link
        href="/login"
        className="px-4 py-2 border-4 border-black bg-[#FFD1DC] text-black font-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition"
      >
        🔓 SIGN IN
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="px-3 py-2 border-4 border-black bg-white text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
        👋 {email.split('@')[0]}
      </div>
      <button
        onClick={handleLogout}
        className="px-3 py-2 border-4 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition"
      >
        LOG OUT
      </button>
    </div>
  );
}