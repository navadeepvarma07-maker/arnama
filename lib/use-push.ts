'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePush() {
  const [permission, setPermission] =
    useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasSW = 'serviceWorker' in navigator;
    const hasPush = 'PushManager' in window;
    const hasNotif = 'Notification' in window;

    console.log('[push] SW:', hasSW, 'Push:', hasPush, 'Notif:', hasNotif);

    if (!hasSW || !hasPush || !hasNotif) {
      setSupported(false);
      setLoading(false);
      return;
    }

    setPermission(Notification.permission);
    console.log('[push] permission:', Notification.permission);

    let cancelled = false;

    async function checkExisting() {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        console.log('[push] SW reg:', reg ? 'yes' : 'no');
        if (!reg) {
          if (!cancelled) setLoading(false);
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        console.log('[push] existing sub:', sub ? 'yes' : 'no');
        if (!cancelled) {
          setSubscribed(!!sub);
          setLoading(false);
        }
      } catch (err) {
        console.debug('[push] check failed:', err);
        if (!cancelled) setLoading(false);
      }
    }

    checkExisting();

    const timer = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  async function subscribe() {
    if (!supported) return;
    try {
      console.log('[push] subscribe() called');

      const perm = await Notification.requestPermission();
      console.log('[push] permission result:', perm);
      setPermission(perm);
      if (perm !== 'granted') return;

      // Wait for SW with a timeout
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<ServiceWorkerRegistration>((_, reject) =>
          setTimeout(() => reject(new Error('SW timeout')), 8000)
        ),
      ]);
      console.log('[push] SW ready');

      const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      console.log('[push] VAPID present:', !!vapidPublic);
      if (!vapidPublic) {
        alert('⚠️ Push not configured. Please try again later.');
        return;
      }

      // If there's already a subscription, unsubscribe first to get a fresh one
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        console.log('[push] unsubscribing existing subscription first');
        await existing.unsubscribe();
      }

      console.log('[push] subscribing with VAPID...');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublic),
      });
      console.log('[push] subscribed, endpoint:', sub.endpoint.slice(0, 40) + '...');

      const { data: { user } } = await supabase.auth.getUser();
      console.log('[push] user:', user?.email);
      if (!user) {
        alert('⚠️ Not signed in. Please log in again.');
        return;
      }

      const payload = sub.toJSON();
      console.log('[push] saving to profiles...');
      const { data, error } = await supabase
        .from('profiles')
        .update({ push_subscription: payload })
        .eq('id', user.id)
        .select();

      if (error) {
        console.error('[push] ❌ save error:', error);
        alert('⚠️ Save failed: ' + error.message);
        return;
      }
      if (!data || data.length === 0) {
        console.error('[push] ❌ save affected 0 rows (RLS blocked?)');
        alert('⚠️ Could not save. Check profile permissions.');
        return;
      }
      console.log('[push] ✅ saved');

      setSubscribed(true);
    } catch (err: any) {
      console.error('[push] ❌ subscribe failed:', err);
      alert('⚠️ ' + (err?.message || 'Unknown error'));
    }
  }

  async function unsubscribe() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ push_subscription: null })
          .eq('id', user.id);
      }
      setSubscribed(false);
    } catch (err) {
      console.error('unsubscribe failed:', err);
    }
  }

  return { permission, subscribed, supported, loading, subscribe, unsubscribe };
}