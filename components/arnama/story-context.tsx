'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useProfile, displayLabel, initialsFor } from '@/lib/use-profile';
import {
  X,
  Send,
  Heart,
  Share2,
  Users,
  MessageCircle,
  User as UserIcon,
} from 'lucide-react';

type Story = {
  id: string;
  user_id: string;
  user_email: string;
  media_url: string | null;
  media_type: string | null;
  caption: string | null;
  text_overlay: string | null;
  visibility: string;
  created_at: string;
  expires_at: string;
};

type StoryProfile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_color: string;
};

type Group = {
  id: string;
  name: string;
  emoji: string;
};

type Comment = {
  id: string;
  story_id: string;
  user_id: string;
  user_email: string;
  content: string;
  created_at: string;
};

const STORY_COLORS = ['#FFD1DC', '#E2F0D9', '#E6E6FA', '#FFF5BA', '#D4F0F0'];

function colorFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 17 + s.charCodeAt(i)) | 0;
  return STORY_COLORS[Math.abs(h) % STORY_COLORS.length];
}

export function parseStoryShare(content: string): {
  text: string;
  imageUrl: string | null;
} {
  const match = content.match(/https?:\/\/\S+/);
  if (!match) return { text: content, imageUrl: null };
  const url = match[0];
  const isImage =
    /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url) ||
    url.includes('/stories/') ||
    url.includes('/photos/');
  if (!isImage) return { text: content, imageUrl: null };
  const textPart = content.replace(url, '').trim();
  return { text: textPart, imageUrl: url };
}

type Ctx = {
  myId: string | null;
  myEmail: string | null;
  storiesByUser: Record<string, Story[]>;
  profilesMap: Record<string, StoryProfile>;
  hasStory: (userId: string) => boolean;
  allViewedByMe: (userId: string) => boolean;
  openComposer: () => void;
  openViewer: (userId: string) => void;
};

const StoryContext = createContext<Ctx | null>(null);

