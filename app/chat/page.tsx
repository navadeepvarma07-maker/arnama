'use client';
import { ImagePicker } from '@/components/arnama/image-picker';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useProfile, displayLabel, initialsFor } from '@/lib/use-profile';
import {
  BgPickerButton,
  getBgStyle,
  isDarkBg,
  MessageBg,
} from '@/components/message-bg';
import { CutePet } from '@/components/arnama/cute-pet';
import { SwipeCarousel } from '@/components/arnama/swipe-carousel';
import { HiddenScroll } from '@/components/arnama/hidden-scroll';
import { fireConfetti } from '@/lib/confetti';
import { playDing } from '@/lib/ding';
import { parseStoryShare } from '@/components/arnama/story-context';
import { VoiceRecorder } from '@/components/arnama/voice-recorder';
import { VoiceBubble } from '@/components/arnama/voice-bubble';
import { formatVoiceContent, parseVoiceContent } from '@/lib/voice';
import { Plus, X, Users, Check, Globe } from 'lucide-react';

type Message = {
  id: number;
  user_email: string;
  content: string;
  created_at: string;
  reply_to_id: number | null;
  edited_at: string | null;
};

type GroupMessage = {
  id: number;
  group_id: string;
  user_id: string;
  user_email: string;
  content: string;
  created_at: string;
  reply_to_id: number | null;
  edited_at: string | null;
};

type Group = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  created_by: string;
  created_at: string;
};

type GroupMember = {
  group_id: string;
  user_id: string;
  user_email: string;
};

type CrewProfile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_color: string;
};

type ActiveRoom =
  | { type: 'squad' }
  | { type: 'group'; group: Group }
  | null;

type ContextMenu = {
  message: any;
  isGroup: boolean;
  x: number;
  y: number;
} | null;

const AVATAR_COLORS = ['#E2F0D9', '#FFD1DC', '#E6E6FA', '#FFF5BA', '#D4F0F0'];
const REACTION_EMOJIS = ['❤️', '🔥', '😂', '👍', '😮', '😭'];
const GROUP_COLORS = ['#E6E6FA', '#E2F0D9', '#FFD1DC', '#FFF5BA', '#D4F0F0'];
const GROUP_EMOJIS = ['💬', '🔥', '🎮', '🎵', '📸', '🍿', '✈️', '🏠', '🎉', '⚡'];

type ReactionsMap = Record<string, Record<string, string[]>>;

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function StoryImg({ url }: { url: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="shared story"
      referrerPolicy="no-referrer"
      onClick={() => window.open(url, '_blank')}
      style={{
        marginTop: '8px',
        maxWidth: '220px',
        width: '100%',
        borderRadius: '10px',
        border: '2px solid black',
        cursor: 'pointer',
        display: 'block',
        boxShadow: '2px 2px 0 0 black',
      }}
    />
  );
}

