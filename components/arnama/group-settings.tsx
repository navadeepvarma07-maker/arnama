'use client';

import { useEffect, useState } from 'react';
import { X, Check, Trash2, Crown, LogOut, UserMinus, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { displayLabel, initialsFor } from '@/lib/use-profile';

type Group = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description?: string | null;
  created_by: string;
};

type Member = {
  group_id: string;
  user_id: string;
  user_email: string;
  is_admin?: boolean;
};

type CrewProfile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_color: string;
};

type Props = {
  group: Group;
  members: Member[];
  crewProfiles: CrewProfile[];
  myId: string;
  myEmail: string;
  onClose: () => void;
  onGroupUpdated: (g: Group) => void;
  onMembersChanged: () => void;
  onLeft: () => void;
};

const GROUP_COLORS = ['#E6E6FA', '#E2F0D9', '#FFD1DC', '#FFF5BA', '#D4F0F0'];
const GROUP_EMOJIS = ['💬', '🔥', '🎮', '🎵', '📸', '🍿', '✈️', '🏠', '🎉', '⚡'];

export function GroupSettings({
  group,
  members,
  crewProfiles,
  myId,
  myEmail,
  onClose,
  onGroupUpdated,
  onMembersChanged,
  onLeft,
}: Props) {
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);
  const [color, setColor] = useState(group.color);
  const [description, setDescription] = useState(group.description ?? '');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const myMember = members.find((m) => m.user_id === myId);
  const iAmAdmin = !!myMember?.is_admin || group.created_by === myId;
  const iAmCreator = group.created_by === myId;

  const dirty =
    name.trim() !== group.name ||
    emoji !== group.emoji ||
    color !== group.color ||
    (description.trim() || '') !== (group.description || '');

  async function saveGroup() {
    if (!name.trim()) return;
    setSaving(true);
    const patch = {
      name: name.trim(),
      emoji,
      color,
      description: description.trim() || null,
    };
    const { data, error } = await supabase
      .from('chat_groups')
      .update(patch)
      .eq('id', group.id)
      .select()
      .single();
    setSaving(false);
    if (error) {
      alert('⚠️ ' + error.message);
      return;
    }
    if (data) {
      onGroupUpdated(data as Group);
      setSavedMsg('saved ✓');
      setTimeout(() => setSavedMsg(''), 1500);
    }
  }

  async function toggleAdmin(m: Member) {
    if (!iAmCreator && !iAmAdmin) return;
    const nextVal = !m.is_admin;
    const { error } = await supabase
      .from('chat_group_members')
      .update({ is_admin: nextVal })
      .eq('group_id', group.id)
      .eq('user_id', m.user_id);
    if (error) {
      alert('⚠️ ' + error.message);
      return;
    }
    onMembersChanged();
  }

  async function removeMember(m: Member) {
    if (!confirm(`Remove ${m.user_email.split('@')[0]} from the group?`)) return;
    const { error } = await supabase
      .from('chat_group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', m.user_id);
    if (error) {
      alert('⚠️ ' + error.message);
      return;
    }
    onMembersChanged();
  }

  async function addMember(profile: CrewProfile) {
    const { error } = await supabase.from('chat_group_members').insert({
      group_id: group.id,
      user_id: profile.id,
      user_email: profile.email,
      is_admin: false,
    });
    if (error) {
      alert('⚠️ ' + error.message);
      return;
    }
    onMembersChanged();
  }

  async function leaveGroup() {
    if (iAmCreator) {
      alert('You created this group — delete it instead.');
      return;
    }
    if (!confirm('Leave this group?')) return;
    const { error } = await supabase
      .from('chat_group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', myId);
    if (error) {
      alert('⚠️ ' + error.message);
      return;
    }
    onLeft();
  }

  async function deleteGroup() {
    if (!iAmCreator) return;
    if (!confirm(`Delete "${group.name}"? All messages will be lost.`)) return;
    const { error } = await supabase
      .from('chat_groups')
      .delete()
      .eq('id', group.id);
    if (error) {
      alert('⚠️ ' + error.message);
      return;
    }
    onLeft();
  }

  const memberIds = new Set(members.map((m) => m.user_id));
  const nonMembers = crewProfiles.filter((c) => !memberIds.has(c.id));

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(26,11,46,0.65)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 1400,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 'min(460px, calc(100vw - 24px))',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          background: `
            linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
            rgba(255,253,245,0.98)
          `,
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '4px solid black',
          borderRadius: '22px',
          boxShadow: '10px 10px 0 0 black',
          padding: '18px',
          zIndex: 1401,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: '#000' }}>
            ⚙️ group settings
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
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

        {!iAmAdmin && (
          <div
            style={{
              border: '2px solid black',
              borderRadius: '12px',
              padding: '10px 12px',
              background: '#FFF5BA',
              fontSize: '11px',
              fontWeight: 800,
              color: '#000',
            }}
          >
            🔒 only admins can edit the group or manage members
          </div>
        )}

        {/* Name */}
        <div>
          <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(0,0,0,0.55)', marginBottom: '6px', display: 'block' }}>
            group name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            disabled={!iAmAdmin}
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
              opacity: iAmAdmin ? 1 : 0.5,
            }}
          />
        </div>

        {/* Description */}
        <div>
          <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(0,0,0,0.55)', marginBottom: '6px', display: 'block' }}>
            description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={160}
            rows={2}
            disabled={!iAmAdmin}
            placeholder="what's this group about?"
            style={{
              width: '100%',
              border: '2px solid black',
              borderRadius: '14px',
              background: '#FFFDF5',
              color: '#000',
              fontSize: '13px',
              padding: '10px 14px',
              outline: 'none',
              fontWeight: 600,
              fontFamily: 'inherit',
              resize: 'none',
              opacity: iAmAdmin ? 1 : 0.5,
            }}
          />
        </div>

        {/* Emoji */}
        <div>
          <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(0,0,0,0.55)', marginBottom: '6px', display: 'block' }}>
            emoji
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
            {GROUP_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => iAmAdmin && setEmoji(e)}
                disabled={!iAmAdmin}
                style={{
                  aspectRatio: '1/1',
                  border: '3px solid black',
                  borderRadius: '12px',
                  background: emoji === e
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                  cursor: iAmAdmin ? 'pointer' : 'not-allowed',
                  fontSize: '22px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  boxShadow: emoji === e ? '3px 3px 0 0 black' : '2px 2px 0 0 black',
                  opacity: iAmAdmin ? 1 : 0.5,
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(0,0,0,0.55)', marginBottom: '6px', display: 'block' }}>
            color
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => iAmAdmin && setColor(c)}
                disabled={!iAmAdmin}
                style={{
                  flex: 1,
                  height: '34px',
                  border: '3px solid black',
                  borderRadius: '10px',
                  background: c,
                  cursor: iAmAdmin ? 'pointer' : 'not-allowed',
                  boxShadow: color === c ? '0 0 0 2px #FF8BA7, 2px 2px 0 0 black' : '2px 2px 0 0 black',
                  opacity: iAmAdmin ? 1 : 0.5,
                }}
              />
            ))}
          </div>
        </div>

        {iAmAdmin && (
          <button
            onClick={saveGroup}
            disabled={!dirty || saving}
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
              cursor: !dirty || saving ? 'not-allowed' : 'pointer',
              opacity: !dirty || saving ? 0.5 : 1,
            }}
          >
            <Check className="size-4" strokeWidth={3} />
            {saving ? 'saving...' : savedMsg || 'save changes'}
          </button>
        )}

        {/* Members */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(0,0,0,0.55)' }}>
              members · {members.length}
            </label>
            {iAmAdmin && nonMembers.length > 0 && (
              <button
                onClick={() => setAddOpen((v) => !v)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: '#E2F0D9',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '10px',
                  cursor: 'pointer',
                  boxShadow: '2px 2px 0 0 black',
                }}
              >
                <UserPlus className="size-3" strokeWidth={3} />
                add
              </button>
            )}
          </div>

          {addOpen && nonMembers.length > 0 && (
            <div
              style={{
                border: '2px dashed rgba(0,0,0,0.3)',
                borderRadius: '12px',
                padding: '8px',
                marginBottom: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                maxHeight: '160px',
                overflowY: 'auto',
              }}
            >
              {nonMembers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => addMember(c)}
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
                      background: c.avatar_color || '#E6E6FA',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      fontWeight: 900,
                      color: '#000',
                      flexShrink: 0,
                    }}
                  >
                    {initialsFor(c.email, c.display_name)}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left', fontSize: '12px', fontWeight: 800, color: '#000' }}>
                    {displayLabel(c.email, c.display_name)}
                  </span>
                  <UserPlus className="size-3" strokeWidth={3} />
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {members.map((m) => {
              const p = crewProfiles.find((c) => c.id === m.user_id);
              const label = p ? displayLabel(p.email, p.display_name) : m.user_email.split('@')[0];
              const av = p?.avatar_color || '#E6E6FA';
              const initials = p ? initialsFor(p.email, p.display_name) : m.user_email.slice(0, 2).toUpperCase();
              const isMe = m.user_id === myId;
              const isCreator = m.user_id === group.created_by;
              const isAdmin = m.is_admin || isCreator;
              return (
                <div
                  key={m.user_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    border: '2px solid black',
                    borderRadius: '12px',
                    background: isAdmin
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFF5BA'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                    boxShadow: '2px 2px 0 0 black',
                  }}
                >
                  <span
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '999px',
                      border: '2px solid black',
                      background: av,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 900,
                      color: '#000',
                      flexShrink: 0,
                    }}
                  >
                    {initials}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 900, color: '#000', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {label}
                      {isMe && <span style={{ fontSize: '9px', color: 'rgba(0,0,0,0.5)' }}>(you)</span>}
                      {isCreator && <Crown className="size-3" strokeWidth={3} style={{ color: '#C2185B' }} />}
                      {!isCreator && isAdmin && <Crown className="size-3" strokeWidth={3} style={{ color: '#7A4A9E' }} />}
                    </p>
                  </div>
                  {iAmCreator && !isMe && (
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button
                        onClick={() => toggleAdmin(m)}
                        title={isAdmin ? 'remove admin' : 'make admin'}
                        style={{
                          width: '28px',
                          height: '28px',
                          border: '2px solid black',
                          borderRadius: '999px',
                          background: isAdmin ? '#FF8BA7' : '#E2F0D9',
                          color: '#000',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Crown className="size-3" strokeWidth={3} />
                      </button>
                      <button
                        onClick={() => removeMember(m)}
                        title="remove from group"
                        style={{
                          width: '28px',
                          height: '28px',
                          border: '2px solid black',
                          borderRadius: '999px',
                          background: '#FFFDF5',
                          color: '#C2185B',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <UserMinus className="size-3" strokeWidth={3} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Danger zone */}
        <div style={{ display: 'flex', gap: '8px', paddingTop: '4px', borderTop: '2px dashed rgba(0,0,0,0.2)' }}>
          {!iAmCreator && (
            <button
              onClick={leaveGroup}
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px',
                border: '2px solid black',
                borderRadius: '999px',
                background: '#FFF5BA',
                color: '#000',
                fontWeight: 900,
                fontSize: '11px',
                cursor: 'pointer',
                boxShadow: '2px 2px 0 0 black',
              }}
            >
              <LogOut className="size-3.5" strokeWidth={3} />
              leave group
            </button>
          )}
          {iAmCreator && (
            <button
              onClick={deleteGroup}
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px',
                border: '2px solid black',
                borderRadius: '999px',
                background: '#FFD1DC',
                color: '#C2185B',
                fontWeight: 900,
                fontSize: '11px',
                cursor: 'pointer',
                boxShadow: '2px 2px 0 0 black',
              }}
            >
              <Trash2 className="size-3.5" strokeWidth={3} />
              delete group
            </button>
          )}
        </div>
      </div>
    </>
  );
}