export function StoryProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const [myId, setMyId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [profilesMap, setProfilesMap] = useState<Record<string, StoryProfile>>({});
  const [stories, setStories] = useState<Story[]>([]);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [likesByStory, setLikesByStory] = useState<Record<string, string[]>>({});
  const [commentsByStory, setCommentsByStory] = useState<Record<string, Comment[]>>({});

  const [viewerUser, setViewerUser] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyTargetType, setReplyTargetType] = useState<'dm' | 'group' | 'squad'>('dm');
  const [replyGroupId, setReplyGroupId] = useState<string | null>(null);
  const [replyTargets, setReplyTargets] = useState<Group[]>([]);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareTargets, setShareTargets] = useState<Group[]>([]);
  const [sharePersonOpen, setSharePersonOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerFile, setComposerFile] = useState<File | null>(null);
  const [composerPreview, setComposerPreview] = useState<string | null>(null);
  const [composerCaption, setComposerCaption] = useState('');
  const [composerText, setComposerText] = useState('');
  const [composerVisibility, setComposerVisibility] = useState<'everyone' | 'users'>('everyone');
  const [composerTargets, setComposerTargets] = useState<Set<string>>(new Set());
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  // AUTH
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMyId(data.user?.id ?? null);
      setMyEmail(data.user?.email ?? null);
    });
  }, []);

  // PROFILES
  useEffect(() => {
    if (!myEmail) return;
    supabase
      .from('profiles')
      .select('id, email, display_name, avatar_color')
      .then(({ data }) => {
        const map: Record<string, StoryProfile> = {};
        (data ?? []).forEach((p: any) => {
          map[p.id] = p;
        });
        setProfilesMap(map);
      });
  }, [myEmail]);

  // STORIES
  function reloadStories() {
    if (!myId) return;
    const nowIso = new Date().toISOString();
    supabase
      .from('stories')
      .select('*')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) return;
        const list = (data ?? []) as Story[];
        const myEmailLower = (myEmail ?? '').toLowerCase();
        const visible = list.filter((s) => {
          if (s.user_id === myId) return true;
          if (s.visibility === 'everyone') return true;
          if (
            s.visibility === 'users' &&
            Array.isArray((s as any).visible_to_users) &&
            (s as any).visible_to_users
              .map((e: string) => e.toLowerCase())
              .includes(myEmailLower)
          ) {
            return true;
          }
          return false;
        });
        setStories(visible);
      });
  }

  useEffect(() => {
    reloadStories();
  }, [myId]);

  useEffect(() => {
    if (!myEmail) return;
    const ch = supabase
      .channel('story-host-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stories' },
        () => reloadStories()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myEmail]);

  // LIKES
  useEffect(() => {
    if (!myId) return;
    function reloadLikes() {
      supabase.from('story_likes').select('story_id, user_id').then(({ data }) => {
        const map: Record<string, string[]> = {};
        (data ?? []).forEach((r: any) => {
          if (!map[r.story_id]) map[r.story_id] = [];
          map[r.story_id].push(r.user_id);
        });
        setLikesByStory(map);
      });
    }
    reloadLikes();
    const ch = supabase
      .channel('story-likes-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'story_likes' },
        () => reloadLikes()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId]);

  // COMMENTS
  useEffect(() => {
    if (!myId) return;
    function reloadComments() {
      supabase
        .from('story_comments')
        .select('*')
        .order('created_at', { ascending: true })
        .then(({ data }) => {
          const map: Record<string, Comment[]> = {};
          (data ?? []).forEach((c: any) => {
            if (!map[c.story_id]) map[c.story_id] = [];
            map[c.story_id].push(c);
          });
          setCommentsByStory(map);
        });
    }
    reloadComments();
    const ch = supabase
      .channel('story-comments-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'story_comments' },
        () => reloadComments()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId]);

  // VIEWS
  useEffect(() => {
    if (!myId) return;
    supabase
      .from('story_views')
      .select('story_id')
      .eq('viewer_id', myId)
      .then(({ data }) => {
        setViewedIds(new Set((data ?? []).map((r: any) => r.story_id)));
      });
  }, [myId]);

  useEffect(() => {
    if (!myId) return;
    supabase
      .from('story_views')
      .select('story_id, viewer_id')
      .then(({ data }) => {
        const myStoryIds = new Set(
          stories.filter((s) => s.user_id === myId).map((s) => s.id)
        );
        const counts: Record<string, number> = {};
        (data ?? []).forEach((r: any) => {
          if (myStoryIds.has(r.story_id)) {
            counts[r.story_id] = (counts[r.story_id] ?? 0) + 1;
          }
        });
        setViewCounts(counts);
      });
  }, [myId, stories.length]);

  const storiesByUser: Record<string, Story[]> = {};
  stories.forEach((s) => {
    if (!storiesByUser[s.user_id]) storiesByUser[s.user_id] = [];
    storiesByUser[s.user_id].push(s);
  });

  function hasStory(userId: string) {
    return (storiesByUser[userId]?.length ?? 0) > 0;
  }
  function allViewedByMe(userId: string) {
    const list = storiesByUser[userId] ?? [];
    if (list.length === 0) return true;
    return list.every((s) => viewedIds.has(s.id));
  }

  async function loadReplyTargets(storyUserId: string) {
    if (!myId) return;
    const { data: mine } = await supabase
      .from('chat_group_members')
      .select('group_id')
      .eq('user_id', myId);
    const myGroupIds = (mine ?? []).map((g: any) => g.group_id);
    if (myGroupIds.length === 0) {
      setReplyTargets([]);
      return;
    }
    const { data: shared } = await supabase
      .from('chat_group_members')
      .select('group_id')
      .eq('user_id', storyUserId)
      .in('group_id', myGroupIds);
    const sharedIds = (shared ?? []).map((g: any) => g.group_id);
    if (sharedIds.length === 0) {
      setReplyTargets([]);
      return;
    }
    const { data: groups } = await supabase
      .from('chat_groups')
      .select('id, name, emoji')
      .in('id', sharedIds);
    setReplyTargets((groups ?? []) as Group[]);
  }

  function openViewer(userId: string) {
    if (!hasStory(userId)) {
      if (userId === myId) openComposer();
      return;
    }
    setViewerUser(userId);
    setViewerIndex(0);
    setProgress(0);
    setPaused(false);
    setReplyText('');
    setReplyTargetType('dm');
    setReplyGroupId(null);
    setReplyTargets([]);
    setCommentsOpen(false);
    loadReplyTargets(userId);
  }

  function closeViewer() {
    setViewerUser(null);
    setViewerIndex(0);
    setProgress(0);
    setPaused(false);
    setReplyTargets([]);
    setCommentsOpen(false);
  }

  const currentViewerStories = viewerUser ? storiesByUser[viewerUser] ?? [] : [];
  const currentStory = currentViewerStories[viewerIndex] ?? null;

  // MARK VIEWED
  useEffect(() => {
    if (!currentStory || !myId) return;
    if (viewedIds.has(currentStory.id)) return;
    if (currentStory.user_id === myId) return;
    supabase
      .from('story_views')
      .insert({
        story_id: currentStory.id,
        viewer_id: myId,
        viewer_email: myEmail,
      })
      .then(({ error }) => {
        if (!error) setViewedIds((prev) => new Set(prev).add(currentStory.id));
      });
  }, [currentStory?.id]);

  // AUTO ADVANCE — pauses when `paused` is true (long press)
  useEffect(() => {
    if (!currentStory) return;
    if (replyText) return;
    if (paused) return;
    if (commentsOpen) return;

    const DURATION = 5000;
    const start = Date.now() - (progress / 100) * DURATION;
    const tick = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / DURATION) * 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(tick);
        nextStory();
      }
    }, 60);
    return () => clearInterval(tick);
  }, [currentStory?.id, replyText, paused, commentsOpen]);

  function nextStory() {
    if (viewerIndex < currentViewerStories.length - 1) {
      setViewerIndex((i) => i + 1);
      setProgress(0);
      setReplyText('');
    } else {
      closeViewer();
    }
  }
  function prevStory() {
    if (viewerIndex > 0) {
      setViewerIndex((i) => i - 1);
      setProgress(0);
      setReplyText('');
    }
  }

  // LIKE
  async function toggleLike() {
    if (!currentStory || !myId || !myEmail) return;
    const list = likesByStory[currentStory.id] ?? [];
    const mine = list.includes(myId);

    setLikesByStory((prev) => {
      const next = { ...prev };
      const current = next[currentStory.id] ?? [];
      if (mine) next[currentStory.id] = current.filter((u) => u !== myId);
      else next[currentStory.id] = [...current, myId];
      return next;
    });

    if (mine) {
      await supabase
        .from('story_likes')
        .delete()
        .eq('story_id', currentStory.id)
        .eq('user_id', myId);
    } else {
      await supabase.from('story_likes').insert({
        story_id: currentStory.id,
        user_id: myId,
        user_email: myEmail,
      });
    }
  }

  // COMMENT
  async function addComment() {
    if (!newComment.trim() || !currentStory || !myId || !myEmail) return;
    setPostingComment(true);
    const { error } = await supabase.from('story_comments').insert({
      story_id: currentStory.id,
      user_id: myId,
      user_email: myEmail,
      content: newComment.trim(),
    });
    setPostingComment(false);
    if (error) {
      showToast('❌ ' + error.message);
    } else {
      setNewComment('');
    }
  }

  async function deleteComment(id: string) {
    if (!confirm('Delete this comment?')) return;
    const { error } = await supabase.from('story_comments').delete().eq('id', id);
    if (error) showToast('❌ ' + error.message);
  }

  // REPLY
  async function sendReply() {
    if (!replyText.trim() || !currentStory || !myId || !myEmail) return;
    if (currentStory.user_id === myId) return;
    setSendingReply(true);

    const target = profilesMap[currentStory.user_id];
    if (!target) {
      setSendingReply(false);
      return;
    }

    const content = `💬 Replied to your story: ${replyText.trim()}\n${currentStory.media_url ?? ''}`;
    let error: any = null;

    if (replyTargetType === 'squad') {
      const r = await supabase.from('messages').insert({
        user_email: myEmail,
        content,
      });
      error = r.error;
    } else if (replyTargetType === 'group' && replyGroupId) {
      const r = await supabase.from('chat_group_messages').insert({
        group_id: replyGroupId,
        user_id: myId,
        user_email: myEmail,
        content,
      });
      error = r.error;
    } else {
      const r = await supabase.from('vault_dms').insert({
        sender_id: myId,
        sender_email: myEmail,
        recipient_id: target.id,
        recipient_email: target.email,
        content,
      });
      error = r.error;
    }

    setSendingReply(false);

    if (error) {
      showToast('❌ ' + error.message);
    } else {
      setReplyText('');
      closeViewer();
      if (replyTargetType === 'squad') {
        window.location.href = '/chat?squad=1';
      } else if (replyTargetType === 'group' && replyGroupId) {
        window.location.href = `/chat?group=${replyGroupId}`;
      } else {
        window.location.href = `/vault?thread=${target.id}`;
      }
    }
  }

  // SHARE
  async function loadShareTargets() {
    if (!myId) return;
    const { data } = await supabase
      .from('chat_group_members')
      .select('group_id')
      .eq('user_id', myId);
    const ids = (data ?? []).map((g: any) => g.group_id);
    if (ids.length === 0) {
      setShareTargets([]);
      return;
    }
    const { data: groups } = await supabase
      .from('chat_groups')
      .select('id, name, emoji')
      .in('id', ids);
    setShareTargets((groups ?? []) as Group[]);
  }

  async function shareToSquad() {
    if (!currentStory || !myId || !myEmail) return;
    setSharing(true);
    const owner = currentStory.user_email.split('@')[0];
    const content = `🎬 Story from @${owner}\n${currentStory.media_url ?? ''}`;
    const { error } = await supabase.from('messages').insert({
      user_email: myEmail,
      content,
    });
    setSharing(false);
    setShareOpen(false);
    if (error) {
      showToast('❌ ' + error.message);
    } else {
      closeViewer();
      window.location.href = '/chat?squad=1';
    }
  }

  async function shareToGroup(g: Group) {
    if (!currentStory || !myId || !myEmail) return;
    setSharing(true);
    const owner = currentStory.user_email.split('@')[0];
    const content = `🎬 Story from @${owner}\n${currentStory.media_url ?? ''}`;
    const { error } = await supabase.from('chat_group_messages').insert({
      group_id: g.id,
      user_id: myId,
      user_email: myEmail,
      content,
    });
    setSharing(false);
    setShareOpen(false);
    if (error) {
      showToast('❌ ' + error.message);
    } else {
      closeViewer();
      window.location.href = `/chat?group=${g.id}`;
    }
  }

  async function shareToPerson(userId: string) {
    if (!currentStory || !myId || !myEmail) return;
    const target = profilesMap[userId];
    if (!target) return;
    setSharing(true);
    const owner = currentStory.user_email.split('@')[0];
    const content = `🎬 Story from @${owner}\n${currentStory.media_url ?? ''}`;
    const { error } = await supabase.from('vault_dms').insert({
      sender_id: myId,
      sender_email: myEmail,
      recipient_id: target.id,
      recipient_email: target.email,
      content,
    });
    setSharing(false);
    setShareOpen(false);
    setSharePersonOpen(false);
    if (error) {
      showToast('❌ ' + error.message);
    } else {
      closeViewer();
      window.location.href = `/vault?thread=${target.id}`;
    }
  }

  async function shareExternal() {
    if (!currentStory) return;
    const url = currentStory.media_url ?? '';
    const owner = currentStory.user_email.split('@')[0];
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'arnama story',
          text: `${owner} shared a story on arnama`,
          url,
        });
      } catch {}
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      showToast('✅ link copied');
    }
    setShareOpen(false);
  }

  // COMPOSER
  function openComposer() {
    setComposerFile(null);
    setComposerPreview(null);
    setComposerCaption('');
    setComposerText('');
    setComposerVisibility('everyone');
    setComposerTargets(new Set());
    setComposerError('');
    setComposerOpen(true);
  }
  function closeComposer() {
    if (composerPreview) URL.revokeObjectURL(composerPreview);
    setComposerOpen(false);
    setComposerFile(null);
    setComposerPreview(null);
  }
  function pickFile(f: File | null) {
    if (!f) return;
    if (composerPreview) URL.revokeObjectURL(composerPreview);
    setComposerFile(f);
    setComposerPreview(URL.createObjectURL(f));
  }
  async function postStory() {
    if (!composerFile || !myId || !myEmail) return;
    setPosting(true);
    setComposerError('');
    try {
      const ext = composerFile.name.split('.').pop() || 'jpg';
      const path = `${myId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('stories')
        .upload(path, composerFile, { cacheControl: '3600', upsert: false });
      if (upErr) {
        setComposerError('⚠️ Upload failed: ' + upErr.message);
        setPosting(false);
        return;
      }
      const { data: pub } = supabase.storage.from('stories').getPublicUrl(path);
      const { error: insErr } = await supabase.from('stories').insert({
        user_id: myId,
        user_email: myEmail,
        media_url: pub.publicUrl,
        media_type: composerFile.type.startsWith('video') ? 'video' : 'image',
        caption: composerCaption.trim() || null,
        text_overlay: composerText.trim() || null,
        visibility: composerVisibility,
        visible_to_users:
          composerVisibility === 'users'
            ? Array.from(composerTargets)
                .map((id) => profilesMap[id]?.email)
                .filter(Boolean)
            : null,
      });
      if (insErr) {
        setComposerError('⚠️ Save failed: ' + insErr.message);
        setPosting(false);
        return;
      }
      closeComposer();
      reloadStories();
      showToast('✅ story posted');
    } catch (err: any) {
      setComposerError('⚠️ ' + (err?.message ?? 'unknown'));
    } finally {
      setPosting(false);
    }
  }

  const currentLikes = currentStory ? likesByStory[currentStory.id] ?? [] : [];
  const likedByMe = myId ? currentLikes.includes(myId) : false;
  const currentComments = currentStory ? commentsByStory[currentStory.id] ?? [] : [];

  return (
    <StoryContext.Provider
      value={{
        myId,
        myEmail,
        storiesByUser,
        profilesMap,
        hasStory,
        allViewedByMe,
        openComposer,
        openViewer,
      }}
    >
      {children}

      {/* VIEWER */}
      {viewerUser && currentStory && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#000',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Progress bars */}
          <div style={{ display: 'flex', gap: '4px', padding: '10px 10px 0', flexShrink: 0 }}>
            {currentViewerStories.map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: '3px',
                  background: 'rgba(255,255,255,0.3)',
                  borderRadius: '999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: '#FFF',
                    width: i < viewerIndex ? '100%' : i === viewerIndex ? `${progress}%` : '0%',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              flexShrink: 0,
            }}
          >
            <div
              className="gloss-shine"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '999px',
                border: '2px solid #FFF',
                background: colorFor(currentStory.user_email),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '12px',
                color: '#000',
                flexShrink: 0,
              }}
            >
              {initialsFor(currentStory.user_email, null)}
            </div>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#FFF', flex: 1 }}>
              {currentStory.user_email.split('@')[0]}
            </p>
            <button
              onClick={closeViewer}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '999px',
                border: '2px solid #FFF',
                background: 'rgba(0,0,0,0.4)',
                color: '#FFF',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X className="size-4" strokeWidth={3} />
            </button>
          </div>

          {/* Media area — long press to pause */}
          <div
            onMouseDown={() => setPaused(true)}
            onMouseUp={() => setPaused(false)}
            onMouseLeave={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
            onTouchCancel={() => setPaused(false)}
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
            }}
          >
            {currentStory.media_type === 'video' ? (
              <video
                src={currentStory.media_url ?? ''}
                autoPlay
                muted
                playsInline
                style={{ maxWidth: '100%', maxHeight: '100%', pointerEvents: 'none' }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentStory.media_url ?? ''}
                alt=""
                referrerPolicy="no-referrer"
                draggable={false}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  pointerEvents: 'none',
                }}
              />
            )}

            {currentStory.text_overlay && (
              <p
                style={{
                  position: 'absolute',
                  bottom: '20%',
                  left: '20px',
                  right: '20px',
                  textAlign: 'center',
                  fontSize: '22px',
                  fontWeight: 900,
                  color: '#FFF',
                  textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.7)',
                  margin: 0,
                  pointerEvents: 'none',
                }}
              >
                {currentStory.text_overlay}
              </p>
            )}

            {currentStory.caption && (
              <p
                style={{
                  position: 'absolute',
                  bottom: '60px',
                  left: '20px',
                  right: '20px',
                  textAlign: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#FFF',
                  textShadow: '0 2px 6px rgba(0,0,0,0.9)',
                  margin: 0,
                  pointerEvents: 'none',
                }}
              >
                {currentStory.caption}
              </p>
            )}

            {/* Pause indicator */}
            {paused && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%,-50%)',
                  width: '60px',
                  height: '60px',
                  borderRadius: '999px',
                  background: 'rgba(0,0,0,0.5)',
                  border: '2px solid rgba(255,255,255,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFF',
                  fontSize: '22px',
                  pointerEvents: 'none',
                }}
              >
                ⏸
              </div>
            )}

            {/* Tap zones */}
            <button
              onClick={prevStory}
              aria-label="Previous"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '30%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            />
            <button
              onClick={nextStory}
              aria-label="Next"
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: '70%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            />
          </div>

          {/* LIKE + COMMENT + SHARE */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 14px',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            <button
              onClick={toggleLike}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                border: '2px solid #FFF',
                borderRadius: '999px',
                background: likedByMe ? '#FF8BA7' : 'rgba(255,255,255,0.15)',
                color: likedByMe ? '#000' : '#FFF',
                cursor: 'pointer',
                fontWeight: 900,
                fontSize: '13px',
              }}
            >
              <Heart className="size-4" strokeWidth={3} fill={likedByMe ? '#000' : 'transparent'} />
              {currentLikes.length > 0 ? currentLikes.length : ''}
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setCommentsOpen(true);
                  setPaused(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  border: '2px solid #FFF',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.15)',
                  color: '#FFF',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: '13px',
                }}
                aria-label="Comments"
              >
                💬 {currentComments.length > 0 ? currentComments.length : ''}
              </button>

              <button
                onClick={async () => {
                  await loadShareTargets();
                  setSharePersonOpen(false);
                  setShareOpen(true);
                  setPaused(true);
                }}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '999px',
                  border: '2px solid #FFF',
                  background: 'rgba(255,255,255,0.15)',
                  color: '#FFF',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Share story"
              >
                <Share2 className="size-4" strokeWidth={2.75} />
              </button>
            </div>
          </div>

          {/* ACTION BAR — reply (others) OR views+delete (own) */}
          {currentStory.user_id !== myId ? (
            <div
              style={{
                padding: '0 14px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                flexShrink: 0,
              }}
            >
              {/* Reply target chips — squad + groups only, no "privately" chip */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setReplyTargetType('squad');
                    setReplyGroupId(null);
                  }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '999px',
                    border: '2px solid #FFF',
                    background: replyTargetType === 'squad' ? '#FFF' : 'rgba(255,255,255,0.15)',
                    color: replyTargetType === 'squad' ? '#000' : '#FFF',
                    fontSize: '10px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  💬 squad chat
                </button>
                {replyTargets.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setReplyTargetType('group');
                      setReplyGroupId(g.id);
                    }}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '999px',
                      border: '2px solid #FFF',
                      background:
                        replyTargetType === 'group' && replyGroupId === g.id
                          ? '#FFF'
                          : 'rgba(255,255,255,0.15)',
                      color:
                        replyTargetType === 'group' && replyGroupId === g.id
                          ? '#000'
                          : '#FFF',
                      fontSize: '10px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {g.emoji} {g.name}
                  </button>
                ))}
              </div>

              {/* Input — default is DM, overridden by chip selection */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={
                    replyTargetType === 'squad'
                      ? 'reply in squad chat...'
                      : replyTargetType === 'group'
                      ? `reply in ${
                          replyTargets.find((g) => g.id === replyGroupId)?.name ?? 'group'
                        }...`
                      : 'reply privately...'
                  }
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: '2px solid #FFF',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.15)',
                    color: '#FFF',
                    fontSize: '13px',
                    padding: '10px 14px',
                    outline: 'none',
                    fontWeight: 700,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendReply();
                  }}
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || sendingReply}
                  style={{
                    border: '2px solid #FFF',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.15)',
                    color: '#FFF',
                    cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                    padding: '0 16px',
                    opacity: replyText.trim() ? 1 : 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Send className="size-4" strokeWidth={2.75} />
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '0 14px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  border: '2px solid #FFF',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.15)',
                  color: '#FFF',
                  fontWeight: 900,
                  fontSize: '12px',
                }}
              >
                👁️ {viewCounts[currentStory.id] ?? 0}{' '}
                {(viewCounts[currentStory.id] ?? 0) === 1 ? 'view' : 'views'}
              </span>
              <button
                onClick={async () => {
                  if (!confirm('Delete this story?')) return;
                  await supabase.from('stories').delete().eq('id', currentStory.id);
                  reloadStories();
                  closeViewer();
                }}
                style={{
                  padding: '8px 14px',
                  border: '2px solid #FFF',
                  borderRadius: '999px',
                  background: 'rgba(255,100,100,0.4)',
                  color: '#FFF',
                  fontWeight: 900,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                🗑 delete
              </button>
            </div>
          )}
        </div>
      )}

      {/* COMMENTS SHEET */}
      {commentsOpen && currentStory && (
        <>
          <div
            onClick={() => {
              setCommentsOpen(false);
              setPaused(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 1200,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              bottom: 0,
              transform: 'translateX(-50%)',
              width: 'min(500px, 100vw)',
              maxHeight: '70vh',
              background: '#FFFDF5',
              borderTop: '4px solid #000',
              borderLeft: '4px solid #000',
              borderRight: '4px solid #000',
              borderRadius: '22px 22px 0 0',
              boxShadow: '0 -8px 0 0 rgba(0,0,0,0.2)',
              zIndex: 1201,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '3px solid #000',
                background: '#FFF5BA',
              }}
            >
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#000' }}>
                💬 comments · {currentComments.length}
              </p>
              <button
                onClick={() => {
                  setCommentsOpen(false);
                  setPaused(false);
                }}
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

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px' }}>
              {currentComments.length === 0 ? (
                <div style={{ padding: '30px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '32px', marginBottom: '8px' }}>💬</p>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'rgba(0,0,0,0.5)' }}>
                    no comments yet
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: '10px', fontWeight: 700, color: 'rgba(0,0,0,0.4)' }}>
                    be the first · disappears in 24h 🐾
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {currentComments.map((c) => {
                    const p = profilesMap[c.user_id];
                    const name = p ? displayLabel(p.email, p.display_name) : c.user_email.split('@')[0];
                    const av = p?.avatar_color || colorFor(c.user_email);
                    const initials = p ? initialsFor(p.email, p.display_name) : c.user_email.slice(0, 2).toUpperCase();
                    const mine = c.user_id === myId;
                    return (
                      <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '999px',
                            border: '2px solid black',
                            background: av,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                            fontSize: '10px',
                            color: '#000',
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: '11px', fontWeight: 900, color: '#000' }}>
                            {mine ? 'you' : name}
                          </p>
                          <p
                            style={{
                              margin: '2px 0 0',
                              fontSize: '13px',
                              color: '#000',
                              lineHeight: 1.4,
                              wordBreak: 'break-word',
                            }}
                          >
                            {c.content}
                          </p>
                        </div>
                        {mine && (
                          <button
                            onClick={() => deleteComment(c.id)}
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '999px',
                              border: '2px solid black',
                              background: '#FFD1DC',
                              color: '#000',
                              fontWeight: 900,
                              fontSize: '10px',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {currentStory.user_id !== myId && (
              <div
                style={{
                  padding: '10px 14px 14px',
                  borderTop: '3px solid #000',
                  background: '#E6E6FA',
                  display: 'flex',
                  gap: '8px',
                  flexShrink: 0,
                }}
              >
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="add a comment..."
                  maxLength={120}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: '2px solid black',
                    borderRadius: '999px',
                    background: '#FFFDF5',
                    color: '#000',
                    fontSize: '13px',
                    padding: '10px 14px',
                    outline: 'none',
                    fontWeight: 700,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addComment();
                  }}
                />
                <button
                  onClick={addComment}
                  disabled={!newComment.trim() || postingComment}
                  style={{
                    border: '2px solid black',
                    borderRadius: '999px',
                    background: '#E2F0D9',
                    color: '#000',
                    padding: '0 16px',
                    cursor: newComment.trim() ? 'pointer' : 'not-allowed',
                    opacity: newComment.trim() ? 1 : 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Send className="size-4" strokeWidth={2.75} />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* SHARE SHEET */}
      {shareOpen && currentStory && (
        <>
          <div
            onClick={() => !sharing && (setShareOpen(false), setPaused(false))}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(26,11,46,0.7)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 1100,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              bottom: '20px',
              transform: 'translateX(-50%)',
              width: 'min(440px, calc(100vw - 24px))',
              maxHeight: '70vh',
              overflowY: 'auto',
              background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), rgba(255,253,245,0.98)`,
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '4px solid black',
              borderRadius: '22px',
              boxShadow: '10px 10px 0 0 black',
              padding: '16px',
              zIndex: 1101,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#000' }}>
                📤 share story
              </p>
              <button
                onClick={() => {
                  setShareOpen(false);
                  setPaused(false);
                }}
                disabled={sharing}
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

            <button
              onClick={shareToSquad}
              disabled={sharing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px',
                border: '2px solid black',
                borderRadius: '14px',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9',
                cursor: 'pointer',
                boxShadow: '2px 2px 0 0 black',
              }}
            >
              <span style={{ fontSize: '20px' }}>💬</span>
              <span style={{ flex: 1, textAlign: 'left', fontSize: '13px', fontWeight: 900, color: '#000' }}>
                squad chat
              </span>
            </button>

            {shareTargets.length > 0 && (
              <>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '10px',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: 'rgba(0,0,0,0.5)',
                    paddingLeft: '4px',
                  }}
                >
                  your groups
                </p>
                {shareTargets.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => shareToGroup(g)}
                    disabled={sharing}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px',
                      border: '2px solid black',
                      borderRadius: '14px',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E6E6FA',
                      cursor: 'pointer',
                      boxShadow: '2px 2px 0 0 black',
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>{g.emoji}</span>
                    <span style={{ flex: 1, textAlign: 'left', fontSize: '13px', fontWeight: 900, color: '#000' }}>
                      {g.name}
                    </span>
                  </button>
                ))}
              </>
            )}

            <button
              onClick={() => setSharePersonOpen((v) => !v)}
              disabled={sharing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px',
                border: '2px solid black',
                borderRadius: '14px',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #D4F0F0',
                cursor: 'pointer',
                boxShadow: '2px 2px 0 0 black',
              }}
            >
              <UserIcon className="size-4" strokeWidth={2.75} />
              <span style={{ flex: 1, textAlign: 'left', fontSize: '13px', fontWeight: 900, color: '#000' }}>
                send to someone
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(0,0,0,0.5)' }}>
                {sharePersonOpen ? '▲' : '▼'}
              </span>
            </button>

            {sharePersonOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.values(profilesMap)
                  .filter((p) => p.id !== myId)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => shareToPerson(p.id)}
                      disabled={sharing}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        border: '2px solid black',
                        borderRadius: '12px',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                        cursor: 'pointer',
                        boxShadow: '2px 2px 0 0 black',
                        width: '100%',
                      }}
                    >
                      <span
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '999px',
                          border: '2px solid black',
                          background: p.avatar_color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '9px',
                          fontWeight: 900,
                          color: '#000',
                        }}
                      >
                        {initialsFor(p.email, p.display_name)}
                      </span>
                      <span style={{ flex: 1, textAlign: 'left', fontSize: '12px', fontWeight: 800, color: '#000' }}>
                        {displayLabel(p.email, p.display_name)}
                      </span>
                    </button>
                  ))}
              </div>
            )}

            <button
              onClick={shareExternal}
              disabled={sharing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px',
                border: '2px solid black',
                borderRadius: '14px',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFF5BA',
                cursor: 'pointer',
                boxShadow: '2px 2px 0 0 black',
              }}
            >
              <span style={{ fontSize: '20px' }}>🔗</span>
              <span style={{ flex: 1, textAlign: 'left', fontSize: '13px', fontWeight: 900, color: '#000' }}>
                share outside arnama
              </span>
            </button>
          </div>
        </>
      )}

      {/* COMPOSER */}
      {composerOpen && (
        <>
          <div
            onClick={closeComposer}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(26,11,46,0.65)',
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
                🐱 new story
              </p>
              <button
                onClick={closeComposer}
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

            {!composerPreview ? (
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  width: '100%',
                  aspectRatio: '3/4',
                  maxHeight: '340px',
                  border: '4px dashed #999',
                  borderRadius: '18px',
                  background: 'rgba(255,255,255,0.6)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '44px' }}>🐱📸</span>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#000' }}>
                  tap to pick a photo / video
                </span>
              </button>
            ) : (
              <div
                style={{
                  width: '100%',
                  aspectRatio: '3/4',
                  maxHeight: '340px',
                  border: '3px solid black',
                  borderRadius: '18px',
                  overflow: 'hidden',
                  background: '#000',
                  position: 'relative',
                }}
              >
                {composerFile?.type.startsWith('video') ? (
                  <video
                    src={composerPreview}
                    autoPlay
                    muted
                    loop
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={composerPreview}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}
                {composerText && (
                  <p
                    style={{
                      position: 'absolute',
                      bottom: '18%',
                      left: '14px',
                      right: '14px',
                      textAlign: 'center',
                      fontSize: '20px',
                      fontWeight: 900,
                      color: '#FFF',
                      textShadow: '0 2px 8px rgba(0,0,0,0.9)',
                      margin: 0,
                      pointerEvents: 'none',
                    }}
                  >
                    {composerText}
                  </p>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    padding: '6px 12px',
                    border: '2px solid #FFF',
                    borderRadius: '999px',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#FFF',
                    fontSize: '11px',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  change
                </button>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
            />

            <input
              type="text"
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder="text overlay (optional)"
              maxLength={60}
              style={{
                width: '100%',
                border: '2px solid black',
                borderRadius: '14px',
                background: '#FFFDF5',
                color: '#000',
                fontSize: '13px',
                padding: '10px 14px',
                outline: 'none',
                fontWeight: 700,
              }}
            />

            <input
              type="text"
              value={composerCaption}
              onChange={(e) => setComposerCaption(e.target.value)}
              placeholder="caption (optional)"
              maxLength={80}
              style={{
                width: '100%',
                border: '2px solid black',
                borderRadius: '14px',
                background: '#FFFDF5',
                color: '#000',
                fontSize: '13px',
                padding: '10px 14px',
                outline: 'none',
                fontWeight: 700,
              }}
            />

            <div
              style={{
                display: 'flex',
                gap: '6px',
                padding: '4px',
                border: '2px solid black',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.6)',
              }}
            >
              <button
                type="button"
                onClick={() => setComposerVisibility('everyone')}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 900,
                  background:
                    composerVisibility === 'everyone'
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9'
                      : 'transparent',
                  color: '#000',
                  boxShadow: composerVisibility === 'everyone' ? '2px 2px 0 0 black' : 'none',
                  cursor: 'pointer',
                }}
              >
                🌐 everyone
              </button>
              <button
                type="button"
                onClick={() => setComposerVisibility('users')}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 900,
                  background:
                    composerVisibility === 'users'
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFD1DC'
                      : 'transparent',
                  color: '#000',
                  boxShadow: composerVisibility === 'users' ? '2px 2px 0 0 black' : 'none',
                  cursor: 'pointer',
                }}
              >
                🐾 pick people
              </button>
            </div>

            {composerVisibility === 'users' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                }}
              >
                {Object.values(profilesMap)
                  .filter((p) => p.id !== myId)
                  .map((p) => {
                    const sel = composerTargets.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setComposerTargets((prev) => {
                            const next = new Set(prev);
                            if (sel) next.delete(p.id);
                            else next.add(p.id);
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
                          background: sel
                            ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9'
                            : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                          cursor: 'pointer',
                          boxShadow: '2px 2px 0 0 black',
                          width: '100%',
                        }}
                      >
                        <span
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '999px',
                            border: '2px solid black',
                            background: p.avatar_color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '9px',
                            fontWeight: 900,
                            color: '#000',
                          }}
                        >
                          {initialsFor(p.email, p.display_name)}
                        </span>
                        <span style={{ flex: 1, textAlign: 'left', fontSize: '12px', fontWeight: 800, color: '#000' }}>
                          {displayLabel(p.email, p.display_name)}
                        </span>
                        <span style={{ fontSize: '14px' }}>{sel ? '✅' : ''}</span>
                      </button>
                    );
                  })}
              </div>
            )}

            {composerError && (
              <div
                style={{
                  border: '2px solid black',
                  background: '#FFFDF5',
                  color: '#000',
                  fontSize: '12px',
                  fontWeight: 800,
                  borderRadius: '12px',
                  padding: '10px 14px',
                }}
              >
                {composerError}
              </div>
            )}

            <button
              onClick={postStory}
              disabled={!composerFile || posting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '12px',
                border: '3px solid black',
                borderRadius: '999px',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9',
                color: '#000',
                fontWeight: 900,
                fontSize: '12px',
                boxShadow: '3px 3px 0 0 black',
                cursor: !composerFile || posting ? 'not-allowed' : 'pointer',
                opacity: !composerFile || posting ? 0.5 : 1,
              }}
            >
              🐱 {posting ? 'posting...' : 'post story'}
            </button>
          </div>
        </>
      )}

      {/* TOAST */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 20px',
            borderRadius: '999px',
            background: '#FFFDF5',
            border: '3px solid black',
            boxShadow: '4px 4px 0 0 black',
            color: '#000',
            fontWeight: 900,
            fontSize: '13px',
            zIndex: 2000,
          }}
        >
          {toast}
        </div>
      )}
    </StoryContext.Provider>
  );
}

export function useStories() {
  const ctx = useContext(StoryContext);
  if (!ctx) {
    return {
      myId: null,
      myEmail: null,
      storiesByUser: {},
      profilesMap: {},
      hasStory: () => false,
      allViewedByMe: () => true,
      openComposer: () => {},
      openViewer: () => {},
    } as Ctx;
  }
  return ctx;
}