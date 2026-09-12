'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setMessage('⚠️ ' + error.message);
      else setMessage('✅ Account created! You can now log in.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage('⚠️ ' + error.message);
      else window.location.href = '/';
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#1a0b2e] flex items-center justify-center p-6 font-mono">
      <div className="w-full max-w-md border-4 border-black bg-[#E6E6FA] p-8 rounded-2xl shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
        <h1 className="text-3xl font-black text-black mb-2 text-center">
          {mode === 'login' ? '🔓 enter arnama' : '✨ join arnama'}
        </h1>
        <p className="text-sm text-center mb-6 text-black/70">
          {mode === 'login' ? 'welcome back, friend' : 'new here? create your player'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1 text-black">EMAIL</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 border-4 border-black rounded-lg bg-white text-black focus:outline-none focus:-translate-y-0.5 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1 text-black">PASSWORD</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 border-4 border-black rounded-lg bg-white text-black focus:outline-none focus:-translate-y-0.5 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 border-4 border-black bg-[#E2F0D9] text-black font-black rounded-lg shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition disabled:opacity-50"
          >
            {loading ? '...loading' : mode === 'login' ? '▶ PLAY' : '▶ CREATE'}
          </button>
        </form>

        {message && (
          <div className="mt-4 p-3 border-2 border-black rounded bg-white text-sm font-bold text-black">
            {message}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-black">
          {mode === 'login' ? "don't have an account? " : 'already have one? '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setMessage('');
            }}
            className="font-black underline"
          >
            {mode === 'login' ? 'sign up' : 'log in'}
          </button>
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="text-xs font-bold underline text-black/70">
            ← back to map
          </Link>
        </div>
      </div>
    </div>
  );
}