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

/**
 * Explicitly register the SW and wait for it to be ready.
 * Times out after `timeout` ms.
 */
async function getOrRegisterSW(timeout = 10000): Promise<ServiceWorkerRegistration> {
  // If already registered, use that
  let reg = await navigator.serviceWorker.getRegistration();
  if (reg && reg.active) {
    console.log('[push] using existing active SW');
    return reg;
  }

  console.log('[push] registering /sw.js explicitly...');
  reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  console.log('[push] registration created, waiting for activation...');

  // Wait for activation with timeout
  return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Try anyway with what we have
      if (reg && reg.active) {
        resolve(reg);
      } else {
        reject(new Error('SW activation timeout'));
      }
    }, timeout);

    // If already active, resolve now
    if (reg.active) {
      clearTimeout(timer);
      resolve(reg);
      return;
    }

    // Otherwise wait for update
    reg.addEventListener('updatefound', () => {
      const installing = reg!.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        console.log('[push] SW state:', installing.state);
        if (installing.state === 'activated') {
          clearTimeout(timer);
          resolve(reg!);
        }
      });
    });

    // Also poll every 500ms as backup
    const poll = setInterval(() => {
      if (reg!.active) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve(reg!);
      }
    }, 500);

    // Cleanup
    setTimeout(() => clearInterval(poll), timeout + 100);
  });
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

    if (!hasSW || !hasPush || !hasNotif) {
      setSupported(false);
      setLoading(false);
      return;
    }

    setPermission(Notification.permission);

    let cancelled = false;

    async function check() {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (!cancelled) setSubscribed(!!sub);
        }
      } catch (err) {
        console.debug('[push] init check failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    check();

    // Safety timeout
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
      console.log('[push] subscribe called');

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        console.log('[push] permission not granted');
        return;
      }

      // Explicitly register/wait for SW
      const reg = await getOrRegisterSW(12000);
      console.log('[push] SW ready');

      const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      console.log('[push] VAPID present:', !!vapidPublic);
      if (!vapidPublic) {
        alert('⚠️ Push not configured.');
        return;
      }

      // Clean any existing subscription
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        console.log('[push] removing old subscription');
        await existing.unsubscribe();
      }

      console.log('[push] creating subscription...');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublic),
      });
      console.log('[push] ✅ subscription created');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('⚠️ Not signed in.');
        return;
      }

      console.log('[push] saving to profiles...');
      const { data, error } = await supabase
        .from('profiles')
        .update({ push_subscription: sub.toJSON() })
        .eq('id', user.id)
        .select();

      if (error) {
        console.error('[push] save error:', error);
        alert('⚠️ Save failed: ' + error.message);
        return;
      }
      if (!data || data.length === 0) {
        console.error('[push] 0 rows updated');
        alert('⚠️ Could not save. Check permissions.');
        return;
      }

      console.log('[push] ✅ saved to Supabase');
      setSubscribed(true);
    } catch (err: any) {
      console.error('[push] ❌ failed:', err);
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