export default function ChatPage() {
  const { profile } = useProfile();
  const timeFormat = profile?.time_format ?? '12h';
  const chatBg: MessageBg = (((profile as any)?.chat_bg) ?? 'plain') as MessageBg;
  const chatBgDark = isDarkBg(chatBg);
  const chatMetaColor = chatBgDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.4)';

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [newBelow, setNewBelow] = useState(0);

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [activeRoom, setActiveRoom] = useState<ActiveRoom>(null);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [groupInput, setGroupInput] = useState('');
  const [groupSending, setGroupSending] = useState(false);
  const [groupNewBelow, setGroupNewBelow] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupEmoji, setNewGroupEmoji] = useState('💬');
  const [newGroupColor, setNewGroupColor] = useState('#E6E6FA');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [replyTo, setReplyTo] = useState<any>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [highlight, setHighlight] = useState<{ id: number; key: number } | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myMessageCountRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const groupBottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const initialLoadDone = useRef(false);

  const [crewProfiles, setCrewProfiles] = useState<CrewProfile[]>([]);
  const [crewOnlineIds, setCrewOnlineIds] = useState<string[]>([]);
  const [crewCounts, setCrewCounts] = useState<Record<string, number>>({});
  const [crewLoading, setCrewLoading] = useState(true);

  const [pulseTotal, setPulseTotal] = useState(0);
  const [pulseToday, setPulseToday] = useState(0);
  const [pulseWeek, setPulseWeek] = useState(0);
  const [pulseTopSender, setPulseTopSender] = useState<{ email: string; count: number } | null>(null);
  const [pulseBusiestHour, setPulseBusiestHour] = useState<number | null>(null);
  const [pulseBusiestDay, setPulseBusiestDay] = useState<string | null>(null);
  const [pulseLoading, setPulseLoading] = useState(true);

  const [reactions, setReactions] = useState<ReactionsMap>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const typingChannelRef = useRef<any>(null);
  const typingLastSentRef = useRef(0);
  // =========================
  // AUTH + heartbeat
  // =========================
  useEffect(() => {
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const e = user?.email ?? null;
      setEmail(e);
      setUserId(user?.id ?? null);
      if (!e) {
        window.location.href = '/login';
      } else {
        setLoading(false);
        supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_email', e)
          .then(({ count }) => {
            myMessageCountRef.current = typeof count === 'number' ? count : 0;
          });

        supabase
          .from('profiles')
          .update({
            last_seen_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
          })
          .eq('id', user!.id)
          .then(() => {});

        heartbeat = setInterval(() => {
          supabase
            .from('profiles')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', user!.id)
            .then(() => {});
        }, 20000);
      }
    });

    return () => {
      if (heartbeat) clearInterval(heartbeat);
    };
  }, []);

  // =========================
  // DEEP LINK — squad
  // =========================
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('squad') === '1') {
      setActiveRoom({ type: 'squad' });
      window.history.replaceState({}, '', '/chat');
    }
  }, []);

  // =========================
  // LOAD groups + memberships
  // =========================
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('chat_group_members')
      .select('group_id')
      .eq('user_id', userId)
      .then(({ data }) => {
        const myGroupIds = (data ?? []).map((r: any) => r.group_id);
        if (myGroupIds.length === 0) {
          setGroups([]);
          setGroupMembers([]);
          return;
        }
        Promise.all([
          supabase
            .from('chat_groups')
            .select('*')
            .in('id', myGroupIds)
            .order('created_at', { ascending: false }),
          supabase.from('chat_group_members').select('*').in('group_id', myGroupIds),
        ]).then(([gRes, mRes]) => {
          setGroups((gRes.data ?? []) as Group[]);
          setGroupMembers((mRes.data ?? []) as GroupMember[]);
        });
      });
  }, [userId]);

  // =========================
  // DEEP LINK — specific group
  // =========================
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (groups.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const gid = params.get('group');
    if (!gid) return;
    const g = groups.find((x) => x.id === gid);
    if (g) {
      setActiveRoom({ type: 'group', group: g });
      window.history.replaceState({}, '', '/chat');
    }
  }, [groups]);

  // =========================
  // SQUAD messages
  // =========================
  useEffect(() => {
    if (!email) return;
    supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data, error }) => {
        if (error) console.error(error);
        else {
          setMessages(data ?? []);
          initialLoadDone.current = true;
        }
      });
  }, [email]);

  // Reactions load
  useEffect(() => {
    if (!email) return;
    supabase
      .from('reactions')
      .select('message_id, user_email, emoji, source')
      .in('source', ['chat', 'group'])
      .then(({ data, error }) => {
        if (error) return;
        const map: ReactionsMap = {};
        (data ?? []).forEach((r: any) => {
          const key = `${r.source}:${r.message_id}`;
          if (!map[key]) map[key] = {};
          if (!map[key][r.emoji]) map[key][r.emoji] = [];
          map[key][r.emoji].push(r.user_email);
        });
        setReactions(map);
      });
  }, [email]);

  // SQUAD realtime
  useEffect(() => {
    if (!email) return;
    const channel = supabase
      .channel('messages-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const incoming = payload.new as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
        if (incoming.user_email !== email && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          playDing();
        }
        if (activeRoom?.type === 'squad') {
          if (isAtBottomRef.current) {
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
          } else if (incoming.user_email !== email) {
            setNewBelow((c) => c + 1);
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const u = payload.new as Message;
        setMessages((prev) => prev.map((m) => (m.id === u.id ? u : m)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const r = payload.old as { id: number };
        setMessages((prev) => prev.filter((m) => m.id !== r.id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email, activeRoom?.type]);

  // Reactions realtime
  useEffect(() => {
    if (!email) return;
    const channel = supabase
      .channel('reactions-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (payload) => {
        const r = payload.new as any;
        if (r.source !== 'chat' && r.source !== 'group') return;
        const key = `${r.source}:${r.message_id}`;
        setReactions((prev) => {
          const next = { ...prev };
          const byEmoji = { ...(next[key] ?? {}) };
          const emails = new Set(byEmoji[r.emoji] ?? []);
          emails.add(r.user_email);
          byEmoji[r.emoji] = Array.from(emails);
          next[key] = byEmoji;
          return next;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, (payload) => {
        const r = payload.old as any;
        if (r.source !== 'chat' && r.source !== 'group') return;
        const key = `${r.source}:${r.message_id}`;
        setReactions((prev) => {
          const next = { ...prev };
          const byEmoji = { ...(next[key] ?? {}) };
          const emails = (byEmoji[r.emoji] ?? []).filter((e) => e !== r.user_email);
          if (emails.length === 0) delete byEmoji[r.emoji];
          else byEmoji[r.emoji] = emails;
          if (Object.keys(byEmoji).length === 0) delete next[key];
          else next[key] = byEmoji;
          return next;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  // Load group messages
  useEffect(() => {
    if (!activeRoom || activeRoom.type !== 'group') {
      setGroupMessages([]);
      return;
    }
    const gid = activeRoom.group.id;
    supabase
      .from('chat_group_messages')
      .select('*')
      .eq('group_id', gid)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setGroupMessages(data ?? []);
      });
  }, [activeRoom]);

  // Group messages realtime
  useEffect(() => {
    if (!email || !activeRoom || activeRoom.type !== 'group') return;
    const gid = activeRoom.group.id;
    const channel = supabase
      .channel(`group-${gid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_group_messages', filter: `group_id=eq.${gid}` },
        (payload) => {
          const incoming = payload.new as GroupMessage;
          setGroupMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          if (incoming.user_email !== email && typeof document !== 'undefined' && document.visibilityState === 'visible') {
            playDing();
          }
          if (isAtBottomRef.current) {
            setTimeout(() => groupBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
          } else if (incoming.user_email !== email) {
            setGroupNewBelow((c) => c + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_group_messages', filter: `group_id=eq.${gid}` },
        (payload) => {
          const u = payload.new as GroupMessage;
          setGroupMessages((prev) => prev.map((m) => (m.id === u.id ? u : m)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_group_messages', filter: `group_id=eq.${gid}` },
        (payload) => {
          const r = payload.old as { id: number };
          setGroupMessages((prev) => prev.filter((m) => m.id !== r.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email, activeRoom]);

  // Scroll to bottom when entering a room
  useEffect(() => {
    if (!activeRoom) return;
    isAtBottomRef.current = true;
    setNewBelow(0);
    setGroupNewBelow(0);

    const t1 = setTimeout(() => {
      if (activeRoom.type === 'squad' && bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      } else if (activeRoom.type === 'group' && groupBottomRef.current) {
        groupBottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    }, 120);

    const t2 = setTimeout(() => {
      if (activeRoom.type === 'squad' && bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      } else if (activeRoom.type === 'group' && groupBottomRef.current) {
        groupBottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    }, 400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [activeRoom, messages.length, groupMessages.length]);
    // =========================
  // TYPING INDICATOR
  // =========================
  useEffect(() => {
    if (!email || !userId) return;
    if (!activeRoom) return;
    const roomKey =
      activeRoom.type === 'group' ? `g-${activeRoom.group.id}` : 'squad';
    const ch = supabase.channel(`typing-${roomKey}`);
    ch.on('broadcast', { event: 'typing' }, (payload: any) => {
      const data = payload?.payload;
      if (!data?.email || data.email === email) return;
      setTypingUsers((prev) => ({ ...prev, [data.email]: Date.now() }));
    }).subscribe();
    typingChannelRef.current = ch;
    setTypingUsers({});
    return () => {
      supabase.removeChannel(ch);
      typingChannelRef.current = null;
    };
  }, [email, userId, activeRoom]);

  // Auto-clear stale typing entries
  useEffect(() => {
    const i = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        let changed = false;
        for (const [k, v] of Object.entries(prev)) {
          if (now - v < 3000) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(i);
  }, []);

  function notifyTyping() {
    if (!email) return;
    const now = Date.now();
    if (now - typingLastSentRef.current < 1200) return;
    typingLastSentRef.current = now;
    try {
      typingChannelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { email },
      });
    } catch {}
  }

  // Crew
  useEffect(() => {
    if (!email) return;
    Promise.all([
      supabase
        .from('profiles')
        .select('id, email, display_name, avatar_color')
        .order('email', { ascending: true }),
      supabase.from('messages').select('user_email'),
    ]).then(([pRes, mRes]) => {
      if (pRes.error) console.error(pRes.error);
      else setCrewProfiles((pRes.data ?? []) as CrewProfile[]);
      if (mRes.error) console.error(mRes.error);
      else {
        const counts: Record<string, number> = {};
        (mRes.data ?? []).forEach((m: any) => {
          counts[m.user_email] = (counts[m.user_email] ?? 0) + 1;
        });
        setCrewCounts(counts);
      }
      setCrewLoading(false);
    });
  }, [email]);

  useEffect(() => {
    if (!userId || !email) return;
    const ch = supabase.channel('chat-crew-presence', {
      config: { presence: { key: userId } },
    });
    ch.on('presence', { event: 'sync' }, () => {
      setCrewOnlineIds(Object.keys(ch.presenceState()));
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ user_id: userId, email });
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, email]);

  // Pulse
  useEffect(() => {
    if (!email) return;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = startOfDay - 6 * 24 * 60 * 60 * 1000;

    Promise.all([
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      supabase
        .from('messages')
        .select('user_email, created_at')
        .gte('created_at', new Date(sevenDaysAgo).toISOString())
        .order('created_at', { ascending: false })
        .limit(2000),
    ]).then(([totalRes, recentRes]) => {
      if (typeof totalRes.count === 'number') setPulseTotal(totalRes.count);
      if (recentRes.error) {
        setPulseLoading(false);
        return;
      }
      const rows = recentRes.data ?? [];
      let today = 0;
      const bySender: Record<string, number> = {};
      const byHour: number[] = new Array(24).fill(0);
      const byDay: Record<string, number> = {};
      rows.forEach((r: any) => {
        const d = new Date(r.created_at);
        if (d.getTime() >= startOfDay) today++;
        bySender[r.user_email] = (bySender[r.user_email] ?? 0) + 1;
        byHour[d.getHours()]++;
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        byDay[dayKey] = (byDay[dayKey] ?? 0) + 1;
      });
      setPulseToday(today);
      setPulseWeek(rows.length);
      const top = Object.entries(bySender).sort((a, b) => b[1] - a[1])[0];
      if (top) setPulseTopSender({ email: top[0], count: top[1] });
      if (rows.length > 0) {
        const busiest = byHour.indexOf(Math.max(...byHour));
        setPulseBusiestHour(busiest);
        const busiestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
        if (busiestDay) setPulseBusiestDay(busiestDay[0]);
      }
      setPulseLoading(false);
    });
  }, [email]);

  // Scroll helpers
  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    isAtBottomRef.current = atBottom;
    if (atBottom) setNewBelow(0);
  }
  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewBelow(0);
  }
  function scrollToGroupBottom() {
    groupBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setGroupNewBelow(0);
  }
  function jumpToMessage(id: number, isGroup: boolean) {
    const el = document.getElementById(`${isGroup ? 'g' : ''}msg-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight({ id, key: Date.now() });
    setTimeout(() => setHighlight((prev) => (prev && prev.id === id ? null : prev)), 1600);
  }

  // Send squad
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !email) return;
    setSending(true);
    setInput('');

    const tempId = -Date.now();
    const optimistic: Message = {
      id: tempId,
      user_email: email,
      content: text,
      created_at: new Date().toISOString(),
      reply_to_id: replyTo?.id ?? null,
      edited_at: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    isAtBottomRef.current = true;
    setReplyTo(null);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);

    const { data, error } = await supabase
      .from('messages')
      .insert({ user_email: email, content: text, reply_to_id: optimistic.reply_to_id })
      .select()
      .single();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(text);
      alert('⚠️ ' + error.message);
    } else if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as Message) : m)));
      if (myMessageCountRef.current === 0) {
        myMessageCountRef.current = 1;
        fireConfetti({ count: 90 });
      } else if (myMessageCountRef.current !== null) {
        myMessageCountRef.current += 1;
      }
    }
    setSending(false);
  }

  // Send group
  async function handleSendGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!activeRoom || activeRoom.type !== 'group') return;
    const text = groupInput.trim();
    if (!text || !email || !userId) return;

    setGroupSending(true);
    setGroupInput('');

    const gid = activeRoom.group.id;
    const tempId = -Date.now();
    const optimistic: GroupMessage = {
      id: tempId,
      group_id: gid,
      user_id: userId,
      user_email: email,
      content: text,
      created_at: new Date().toISOString(),
      reply_to_id: replyTo?.id ?? null,
      edited_at: null,
    };
    setGroupMessages((prev) => [...prev, optimistic]);
    isAtBottomRef.current = true;
    setReplyTo(null);
    setTimeout(() => groupBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);

    const { data, error } = await supabase
      .from('chat_group_messages')
      .insert({
        group_id: gid,
        user_id: userId,
        user_email: email,
        content: text,
        reply_to_id: optimistic.reply_to_id,
      })
      .select()
      .single();

    if (error) {
      setGroupMessages((prev) => prev.filter((m) => m.id !== tempId));
      setGroupInput(text);
      alert('⚠️ ' + error.message);
    } else if (data) {
      setGroupMessages((prev) => prev.map((m) => (m.id === tempId ? (data as GroupMessage) : m)));
    }
    setGroupSending(false);
  }

  // Send voice — squad
  async function sendVoiceSquad(voiceUrl: string, duration: number) {
    if (!userId || !email) return;
    const content = formatVoiceContent(voiceUrl, duration);
    const tempId = -Date.now();
    const optimistic: Message = {
      id: tempId,
      user_email: email,
      content,
      created_at: new Date().toISOString(),
      reply_to_id: replyTo?.id ?? null,
      edited_at: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    isAtBottomRef.current = true;
    setReplyTo(null);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);

    const { data, error } = await supabase
      .from('messages')
      .insert({ user_email: email, content, reply_to_id: optimistic.reply_to_id })
      .select()
      .single();
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert('⚠️ ' + error.message);
    } else if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as Message) : m)));
    }
  }

  // Send voice — group
  async function sendVoiceGroup(voiceUrl: string, duration: number) {
    if (!userId || !email) return;
    if (!activeRoom || activeRoom.type !== 'group') return;
    const gid = activeRoom.group.id;
    const content = formatVoiceContent(voiceUrl, duration);
    const tempId = -Date.now();
    const optimistic: GroupMessage = {
      id: tempId,
      group_id: gid,
      user_id: userId,
      user_email: email,
      content,
      created_at: new Date().toISOString(),
      reply_to_id: replyTo?.id ?? null,
      edited_at: null,
    };
    setGroupMessages((prev) => [...prev, optimistic]);
    isAtBottomRef.current = true;
    setReplyTo(null);
    setTimeout(() => groupBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);

    const { data, error } = await supabase
      .from('chat_group_messages')
      .insert({
        group_id: gid,
        user_id: userId,
        user_email: email,
        content,
        reply_to_id: optimistic.reply_to_id,
      })
      .select()
      .single();
    if (error) {
      setGroupMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert('⚠️ ' + error.message);
    } else if (data) {
      setGroupMessages((prev) => prev.map((m) => (m.id === tempId ? (data as GroupMessage) : m)));
    }
  }

  // Edit / delete
  async function saveEdit(messageId: number, isGroup: boolean) {
    const text = editText.trim();
    if (!text) {
      setEditingId(null);
      setEditText('');
      return;
    }
    const table = isGroup ? 'chat_group_messages' : 'messages';
    const patch = { content: text, edited_at: new Date().toISOString() };
    if (isGroup) {
      setGroupMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...patch } : m)));
    } else {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...patch } : m)));
    }
    setEditingId(null);
    setEditText('');
    const { error } = await supabase.from(table).update(patch).eq('id', messageId);
    if (error) alert('⚠️ ' + error.message);
  }

  async function deleteMessage(messageId: number, isGroup: boolean) {
    if (!confirm('Delete this message?')) return;
    const table = isGroup ? 'chat_group_messages' : 'messages';
    if (isGroup) {
      const backup = groupMessages;
      setGroupMessages((prev) => prev.filter((m) => m.id !== messageId));
      const { data, error } = await supabase
        .from(table)
        .delete()
        .eq('id', messageId)
        .select();
      if (error || !data || data.length === 0) {
        setGroupMessages(backup);
        alert('⚠️ Delete blocked — check RLS policies');
      }
    } else {
      const backup = messages;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      const { data, error } = await supabase
        .from(table)
        .delete()
        .eq('id', messageId)
        .select();
      if (error || !data || data.length === 0) {
        setMessages(backup);
        alert('⚠️ Delete blocked — check RLS policies');
      }
    }
  }

  // Reactions
  function hasMyReaction(source: 'chat' | 'group', messageId: number, emoji: string): boolean {
    if (!email) return false;
    const key = `${source}:${messageId}`;
    return (reactions[key]?.[emoji] ?? []).includes(email);
  }

  async function toggleReaction(source: 'chat' | 'group', messageId: number, emoji: string) {
    if (!email) return;
    const key = `${source}:${messageId}`;
    const mine = hasMyReaction(source, messageId, emoji);
    setReactions((prev) => {
      const next = { ...prev };
      const byEmoji = { ...(next[key] ?? {}) };
      const emails = new Set(byEmoji[emoji] ?? []);
      if (mine) emails.delete(email);
      else emails.add(email);
      if (emails.size === 0) delete byEmoji[emoji];
      else byEmoji[emoji] = Array.from(emails);
      if (Object.keys(byEmoji).length === 0) delete next[key];
      else next[key] = byEmoji;
      return next;
    });
    if (mine) {
      await supabase
        .from('reactions')
        .delete()
        .eq('source', source)
        .eq('message_id', String(messageId))
        .eq('user_email', email)
        .eq('emoji', emoji);
    } else {
      await supabase.from('reactions').insert({
        source,
        message_id: String(messageId),
        user_email: email,
        emoji,
      });
    }
  }

  // Create / leave group
  async function handleCreateGroup() {
    if (!userId || !email) return;
    const name = newGroupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    const { data: gData, error: gErr } = await supabase
      .from('chat_groups')
      .insert({ name, emoji: newGroupEmoji, color: newGroupColor, created_by: userId })
      .select()
      .single();

    if (gErr || !gData) {
      alert('⚠️ ' + (gErr?.message ?? 'failed'));
      setCreatingGroup(false);
      return;
    }

    const members = [
      { group_id: gData.id, user_id: userId, user_email: email },
      ...Array.from(newGroupMemberIds)
        .map((id) => {
          const p = crewProfiles.find((c) => c.id === id);
          if (!p) return null;
          return { group_id: gData.id, user_id: p.id, user_email: p.email };
        })
        .filter(Boolean),
    ] as { group_id: string; user_id: string; user_email: string }[];

    await supabase.from('chat_group_members').insert(members);

    const { data: allMine } = await supabase
      .from('chat_group_members')
      .select('group_id')
      .eq('user_id', userId);
    const ids = (allMine ?? []).map((r: any) => r.group_id);
    const { data: gs } = await supabase
      .from('chat_groups')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: false });
    setGroups((gs ?? []) as Group[]);
    const { data: ms } = await supabase
      .from('chat_group_members')
      .select('*')
      .in('group_id', ids);
    setGroupMembers((ms ?? []) as GroupMember[]);

    setCreateOpen(false);
    setNewGroupName('');
    setNewGroupEmoji('💬');
    setNewGroupColor('#E6E6FA');
    setNewGroupMemberIds(new Set());
    setCreatingGroup(false);
  }

  async function leaveGroup(g: Group) {
    if (!userId) return;
    if (!confirm(`Leave "${g.name}"?`)) return;
    await supabase.from('chat_group_members').delete().eq('group_id', g.id).eq('user_id', userId);
    setGroups((prev) => prev.filter((x) => x.id !== g.id));
    setGroupMembers((prev) => prev.filter((m) => m.group_id !== g.id));
    if (activeRoom?.type === 'group' && activeRoom.group.id === g.id) {
      setActiveRoom(null);
    }
  }

  // Context menu
  function openContextMenu(message: any, isGroup: boolean, x: number, y: number) {
    const menuWidth = 240, menuHeight = 260;
    const safeX = Math.min(x, window.innerWidth - menuWidth - 8);
    const safeY = Math.min(y, window.innerHeight - menuHeight - 8);
    setContextMenu({ message, isGroup, x: Math.max(8, safeX), y: Math.max(8, safeY) });
  }
  function handleRightClick(e: React.MouseEvent, message: any, isGroup: boolean) {
    e.preventDefault();
    openContextMenu(message, isGroup, e.clientX, e.clientY);
  }
  function handleTouchStart(e: React.TouchEvent, message: any, isGroup: boolean) {
    const t = e.touches[0];
    longPressTimer.current = setTimeout(
      () => openContextMenu(message, isGroup, t.clientX, t.clientY),
      500
    );
  }
  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function closeContextMenu() {
    setContextMenu(null);
  }

  useEffect(() => {
    if (!contextMenu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeContextMenu();
    }
    function onClick() {
      closeContextMenu();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    window.addEventListener('scroll', onClick, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onClick, true);
    };
  }, [contextMenu]);

  function previewOf(text: string, max = 60): string {
    const t = text.trim();
    return t.length > max ? t.slice(0, max) + '…' : t;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  // ============================================================
  // FULL-SCREEN ROOM MODE
  // ============================================================
  if (activeRoom !== null) {
    const isGroup = activeRoom.type === 'group';
    const list: any[] = isGroup ? groupMessages : messages;
    const isSending = isGroup ? groupSending : sending;
    const inputVal = isGroup ? groupInput : input;
    const setInputVal = isGroup ? setGroupInput : setInput;
    const newBelowVal = isGroup ? groupNewBelow : newBelow;
    const bottomRefLocal = isGroup ? groupBottomRef : bottomRef;
    const scrollFn = isGroup ? scrollToGroupBottom : scrollToBottom;
    const sendFn = isGroup ? handleSendGroup : handleSend;
    const roomName = isGroup ? activeRoom.group.name : 'squad chat';
    const roomEmoji = isGroup ? activeRoom.group.emoji : '🌐';
    const roomBg = isGroup ? activeRoom.group.color : '#E2F0D9';
    const memberCount = isGroup
      ? groupMembers.filter((m) => m.group_id === activeRoom.group.id).length
      : crewProfiles.length;

    return (
      <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex flex-col overflow-hidden">
        <div
          className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col gap-2"
          style={{
            paddingTop: 'max(8px, env(safe-area-inset-top))',
            paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
            paddingLeft: 'max(8px, env(safe-area-inset-left))',
            paddingRight: 'max(8px, env(safe-area-inset-right))',
          }}
        >
          {/* Room header */}
          <div
            className="border-4 border-black shrink-0"
            style={{
              borderRadius: '18px',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                ${roomBg}
              `,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '4px 4px 0 0 black',
            }}
          >
            <button
              onClick={() => setActiveRoom(null)}
              aria-label="Back to rooms"
              style={{
                width: '36px',
                height: '36px',
                border: '2px solid black',
                borderRadius: '999px',
                background: '#FFD1DC',
                color: '#000',
                fontWeight: 900,
                fontSize: '15px',
                lineHeight: 1,
                boxShadow: '2px 2px 0 0 black',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              ‹
            </button>
            <span
              className="gloss-shine"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '999px',
                border: '3px solid black',
                background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {roomEmoji}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  margin: 0,
                  fontWeight: 900,
                  fontSize: '14px',
                  color: '#000',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {roomName}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '10px',
                  fontWeight: 800,
                  color: 'rgba(0,0,0,0.5)',
                }}
              >
                {isGroup
                  ? `${memberCount} member${memberCount === 1 ? '' : 's'}`
                  : `everyone · ${list.length} message${list.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <BgPickerButton
              current={chatBg}
              onChange={async (bg) => {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                await supabase.from('profiles').update({ chat_bg: bg }).eq('id', user.id);
              }}
            />
            {isGroup && (
              <button
                onClick={() => leaveGroup(activeRoom.group)}
                style={{
                  padding: '6px 10px',
                  fontSize: '10px',
                  fontWeight: 900,
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: '#FFD1DC',
                  color: '#C2185B',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                leave
              </button>
            )}
          </div>

          {/* Messages window */}
          <div
            className="flex-1 min-h-0 flex flex-col border-4 border-black bg-white rounded-2xl overflow-hidden relative"
            style={{ boxShadow: '5px 5px 0px 0px rgba(0,0,0,1)' }}
          >
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <HiddenScroll
                topPadding={14}
                sidePadding={14}
                bottomPadding={8}
                onScroll={handleScroll}
                style={getBgStyle(chatBg)}
              >
                {list.length === 0 ? (
                  <p className="text-black/50 text-center italic py-8 text-sm">
                    no messages yet — say hi 👋
                  </p>
                ) : (
                  <div className="flex flex-col" style={{ gap: '4px' }}>
                    {list.map((m: any, i: number) => {
                      const mine = m.user_email === email;
                      const sender = m.user_email.split('@')[0];
                      const prev = list[i - 1];
                      const isNewGroupMsg = !prev || prev.user_email !== m.user_email;
                      const time = new Date(m.created_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: timeFormat !== '24h',
                      });
                      const isEditing = editingId === m.id;
                      const repliedTo = list.find((x: any) => x.id === m.reply_to_id) ?? null;
                      const isHighlighted = highlight?.id === m.id;
                      const source: 'chat' | 'group' = isGroup ? 'group' : 'chat';
                      const key = `${source}:${m.id}`;
                      const msgReactions = reactions[key] ?? {};
                      const reactionEntries = Object.entries(msgReactions)
                        .filter(([, emails]) => emails.length > 0)
                        .sort((a, b) => b[1].length - a[1].length);

                      const parsed = parseStoryShare(m.content);
                      const voice = parseVoiceContent(m.content);

                      return (
                        <div
                          key={m.id}
                          id={`${isGroup ? 'g' : ''}msg-${m.id}`}
                          className={`flex ${mine ? 'msg-mine' : 'msg-theirs'}`}
                          style={{
                            justifyContent: mine ? 'flex-end' : 'flex-start',
                            width: '100%',
                            marginTop: isNewGroupMsg && i > 0 ? '12px' : '0',
                            scrollMarginTop: '60px',
                          }}
                        >
                          <div
                            className="flex flex-col"
                            style={{
                              maxWidth: '82%',
                              alignItems: mine ? 'flex-end' : 'flex-start',
                            }}
                          >
                            {isNewGroupMsg && (
                              <div
                                className="msg-meta text-[10px] font-black uppercase tracking-wider"
                                style={{
                                  color: chatMetaColor,
                                  marginBottom: '5px',
                                  paddingLeft: '4px',
                                  paddingRight: '4px',
                                  textShadow: chatBgDark ? '0 1px 2px rgba(0,0,0,0.8)' : 'none',
                                }}
                              >
                                {mine ? 'you' : sender} · {time}
                              </div>
                            )}
                            <div
                              onContextMenu={(e) => handleRightClick(e, m, isGroup)}
                              onTouchStart={(e) => handleTouchStart(e, m, isGroup)}
                              onTouchEnd={handleTouchEnd}
                              onTouchMove={handleTouchEnd}
                              className="inline-block border-2 border-black rounded-2xl cursor-pointer select-none"
                              style={{
                                padding: '8px 12px',
                                backgroundColor: mine ? '#E2F0D9' : '#FFD1DC',
                                boxShadow: '2px 2px 0px 0px rgba(0,0,0,1)',
                                minWidth: '70px',
                                position: 'relative',
                              }}
                            >
                              {isHighlighted && (
                                <div
                                  key={highlight?.key}
                                  aria-hidden
                                  style={{
                                    position: 'absolute',
                                    inset: -8,
                                    border: '4px solid #FF8BA7',
                                    borderRadius: 24,
                                    background: 'rgba(255,245,186,0.55)',
                                    pointerEvents: 'none',
                                    boxShadow: '0 0 20px rgba(255,139,167,0.7)',
                                    animation: 'msg-flash-fade 1.6s ease-out forwards',
                                    zIndex: 10,
                                  }}
                                />
                              )}
                              {repliedTo && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    jumpToMessage(repliedTo.id, isGroup);
                                  }}
                                  className="rounded-lg text-left w-full"
                                  style={{
                                    backgroundColor: 'rgba(0,0,0,0.08)',
                                    padding: '3px 8px',
                                    marginBottom: '5px',
                                    cursor: 'pointer',
                                    display: 'block',
                                    maxWidth: '100%',
                                    border: 'none',
                                    borderLeft: '4px solid black',
                                  }}
                                >
                                  <p
                                    style={{
                                      fontSize: '8px',
                                      fontWeight: 900,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.06em',
                                      color: 'rgba(0,0,0,0.5)',
                                      margin: 0,
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    {repliedTo.user_email === email
                                      ? 'you'
                                      : repliedTo.user_email.split('@')[0]}
                                  </p>
                                  <p
                                    style={{
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      color: 'rgba(0,0,0,0.65)',
                                      margin: '1px 0 0',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    {previewOf(repliedTo.content, 25)}
                                  </p>
                                </button>
                              )}
                              {isEditing ? (
                                <div className="flex flex-col" style={{ gap: '6px', minWidth: '180px' }}>
                                  <textarea
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    autoFocus
                                    rows={2}
                                    style={{
                                      border: '2px solid black',
                                      borderRadius: '8px',
                                      padding: '6px 10px',
                                      fontSize: '13.5px',
                                      fontFamily: 'inherit',
                                      resize: 'none',
                                      outline: 'none',
                                      backgroundColor: 'white',
                                      color: '#000',
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        saveEdit(m.id, isGroup);
                                      }
                                      if (e.key === 'Escape') {
                                        setEditingId(null);
                                        setEditText('');
                                      }
                                    }}
                                  />
                                  <div className="flex" style={{ gap: '6px' }}>
                                    <button
                                      onClick={() => saveEdit(m.id, isGroup)}
                                      className="border-2 border-black rounded-lg font-black"
                                      style={{
                                        padding: '4px 12px',
                                        fontSize: '11px',
                                        backgroundColor: '#E2F0D9',
                                        color: '#000',
                                      }}
                                    >
                                      save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingId(null);
                                        setEditText('');
                                      }}
                                      className="border-2 border-black rounded-lg font-black"
                                      style={{
                                        padding: '4px 12px',
                                        fontSize: '11px',
                                        backgroundColor: '#FFD1DC',
                                        color: '#000',
                                      }}
                                    >
                                      cancel
                                    </button>
                                  </div>
                                </div>
                              ) : voice ? (
                                <VoiceBubble url={voice.url} duration={voice.duration} mine={mine} />
                              ) : (
                                <div>
                                  <p
                                    className="text-black m-0"
                                    style={{
                                      fontSize: '13.5px',
                                      lineHeight: 1.4,
                                      wordBreak: 'break-word',
                                      whiteSpace: 'pre-wrap',
                                    }}
                                  >
                                    {parsed.text}
                                    {m.edited_at && (
                                      <span
                                        style={{
                                          fontSize: '9px',
                                          color: 'rgba(0,0,0,0.4)',
                                          marginLeft: '6px',
                                          fontWeight: 700,
                                        }}
                                      >
                                        (edited)
                                      </span>
                                    )}
                                  </p>
                                  {parsed.imageUrl && <StoryImg url={parsed.imageUrl} />}
                                </div>
                              )}
                            </div>
                            {reactionEntries.length > 0 && (
                              <div
                                className="flex flex-wrap"
                                style={{
                                  gap: '4px',
                                  marginTop: '4px',
                                  justifyContent: mine ? 'flex-end' : 'flex-start',
                                }}
                              >
                                {reactionEntries.map(([emoji, emails]) => {
                                  const isMine = !!email && emails.includes(email);
                                  return (
                                    <button
                                      key={emoji}
                                      onClick={() => toggleReaction(source, m.id, emoji)}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        padding: '2px 8px',
                                        border: '2px solid black',
                                        borderRadius: '999px',
                                        background: isMine
                                          ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                                          : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                                        cursor: 'pointer',
                                        boxShadow: '2px 2px 0 0 black',
                                        fontSize: '11px',
                                        fontWeight: 900,
                                        color: '#000',
                                        lineHeight: 1.2,
                                      }}
                                    >
                                      <span style={{ fontSize: '12px', lineHeight: 1 }}>{emoji}</span>
                                      <span style={{ fontSize: '10px' }}>{emails.length}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div ref={bottomRefLocal} style={{ height: '4px' }} />
              </HiddenScroll>
            </div>

            {newBelowVal > 0 && (
              <button
                onClick={scrollFn}
                className="absolute border-2 border-black bg-[#FF8BA7] text-black font-black rounded-full transition hover:-translate-y-0.5 active:translate-y-0.5"
                style={{
                  bottom: replyTo ? '150px' : '68px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '6px 14px',
                  fontSize: '11px',
                  boxShadow: '3px 3px 0 0 black',
                  zIndex: 5,
                }}
              >
                ↓ {newBelowVal} new
              </button>
            )}
                      {(() => {
              const list = Object.keys(typingUsers);
              if (list.length === 0) return null;
              const names = list.map((e) => e.split('@')[0]);
              const label = names.length === 1
                ? `${names[0]} is typing`
                : names.length === 2
                ? `${names[0]} and ${names[1]} are typing`
                : `${names.length} people are typing`;
              return (
                <div
                  style={{
                    borderTop: '4px solid black',
                    backgroundColor: '#FFFDF5',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      border: '2px solid black',
                      borderRadius: '999px',
                      backgroundColor: '#FFF5BA',
                      padding: '4px 12px',
                      fontSize: '11px',
                      fontWeight: 900,
                      color: '#000',
                      boxShadow: '2px 2px 0 0 black',
                    }}
                  >
                    <span>{label}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  </span>
                </div>
              );
            })()}

            {replyTo && (
              <div
                className="border-t-4 border-black flex items-center"
                style={{
                  backgroundColor: '#FFF5BA',
                  padding: '8px 10px',
                  gap: '8px',
                  flexShrink: 0,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p
                    style={{
                      margin: 0,
                      fontSize: '10px',
                      fontWeight: 900,
                      color: '#000',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    replying to{' '}
                    {replyTo.user_email === email ? 'yourself' : replyTo.user_email.split('@')[0]}
                  </p>
                  <p
                    style={{
                      margin: '3px 0 0',
                      fontSize: '11px',
                      color: 'rgba(0,0,0,0.6)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {previewOf(replyTo.content, 50)}
                  </p>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  className="border-2 border-black bg-[#FFD1DC] text-black font-black rounded-lg shrink-0"
                  style={{ width: '26px', height: '26px', lineHeight: 1, fontSize: '12px' }}
                >
                  ✕
                </button>
              </div>
            )}

<form
              onSubmit={sendFn}
              className="border-t-4 border-black bg-[#E6E6FA] flex shrink-0 items-stretch"
              style={{ padding: '10px', gap: '8px' }}
            >
              {userId && (
                <ImagePicker
                  userId={userId}
                  disabled={isSending}
                  onSend={async (url) => {
                    const content = url;
                    if (isGroup) {
                      if (!activeRoom || activeRoom.type !== 'group') return;
                      const gid = activeRoom.group.id;
                      const tempId = -Date.now();
                      const optimistic: GroupMessage = {
                        id: tempId,
                        group_id: gid,
                        user_id: userId,
                        user_email: email!,
                        content,
                        created_at: new Date().toISOString(),
                        reply_to_id: replyTo?.id ?? null,
                        edited_at: null,
                      };
                      setGroupMessages((prev) => [...prev, optimistic]);
                      isAtBottomRef.current = true;
                      setReplyTo(null);
                      setTimeout(() => groupBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
                      const { data, error } = await supabase
                        .from('chat_group_messages')
                        .insert({
                          group_id: gid,
                          user_id: userId,
                          user_email: email!,
                          content,
                          reply_to_id: optimistic.reply_to_id,
                        })
                        .select()
                        .single();
                      if (error) {
                        setGroupMessages((prev) => prev.filter((x) => x.id !== tempId));
                        alert('⚠️ ' + error.message);
                      } else if (data) {
                        setGroupMessages((prev) => prev.map((x) => (x.id === tempId ? (data as GroupMessage) : x)));
                      }
                    } else {
                      const tempId = -Date.now();
                      const optimistic: Message = {
                        id: tempId,
                        user_email: email!,
                        content,
                        created_at: new Date().toISOString(),
                        reply_to_id: replyTo?.id ?? null,
                        edited_at: null,
                      };
                      setMessages((prev) => [...prev, optimistic]);
                      isAtBottomRef.current = true;
                      setReplyTo(null);
                      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
                      const { data, error } = await supabase
                        .from('messages')
                        .insert({
                          user_email: email!,
                          content,
                          reply_to_id: optimistic.reply_to_id,
                        })
                        .select()
                        .single();
                      if (error) {
                        setMessages((prev) => prev.filter((x) => x.id !== tempId));
                        alert('⚠️ ' + error.message);
                      } else if (data) {
                        setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Message) : x)));
                      }
                    }
                  }}
                />
              )}

<div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <CutePet
                  size={20}
                  variant="peek"
                  style={{
                    position: 'absolute',
                    top: '-16px',
                    right: '10px',
                    zIndex: 2,
                  }}
                />
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => {
                    setInputVal(e.target.value);
                    notifyTyping();
                  }}
                  placeholder="type a message..."
                  disabled={isSending}
                  className="w-full border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50"
                  style={{ padding: '10px 12px' }}
                />
              </div>

              {inputVal.trim() ? (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                <CutePet
                  size={16}
                  variant="wiggle"
                  style={{
                    position: 'absolute',
                    top: '-14px',
                    left: '50%',
                    marginLeft: '-8px',
                    zIndex: 2,
                  }}
                />
                <button
                  type="submit"
                  disabled={isSending}
                  className="inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50"
                  style={{ padding: '10px 14px', minWidth: '52px' }}
                >
                  <span className="text-sm leading-none">{isSending ? '···' : '▶'}</span>
                </button>
              </div>
              ) : userId ? (
                <VoiceRecorder
                  userId={userId}
                  disabled={isSending}
                  onSend={isGroup ? sendVoiceGroup : sendVoiceSquad}
                />
              ) : null}
            </form>
          </div>
        </div>

        {contextMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 500,
              backgroundColor: '#FFFDF5',
              border: '3px solid black',
              borderRadius: '18px',
              boxShadow: '5px 5px 0 0 black',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              minWidth: '220px',
              maxWidth: 'calc(100vw - 16px)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '2px',
                padding: '4px 4px 8px',
                borderBottom: '3px dashed rgba(0,0,0,0.18)',
                marginBottom: '2px',
              }}
            >
              {REACTION_EMOJIS.map((emoji) => {
                const source: 'chat' | 'group' = contextMenu.isGroup ? 'group' : 'chat';
                const active = hasMyReaction(source, contextMenu.message.id, emoji);
                return (
                  <button
                    key={emoji}
                    onClick={() => {
                      toggleReaction(source, contextMenu.message.id, emoji);
                      closeContextMenu();
                    }}
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '999px',
                      border: active ? '2px solid black' : '2px solid transparent',
                      background: active
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                        : 'transparent',
                      cursor: 'pointer',
                      fontSize: '18px',
                      lineHeight: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      boxShadow: active ? '2px 2px 0 0 black' : 'none',
                    }}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                setReplyTo(contextMenu.message);
                closeContextMenu();
              }}
              className="text-left font-black rounded-lg hover:bg-[#E2F0D9] transition"
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                color: '#000',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              ↩️ reply
            </button>
            {contextMenu.message.user_email === email &&
              !parseVoiceContent(contextMenu.message.content) && (
                <button
                  onClick={() => {
                    setEditingId(contextMenu.message.id);
                    setEditText(contextMenu.message.content);
                    closeContextMenu();
                  }}
                  className="text-left font-black rounded-lg hover:bg-[#E2F0D9] transition"
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: '#000',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  ✎ edit
                </button>
              )}
            {contextMenu.message.user_email === email && (
              <button
                onClick={() => {
                  const id = contextMenu.message.id;
                  const isG = contextMenu.isGroup;
                  closeContextMenu();
                  deleteMessage(id, isG);
                }}
                className="text-left font-black rounded-lg hover:bg-[#FFD1DC] transition"
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  color: '#C2185B',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                ✕ delete
              </button>
            )}
            <button
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.message.content).catch(() => {});
                closeContextMenu();
              }}
              className="text-left font-black rounded-lg hover:bg-[#E6E6FA] transition"
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                color: '#000',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              📋 copy
            </button>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // TABBED MODE
  // ============================================================

  const roomsSlide = (
    <div style={{ height: '100%', position: 'relative' }}>
      <HiddenScroll sidePadding={14} topPadding={4} bottomPadding={20}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '11px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'rgba(255,253,245,0.55)',
              paddingLeft: '4px',
            }}
          >
            💬 your rooms
          </p>

          <button
            onClick={() => setActiveRoom({ type: 'squad' })}
            className="hover:-translate-y-0.5 active:translate-y-0.5 transition"
            style={{
              borderRadius: '22px',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                linear-gradient(135deg, #E2F0D9 0%, #D4F0F0 100%)
              `,
              border: '4px solid black',
              boxShadow: `6px 6px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.75)`,
              padding: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <span
              className="gloss-shine"
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '999px',
                border: '4px solid black',
                background: `linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 55%), #FFFDF5`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '30px',
                lineHeight: 1,
                boxShadow: '4px 4px 0 0 black',
                flexShrink: 0,
              }}
            >
              🌐
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  margin: 0,
                  fontWeight: 900,
                  fontSize: '18px',
                  color: '#000',
                  letterSpacing: '-0.01em',
                }}
              >
                squad chat
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: 'rgba(0,0,0,0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Globe className="size-3" strokeWidth={3} />
                everyone · {messages.length} message{messages.length === 1 ? '' : 's'}
              </p>
              <div style={{ display: 'flex', marginTop: '8px', gap: '-6px' }}>
                {crewProfiles.slice(0, 4).map((c, i) => (
                  <span
                    key={c.id}
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '999px',
                      border: '2px solid black',
                      background: c.avatar_color || AVATAR_COLORS[i % AVATAR_COLORS.length],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '8px',
                      fontWeight: 900,
                      color: '#000',
                      marginLeft: i === 0 ? '0' : '-6px',
                    }}
                  >
                    {initialsFor(c.email, c.display_name)}
                  </span>
                ))}
                {crewProfiles.length > 4 && (
                  <span
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '999px',
                      border: '2px solid black',
                      background: '#FFFDF5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      fontWeight: 900,
                      color: '#000',
                      marginLeft: '-6px',
                    }}
                  >
                    +{crewProfiles.length - 4}
                  </span>
                )}
              </div>
            </div>
            <span style={{ fontSize: '22px', color: '#000', flexShrink: 0 }}>›</span>
          </button>

          <button
            onClick={() => setCreateOpen(true)}
            className="hover:-translate-y-0.5 active:translate-y-0.5 transition"
            style={{
              borderRadius: '22px',
              background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #FFF5BA`,
              border: '4px solid black',
              boxShadow: `4px 4px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.7)`,
              padding: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              justifyContent: 'center',
            }}
          >
            <Plus className="size-5" strokeWidth={3} />
            <span style={{ fontSize: '14px', fontWeight: 900, color: '#000' }}>
              new group
            </span>
          </button>

          {groups.length > 0 && (
            <>
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: '11px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'rgba(255,253,245,0.55)',
                  paddingLeft: '4px',
                }}
              >
                👥 your groups · {groups.length}
              </p>
              {groups.map((g) => {
                const mems = groupMembers.filter((m) => m.group_id === g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => setActiveRoom({ type: 'group', group: g })}
                    className="hover:-translate-y-0.5 active:translate-y-0.5 transition"
                    style={{
                      borderRadius: '22px',
                      background: `
                        linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                        ${g.color}
                      `,
                      border: '4px solid black',
                      boxShadow: `5px 5px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.7)`,
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span
                      className="gloss-shine"
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '999px',
                        border: '4px solid black',
                        background: `linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 55%), #FFFDF5`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '26px',
                        boxShadow: '3px 3px 0 0 black',
                        flexShrink: 0,
                      }}
                    >
                      {g.emoji}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 900,
                          fontSize: '15px',
                          color: '#000',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {g.name}
                      </p>
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: '10px',
                          fontWeight: 800,
                          color: 'rgba(0,0,0,0.55)',
                        }}
                      >
                        {mems.length} member{mems.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span style={{ fontSize: '20px', color: '#000', flexShrink: 0 }}>›</span>
                  </button>
                );
              })}
            </>
          )}

          {groups.length === 0 && (
            <p
              style={{
                margin: '20px 0 0',
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 700,
                color: 'rgba(255,253,245,0.4)',
                fontStyle: 'italic',
              }}
            >
              tap "new group" to create your first one
            </p>
          )}
        </div>
      </HiddenScroll>
    </div>
  );

  const crewSlide = (
    <div style={{ height: '100%', position: 'relative' }}>
      <HiddenScroll sidePadding={14} topPadding={4} bottomPadding={20}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div
            style={{
              border: '4px solid black',
              borderRadius: '22px',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                rgba(230,230,250,0.92)
              `,
              padding: '16px',
              boxShadow: `5px 5px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.7)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: '11px',
                  fontWeight: 900,
                  color: '#000',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                👥 in the portal
              </p>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: '24px',
                  fontWeight: 900,
                  color: '#000',
                  lineHeight: 1,
                }}
              >
                {crewOnlineIds.length}
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: 'rgba(0,0,0,0.5)',
                    marginLeft: '6px',
                  }}
                >
                  online
                </span>
              </p>
            </div>
            <span
              className="gloss-shine"
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '999px',
                border: '4px solid black',
                background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                boxShadow: '3px 3px 0 0 black',
                flexShrink: 0,
              }}
            >
              🟢
            </span>
          </div>

          {crewLoading ? (
            <p
              style={{
                textAlign: 'center',
                color: 'rgba(255,253,245,0.5)',
                fontSize: '12px',
                padding: '30px 0',
                fontWeight: 700,
                margin: 0,
              }}
            >
              loading crew...
            </p>
          ) : (
            [...crewProfiles]
              .sort((a, b) => {
                const aOn = crewOnlineIds.includes(a.id);
                const bOn = crewOnlineIds.includes(b.id);
                if (aOn !== bOn) return aOn ? -1 : 1;
                return (crewCounts[b.email] ?? 0) - (crewCounts[a.email] ?? 0);
              })
              .map((p, i) => {
                const isOnline = crewOnlineIds.includes(p.id);
                const isMe = p.id === userId;
                const label = displayLabel(p.email, p.display_name);
                const initials = initialsFor(p.email, p.display_name);
                const avatarBg = p.avatar_color || AVATAR_COLORS[i % AVATAR_COLORS.length];
                const count = crewCounts[p.email] ?? 0;
                return (
                  <div
                    key={p.id}
                    style={{
                      border: '4px solid black',
                      borderRadius: '22px',
                      background: `
                        linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                        #FFFDF5
                      `,
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      boxShadow: '4px 4px 0 0 black',
                    }}
                  >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div
                        className="gloss-shine"
                        style={{
                          width: '48px',
                          height: '48px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '999px',
                          border: '3px solid black',
                          background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), ${avatarBg}`,
                          fontWeight: 900,
                          fontSize: '13px',
                          color: '#000',
                        }}
                      >
                        {initials}
                      </div>
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '-2px',
                          right: '-2px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '999px',
                          border: '3px solid black',
                          backgroundColor: isOnline ? '#7FB89B' : '#D8D0C0',
                        }}
                      />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 900,
                          fontSize: '14px',
                          color: '#000',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isMe ? `${label} (you)` : label}
                      </p>
                      <p
                        style={{
                          margin: '3px 0 0',
                          fontSize: '10px',
                          fontWeight: 800,
                          color: isOnline ? '#3A7A5E' : 'rgba(0,0,0,0.45)',
                        }}
                      >
                        {isOnline ? 'in the portal' : 'away'} · {count} message{count === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </HiddenScroll>
    </div>
  );

  const pulseSlide = (
    <div style={{ height: '100%', position: 'relative' }}>
      <HiddenScroll sidePadding={14} topPadding={4} bottomPadding={20}>
        {pulseLoading ? (
          <p
            style={{
              textAlign: 'center',
              color: 'rgba(255,253,245,0.5)',
              fontSize: '12px',
              padding: '40px 0',
              fontWeight: 700,
              margin: 0,
            }}
          >
            loading pulse...
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            <StatCard emoji="💬" label="total" value={pulseTotal.toString()} color="#E2F0D9" />
            <StatCard emoji="🔥" label="today" value={pulseToday.toString()} color="#FFD1DC" />
            <StatCard emoji="📅" label="last 7 days" value={pulseWeek.toString()} color="#FFF5BA" />
            <StatCard
              emoji="⏰"
              label="busiest hour"
              value={pulseBusiestHour === null ? '—' : formatHour(pulseBusiestHour)}
              color="#D4F0F0"
              sub={
                pulseBusiestDay
                  ? `on ${new Date(pulseBusiestDay + 'T00:00:00').toLocaleDateString('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}`
                  : 'past 7 days'
              }
            />
            <div style={{ gridColumn: '1 / -1' }}>
              {pulseTopSender ? (
                <div
                  style={{
                    border: '4px solid black',
                    borderRadius: '22px',
                    background: `
                      linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                      rgba(230,230,250,0.92)
                    `,
                    padding: '16px 18px',
                    boxShadow: `5px 5px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.7)`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <span
                    className="gloss-shine"
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '999px',
                      border: '4px solid black',
                      background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      boxShadow: '3px 3px 0 0 black',
                      flexShrink: 0,
                    }}
                  >
                    👑
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '10px',
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color: 'rgba(0,0,0,0.5)',
                      }}
                    >
                      top talker · last 7 days
                    </p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '16px',
                        fontWeight: 900,
                        color: '#000',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pulseTopSender.email.split('@')[0]}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: '11px',
                        fontWeight: 800,
                        color: 'rgba(0,0,0,0.55)',
                      }}
                    >
                      {pulseTopSender.count} messages
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    border: '4px solid black',
                    borderRadius: '22px',
                    background: '#FFFDF5',
                    padding: '30px 20px',
                    boxShadow: '5px 5px 0 0 black',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 800, fontSize: '13px', color: '#000' }}>
                    no messages yet
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </HiddenScroll>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex flex-col overflow-hidden">
      <div
        className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col gap-2"
        style={{
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          paddingLeft: 'max(8px, env(safe-area-inset-left))',
          paddingRight: 'max(8px, env(safe-area-inset-right))',
        }}
      >
        <div className="flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="gloss-shine flex size-10 shrink-0 items-center justify-center rounded-2xl border-4 border-black"
              style={{
                background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E6E6FA`,
                fontSize: '18px',
              }}
            >
              💬
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg leading-tight text-white">
                squad chat
              </h1>
              <p className="text-[10px] font-bold leading-tight text-white/60 truncate">
                {groups.length + 1} room{groups.length + 1 === 1 ? '' : 's'} · {messages.length} messages
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <BgPickerButton
              current={chatBg}
              onChange={async (bg) => {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                await supabase.from('profiles').update({ chat_bg: bg }).eq('id', user.id);
              }}
            />
            <Link
              href="/"
              className="inline-flex items-center justify-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
              style={{ padding: '8px 12px', fontSize: '14px', minWidth: '44px', minHeight: '44px' }}
            >
              ←
            </Link>
          </div>
        </div>

        <SwipeCarousel
          mode="fill"
          index={tabIndex}
          onIndexChange={setTabIndex}
          labels={['💬 rooms', '👥 crew', '📊 pulse']}
          slides={[roomsSlide, crewSlide, pulseSlide]}
        />
      </div>

      {createOpen && (
        <>
          <div
            onClick={() => !creatingGroup && setCreateOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(26,11,46,0.55)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 1000,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              width: 'min(440px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
              background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), rgba(255,253,245,0.98)`,
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '4px solid black',
              borderRadius: '22px',
              boxShadow: '10px 10px 0 0 black',
              padding: '18px',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: '#000' }}>
                ✨ new group
              </p>
              <button
                onClick={() => setCreateOpen(false)}
                disabled={creatingGroup}
                style={{
                  width: '28px',
                  height: '28px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: '#FFD1DC',
                  color: '#000',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X className="size-3" strokeWidth={3} />
              </button>
            </div>

            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="group name"
              maxLength={40}
              autoFocus
              style={{
                width: '100%',
                border: '2px solid black',
                borderRadius: '14px',
                background: '#FFFDF5',
                color: '#000',
                fontSize: '14px',
                padding: '11px 14px',
                outline: 'none',
                fontWeight: 700,
                fontFamily: 'inherit',
              }}
            />

            <div>
              <p
                style={{
                  margin: '0 0 8px',
                  fontSize: '10px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'rgba(0,0,0,0.55)',
                }}
              >
                pick an emoji
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                {GROUP_EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setNewGroupEmoji(e)}
                    style={{
                      aspectRatio: '1 / 1',
                      border: '3px solid black',
                      borderRadius: '12px',
                      background:
                        newGroupEmoji === e
                          ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                          : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                      cursor: 'pointer',
                      fontSize: '22px',
                      lineHeight: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      boxShadow:
                        newGroupEmoji === e ? '3px 3px 0 0 black' : '2px 2px 0 0 black',
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p
                style={{
                  margin: '0 0 8px',
                  fontSize: '10px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'rgba(0,0,0,0.55)',
                }}
              >
                pick a color
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewGroupColor(c)}
                    style={{
                      flex: 1,
                      height: '34px',
                      border: '3px solid black',
                      borderRadius: '10px',
                      background: c,
                      cursor: 'pointer',
                      boxShadow:
                        newGroupColor === c
                          ? '0 0 0 2px #FF8BA7, 2px 2px 0 0 black'
                          : '2px 2px 0 0 black',
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <p
                style={{
                  margin: '0 0 8px',
                  fontSize: '10px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'rgba(0,0,0,0.55)',
                }}
              >
                add members · {newGroupMemberIds.size} selected
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                {crewProfiles
                  .filter((c) => c.id !== userId)
                  .map((c) => {
                    const selected = newGroupMemberIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setNewGroupMemberIds((prev) => {
                            const next = new Set(prev);
                            if (selected) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          });
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          border: '2px solid black',
                          borderRadius: '12px',
                          background: selected
                            ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9'
                            : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                          cursor: 'pointer',
                          boxShadow: '2px 2px 0 0 black',
                          width: '100%',
                        }}
                      >
                        <span
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '999px',
                            border: '2px solid black',
                            background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), ${c.avatar_color || '#E6E6FA'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                            fontSize: '10px',
                            color: '#000',
                            flexShrink: 0,
                          }}
                        >
                          {initialsFor(c.email, c.display_name)}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            textAlign: 'left',
                            fontSize: '13px',
                            fontWeight: 800,
                            color: '#000',
                          }}
                        >
                          {displayLabel(c.email, c.display_name)}
                        </span>
                        {selected && <Check className="size-4" strokeWidth={3} style={{ color: '#3A7A5E' }} />}
                      </button>
                    );
                  })}
              </div>
            </div>

            <button
              onClick={handleCreateGroup}
              disabled={creatingGroup || !newGroupName.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px',
                border: '3px solid black',
                borderRadius: '999px',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9',
                color: '#000',
                fontWeight: 900,
                fontSize: '12px',
                boxShadow: '3px 3px 0 0 black',
                cursor: creatingGroup || !newGroupName.trim() ? 'not-allowed' : 'pointer',
                opacity: creatingGroup || !newGroupName.trim() ? 0.5 : 1,
              }}
            >
              <Users className="size-4" strokeWidth={3} />
              {creatingGroup ? 'creating...' : 'create group'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  emoji,
  label,
  value,
  color,
  sub,
}: {
  emoji: string;
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        border: '4px solid black',
        borderRadius: '22px',
        background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), ${color}`,
        padding: '16px',
        boxShadow: `5px 5px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.7)`,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        minHeight: '96px',
      }}
    >
      <span style={{ fontSize: '22px', lineHeight: 1 }}>{emoji}</span>
      <p
        style={{
          margin: 0,
          fontSize: '10px',
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'rgba(0,0,0,0.5)',
        }}
      >
        {label}
      </p>
      <p style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#000', lineHeight: 1 }}>
        {value}
      </p>
      {sub && (
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '9px',
            fontWeight: 800,
            color: 'rgba(0,0,0,0.45)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}