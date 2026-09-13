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

    if (!hasSW || !hasPush || !hasNotif) {
      setSupported(false);
      setLoading(false);
      return;
    }

    setPermission(Notification.permission);

    // Don't wait for SW.ready — just check current registration
    let cancelled = false;

    async function checkExisting() {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          // SW not registered yet — that's fine on dev
          if (!cancelled) setLoading(false);
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) {
          setSubscribed(!!sub);
          setLoading(false);
        }
      } catch (err) {
        console.debug('push check failed:', err);
        if (!cancelled) setLoading(false);
      }
    }

    checkExisting();

    // Safety timeout — if nothing resolves in 2s, show the button anyway
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
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      // Wait for SW to be ready (with timeout)
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<ServiceWorkerRegistration>((_, reject) =>
          setTimeout(() => reject(new Error('SW timeout')), 8000)
        ),
      ]);

      const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublic) {
        console.error('VAPID public key missing from env');
        alert(
          '⚠️ Push is not configured yet. Please try again in a moment.'
        );
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublic),
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ push_subscription: sub.toJSON() })
        .eq('id', user.id);

      if (error) {
        console.error('saving subscription failed:', error);
        alert('⚠️ Could not save subscription. Try again.');
        return;
      }

      setSubscribed(true);
    } catch (err: any) {
      console.error('push subscribe failed:', err);
      if (err?.message === 'SW timeout') {
        alert(
          '⚠️ Notifications need a moment to set up. Refresh the page and try again.'
        );
      } else {
        alert('⚠️ Could not enable notifications: ' + (err?.message ?? 'unknown'));
      }
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