/* ============================================================
   LINK — Ocean-gloss messaging + global language-exchange feed
   Phase 1 → Supabase client, glossy auth
   Phase 2 → Realtime direct messaging engine (no statuses)
   Phase 3 → Interpals/Facebook hybrid global feed
   ============================================================ */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* ════════════ PHASE 1 · Supabase connection ════════════ */
const SUPABASE_URL = 'https://pqohnoaeolojiixrzfey.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxb2hub2Flb2xvamlpeHJ6ZmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMDYzMTQsImV4cCI6MjEwMDY4MjMxNH0.Uyz1VG6uPdxAkShmNFGOctOLJUJv3-sYt_FN9gw6Pao';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PAGE_SIZE = 10;
const LANGUAGES = [
  'English','Spanish','French','German','Portuguese','Italian','Dutch','Russian',
  'Arabic','Turkish','Korean','Japanese','Chinese (Mandarin)','Hindi','Urdu','Bengali',
  'Swahili','Yoruba','Igbo','Hausa','Vietnamese','Thai','Indonesian','Polish',
  'Ukrainian','Greek','Hebrew','Persian (Farsi)'
];

const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  profile: null,
  view: 'messages',
  booted: false,

  // messaging
  contacts: [],
  activeContact: null,
  seenIds: new Set(),      // message ids already rendered (dedupe realtime vs local)
  bubbleEls: new Map(),    // message id → DOM row (for read-receipt updates)
  unreadBy: new Map(),     // sender id → unread count

  // feed
  feed: { page: 0, done: false, loading: false },
  myLikes: new Set(),
  likeCounts: new Map(),
  pendingNew: [],

  channel: null,
};

/* ---------- Tiny utilities ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function timeAgo(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'just now';
  const m = s / 60; if (m < 60) return Math.floor(m) + 'm';
  const h = m / 60; if (h < 24) return Math.floor(h) + 'h';
  const d = h / 24; if (d < 7) return Math.floor(d) + 'd';
  return new Date(ts).toLocaleDateString();
}

const ICONS = {
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  chat:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
};
const icon = (name, size = 18) => `<span class="ic" style="width:${size}px;height:${size}px">${ICONS[name]}</span>`;

function avatarHTML(user, size = 44) {
  if (user?.avatar_url) {
    return `<img class="avatar" style="width:${size}px;height:${size}px" src="${esc(user.avatar_url)}" alt="" loading="lazy" />`;
  }
  const ch = (user?.username || '?').trim().charAt(0).toUpperCase() || '?';
  return `<div class="avatar avatar-fallback" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px"><span>${esc(ch)}</span></div>`;
}

function tagsHTML(u) {
  if (!u || (!u.native_language && !u.learning_language)) return '';
  const n = u.native_language   ? `<span class="tag tag-native">Native: ${esc(u.native_language)}</span>` : '';
  const l = u.learning_language ? `<span class="tag tag-learning">Learning: ${esc(u.learning_language)}</span>` : '';
  return `<div class="tags">${n}${l}</div>`;
}

function langLine(u) {
  const bits = [];
  if (u.native_language) bits.push('Native: ' + u.native_language);
  if (u.learning_language) bits.push('Learning: ' + u.learning_language);
  return bits.join(' · ');
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ════════════ PHASE 1 · Authentication ════════════ */
let authMode = 'signin';

function setAuthMode(mode) {
  authMode = mode;
  $('tab-signin').classList.toggle('active', mode === 'signin');
  $('tab-signup').classList.toggle('active', mode === 'signup');
  $('signup-extra').classList.toggle('hidden', mode !== 'signup');
  $('auth-submit').textContent = mode === 'signup' ? 'Create account' : 'Sign in';
  authError(null);
}

function authError(msg, ok = false) {
  const el = $('auth-error');
  if (!msg) { el.classList.add('hidden'); el.classList.remove('ok'); return; }
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.toggle('ok', ok);
}

$('tab-signin').onclick = () => setAuthMode('signin');
$('tab-signup').onclick = () => setAuthMode('signup');

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('auth-submit');
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'One moment…';
  authError(null);

  try {
    if (authMode === 'signup') {
      const username = $('auth-username').value.trim();
      const native = $('auth-native').value || null;
      const learning = $('auth-learning').value || null;

      if (!/^\w{3,20}$/.test(username)) {
        throw new Error('Pick a username of 3–20 letters, numbers or underscores.');
      }

      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { username, native_language: native, learning_language: learning } },
      });
      if (error) throw error;

      // Remember so the profile row can be created at first session
      localStorage.setItem('link_pending_profile',
        JSON.stringify({ username, native_language: native, learning_language: learning }));

      if (!data.session) {
        authError('Account created! Confirm the email we sent, then sign in.', true);
        setAuthMode('signin');
      }
      // If a session exists, onAuthStateChange boots the app automatically.
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    authError(err.message || String(err));
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

/* Create the users-row once per account (handles email-confirmation flows too). */
async function ensureProfile() {
  const { data, error } = await supabase
    .from('users').select('*').eq('id', state.user.id).maybeSingle();
  if (error) console.warn('profile fetch:', error.message);
  if (data) { state.profile = data; return; }

  const pending = JSON.parse(localStorage.getItem('link_pending_profile') || 'null');
  const meta = state.user.user_metadata || {};
  const base = pending?.username || meta.username ||
    (state.user.email || 'user').split('@')[0].replace(/[^\w]/g, '').slice(0, 14) || 'user';

  for (let i = 0; i < 5; i++) {
    const uname = i === 0 ? base : `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: row, error: e2 } = await supabase
      .from('users')
      .insert({
        id: state.user.id,
        username: uname,
        native_language: pending?.native_language ?? meta.native_language ?? null,
        learning_language: pending?.learning_language ?? meta.learning_language ?? null,
      })
      .select().single();
    if (!e2) {
      state.profile = row;
      localStorage.removeItem('link_pending_profile');
      return;
    }
    if (e2.code !== '23505') { console.warn('profile insert:', e2.message); break; }
  }
  // Absolute fallback so the UI never crashes
  state.profile = state.profile || { id: state.user.id, username: base };
}

/* ════════════ Session boot / teardown ════════════ */
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) await boot(session.user);
  else teardown();
});

async function boot(user) {
  state.user = user;
  if (state.booted) { showApp(); return; }
  state.booted = true;
  try {
    await ensureProfile();
    renderSidebar();
    await loadContacts();
    await refreshUnread();
    resetFeed();
    loadFeedPage();                 // warm the first page so the tab switch is instant
    subscribeRealtime();
  } catch (err) {
    console.error(err);
    toast('Setup hiccup: ' + (err.message || err));
  }
  showApp();
}

function teardown() {
  state.booted = false;
  state.user = null;
  state.profile = null;
  state.activeContact = null;
  state.contacts = [];
  state.seenIds.clear();
  state.bubbleEls.clear();
  state.unreadBy.clear();
  state.myLikes.clear();
  state.likeCounts.clear();
  if (state.channel) { supabase.removeChannel(state.channel); state.channel = null; }
  $('messages-view').classList.remove('chat-open');
  $('app-view').classList.add('hidden');
  $('auth-view').classList.remove('hidden');
}

function showApp() {
  $('auth-view').classList.add('hidden');
  $('app-view').classList.remove('hidden');
}

function renderSidebar() {
  $('side-avatar').innerHTML = avatarHTML(state.profile, 46);
  $('composer-avatar').innerHTML = avatarHTML(state.profile, 46);
  $('side-username').textContent = '@' + (state.profile?.username || 'you');
  $('side-tags').innerHTML = tagsHTML(state.profile);
}

/* ---------- View switching ---------- */
function showView(name) {
  state.view = name;
  $('messages-view').classList.toggle('hidden', name !== 'messages');
  $('feed-view').classList.toggle('hidden', name !== 'feed');
  $('nav-messages').classList.toggle('active', name === 'messages');
  $('nav-feed').classList.toggle('active', name === 'feed');
}
$('nav-messages').onclick = () => showView('messages');
$('nav-feed').onclick = () => showView('feed');
$('btn-logout').onclick = () => supabase.auth.signOut();

/* ════════════ PHASE 2 · Messaging engine ════════════
   No statuses. No stories. Just people and messages. */

async function loadContacts() {
  const me = state.user.id;
  const [{ data: users, error }, { data: recent }, { data: unread }] = await Promise.all([
    supabase.from('users')
      .select('id,username,native_language,learning_language,avatar_url')
      .neq('id', me).order('username', { ascending: true }),
    supabase.from('messages')
      .select('sender_id,receiver_id,content,created_at')
      .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
      .order('created_at', { ascending: false }).limit(300),
    supabase.from('messages')
      .select('sender_id').eq('receiver_id', me).eq('read_status', false),
  ]);
  if (error) { console.error(error); toast('Could not load people: ' + error.message); }

  const lastMsg = new Map();
  (recent || []).forEach((m) => {
    const other = m.sender_id === me ? m.receiver_id : m.sender_id;
    if (!lastMsg.has(other)) lastMsg.set(other, m);   // first hit = newest
  });

  state.unreadBy = new Map();
  (unread || []).forEach((m) =>
    state.unreadBy.set(m.sender_id, (state.unreadBy.get(m.sender_id) || 0) + 1));

  const list = (users || []).map((u) => ({ ...u, _last: lastMsg.get(u.id) || null }));
  list.sort((a, b) => {
    const ta = a._last ? +new Date(a._last.created_at) : 0;
    const tb = b._last ? +new Date(b._last.created_at) : 0;
    if (ta !== tb) return tb - ta;                    // active convos float to the top
    return a.username.localeCompare(b.username);
  });
  state.contacts = list;
  renderContacts();
}

function renderContacts() {
  const q = $('contact-search').value.trim().toLowerCase();
  const ul = $('contact-list');
  ul.innerHTML = '';
  const matches = state.contacts.filter((c) => !q || c.username.toLowerCase().includes(q));
  $('contacts-empty').classList.toggle('hidden', matches.length > 0);

  matches.forEach((c) => {
    const unreadN = state.unreadBy.get(c.id) || 0;
    const preview = c._last
      ? `${c._last.sender_id === state.user.id ? 'You: ' : ''}${c._last.content}`
      : langLine(c);
    const li = document.createElement('li');
    li.className = 'contact-item' + (state.activeContact?.id === c.id ? ' active' : '');
    li.innerHTML = `
      ${avatarHTML(c, 46)}
      <div class="contact-meta">
        <div class="contact-top">
          <span class="contact-name">${esc(c.username)}</span>
          ${c._last ? `<span class="contact-time">${timeAgo(c._last.created_at)}</span>` : ''}
        </div>
        <div class="contact-sub ${unreadN ? 'has-unread' : ''}">${esc(preview || 'Say hello 👋')}</div>
      </div>
      ${unreadN ? `<span class="badge">${unreadN}</span>` : ''}`;
    li.onclick = () => openChat(c);
    ul.appendChild(li);
  });
}
$('contact-search').addEventListener('input', renderContacts);

async function openChat(contact) {
  state.activeContact = contact;
  $('messages-view').classList.add('chat-open');
  $('chat-empty').classList.add('hidden');
  $('chat-header').classList.remove('hidden');
  $('chat-messages').classList.remove('hidden');
  $('chat-form').classList.remove('hidden');
  $('ch-avatar').innerHTML = avatarHTML(contact, 44);
  $('ch-name').textContent = contact.username;
  $('ch-tags').innerHTML = tagsHTML(contact);

  const box = $('chat-messages');
  box.innerHTML = '<div class="feed-loading"><div class="spinner"></div></div>';
  state.bubbleEls.clear();
  renderContacts();

  const me = state.user.id, c = contact.id;
  const { data, error } = await supabase
    .from('messages').select('*')
    .or(`and(sender_id.eq.${me},receiver_id.eq.${c}),and(sender_id.eq.${c},receiver_id.eq.${me}))`)
    .order('created_at', { ascending: false })
    .limit(300);

  if (state.activeContact?.id !== c) return;   // user switched chats mid-flight
  box.innerHTML = '';
  if (error) {
    box.innerHTML = `<p class="empty-note">Couldn't load messages: ${esc(error.message)}</p>`;
    return;
  }
  (data || []).reverse().forEach((m) => appendBubble(m, { scroll: false }));
  if (!data?.length) {
    box.innerHTML = `<div class="chat-hint glass">Say hello to ${esc(contact.username)} 👋</div>`;
  }
  scrollChatBottom(false);
  $('chat-input').focus();
  await markRead(contact.id);
  await refreshUnread();
}

function bubbleRow(m) {
  const mine = m.sender_id === state.user.id;
  const row = document.createElement('div');
  row.className = `bubble-row ${mine ? 'me' : 'them'}`;
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  row.innerHTML = `
    <div class="bubble ${mine ? 'me' : 'them'}">${esc(m.content).replace(/\n/g, '<br>')}<span class="bubble-meta">${time}${mine ? `<span class="ticks ${m.read_status ? 'read' : ''}">✓✓</span>` : ''}</span></div>`;
  return row;
}

function appendBubble(m, { scroll = true } = {}) {
  if (!state.activeContact) return false;
  const me = state.user.id, c = state.activeContact.id;
  const related =
    (m.sender_id === me && m.receiver_id === c) ||
    (m.sender_id === c && m.receiver_id === me);
  if (!related || state.seenIds.has(m.id)) return false;

  state.seenIds.add(m.id);
  $('chat-messages').querySelector('.chat-hint')?.remove();
  const row = bubbleRow(m);
  $('chat-messages').appendChild(row);
  state.bubbleEls.set(m.id, row);
  if (scroll) scrollChatBottom(true);
  return true;
}

function scrollChatBottom(smooth) {
  const box = $('chat-messages');
  box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

$('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('chat-input');
  const content = input.value.trim();
  if (!content || !state.activeContact) return;
  input.value = '';
  input.focus();

  const { data, error } = await supabase
    .from('messages')
    .insert({ sender_id: state.user.id, receiver_id: state.activeContact.id, content })
    .select().single();

  if (error) { toast('Could not send: ' + error.message); input.value = content; return; }
  appendBubble(data);
  scheduleContactReload();
});

async function markRead(contactId) {
  await supabase.from('messages')
    .update({ read_status: true })
    .eq('receiver_id', state.user.id)
    .eq('sender_id', contactId)
    .eq('read_status', false);
}

async function refreshUnread() {
  const { data } = await supabase
    .from('messages').select('sender_id')
    .eq('receiver_id', state.user.id).eq('read_status', false);
  state.unreadBy = new Map();
  (data || []).forEach((m) =>
    state.unreadBy.set(m.sender_id, (state.unreadBy.get(m.sender_id) || 0) + 1));
  let total = 0;
  state.unreadBy.forEach((v) => { total += v; });
  const badge = $('nav-msg-badge');
  badge.textContent = total;
  badge.classList.toggle('hidden', !total);
  renderContacts();
}

$('btn-back').onclick = () => {
  state.activeContact = null;
  $('messages-view').classList.remove('chat-open');
  $('chat-header').classList.add('hidden');
  $('chat-messages').classList.add('hidden');
  $('chat-form').classList.add('hidden');
  $('chat-empty').classList.remove('hidden');
  renderContacts();
};

/* Jump from the feed straight into a DM with the author. */
function openChatWith(user) {
  showView('messages');
  let c = state.contacts.find((x) => x.id === user.id);
  if (!c) {
    c = {
      id: user.id,
      username: user.username || 'Explorer',
      native_language: user.native_language || null,
      learning_language: user.learning_language || null,
      avatar_url: user.avatar_url || null,
      _last: null,
    };
    state.contacts.unshift(c);
    renderContacts();
  }
  openChat(c);
}

/* ════════════ Realtime (messages + feed) ════════════ */
function subscribeRealtime() {
  if (state.channel) supabase.removeChannel(state.channel);
  state.channel = supabase
    .channel('link-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onMsgInsert)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, onMsgUpdate)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_posts' }, onPostInsert)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Realtime unavailable — run section 6 of schema.sql.');
      }
    });
}

let contactReloadTimer = null;
function scheduleContactReload() {
  clearTimeout(contactReloadTimer);
  contactReloadTimer = setTimeout(loadContacts, 700);
}

async function onMsgInsert({ new: m }) {
  const me = state.user?.id;
  if (!me) return;
  if (m.sender_id !== me && m.receiver_id !== me) return;  // not my conversation
  if (state.seenIds.has(m.id)) return;                     // already rendered locally

  const appended = appendBubble(m);
  if (m.receiver_id === me) {
    if (appended) await markRead(m.sender_id);
    await refreshUnread();
  }
  scheduleContactReload();
}

function onMsgUpdate({ new: m }) {
  const row = state.bubbleEls.get(m.id);
  if (row && m.read_status) row.querySelector('.ticks')?.classList.add('read');
}

function onPostInsert({ new: p }) {
  if (p.author_id === state.user?.id) return;
  state.pendingNew.push(p);
  const pill = $('new-posts-pill');
  pill.textContent = `↑ ${state.pendingNew.length} new post${state.pendingNew.length > 1 ? 's' : ''}`;
  pill.classList.remove('hidden');
}

/* ════════════ PHASE 3 · Global feed (Interpals × Facebook) ════════════ */

function resetFeed() {
  state.feed = { page: 0, done: false, loading: false };
  state.myLikes = new Set();
  state.likeCounts = new Map();
  state.pendingNew = [];
  $('feed-list').innerHTML = '';
  $('new-posts-pill').classList.add('hidden');
  $('feed-end').classList.add('hidden');
}

async function loadFeedPage() {
  const f = state.feed;
  if (f.loading || f.done || !state.user) return;
  f.loading = true;
  $('feed-loading').classList.remove('hidden');

  const from = f.page * PAGE_SIZE;
  const { data: posts, error } = await supabase
    .from('feed_posts')
    .select('*, users(username, avatar_url, native_language, learning_language)')
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    console.error(error);
    toast('Feed error: ' + error.message);
    f.loading = false;
    $('feed-loading').classList.add('hidden');
    return;
  }

  // Pull like counts + which of these I already liked
  const ids = (posts || []).map((p) => p.id);
  if (ids.length) {
    const { data: likes } = await supabase
      .from('post_likes').select('post_id,user_id').in('post_id', ids);
    ids.forEach((id) => state.likeCounts.set(id, 0));
    (likes || []).forEach((l) => {
      state.likeCounts.set(l.post_id, (state.likeCounts.get(l.post_id) || 0) + 1);
      if (l.user_id === state.user.id) state.myLikes.add(l.post_id);
    });
  }

  const list = $('feed-list');
  (posts || []).forEach((p) => list.appendChild(postCard(p)));
  f.page++;
  if ((posts || []).length < PAGE_SIZE) {
    f.done = true;
    if (f.page > 1 || state.contacts.length || true) $('feed-end').classList.remove('hidden');
  }
  if (f.page === 1 && !(posts || []).length) {
    $('feed-end').classList.add('hidden');
    list.innerHTML = `<div class="post glass empty-feed"><h3>The ocean is quiet…</h3><p>Be the first to say something to the world. 🌍</p></div>`;
  }
  f.loading = false;
  $('feed-loading').classList.add('hidden');
}

function postCard(p) {
  const mine = p.author_id === state.user.id;
  const card = document.createElement('article');
  card.className = 'post glass';
  card.dataset.id = p.id;
  card.innerHTML = `
    <div class="post-head">
      ${avatarHTML(p.users, 48)}
      <div class="post-head-meta">
        <button class="post-username ${mine ? '' : 'linkable'}" data-action="profile" type="button">${esc(p.users?.username || 'Explorer')}</button>
        ${tagsHTML(p.users)}
      </div>
      <div class="post-head-right">
        <span class="post-time">${timeAgo(p.created_at)}</span>
        ${mine ? `<button class="icon-btn danger" data-action="delete" title="Delete post" type="button">${icon('trash', 15)}</button>` : ''}
      </div>
    </div>
    <p class="post-content">${esc(p.content).replace(/\n/g, '<br>')}</p>
    ${p.image_url ? `<div class="post-image"><img src="${esc(p.image_url)}" alt="" loading="lazy" /></div>` : ''}
    <div class="post-actions">
      <button class="like-btn ${state.myLikes.has(p.id) ? 'liked' : ''}" data-action="like" type="button" title="Like">
        ${icon('heart', 16)}<span class="like-count">${state.likeCounts.get(p.id) || ''}</span>
      </button>
      ${mine ? '' : `<button class="chip-btn" data-action="message" type="button">${icon('chat', 14)} Message</button>`}
    </div>`;

  card.querySelector('[data-action="like"]').onclick = () => toggleLike(p.id, card);
  card.querySelector('[data-action="delete"]')?.addEventListener('click', () => deletePost(p.id, card));
  const author = { id: p.author_id, ...(p.users || {}) };
  card.querySelector('[data-action="message"]')?.addEventListener('click', () => openChatWith(author));
  if (!mine) card.querySelector('[data-action="profile"]').onclick = () => openChatWith(author);
  const img = card.querySelector('.post-image img');
  if (img) img.onerror = () => img.closest('.post-image').remove();
  return card;
}

async function toggleLike(postId, card) {
  const wasLiked = state.myLikes.has(postId);
  // optimistic update
  state.myLikes[wasLiked ? 'delete' : 'add'](postId);
  state.likeCounts.set(postId, Math.max(0, (state.likeCounts.get(postId) || 0) + (wasLiked ? -1 : 1)));
  paintLike(card, postId);

  const { error } = wasLiked
    ? await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', state.user.id)
    : await supabase.from('post_likes').insert({ post_id: postId, user_id: state.user.id });

  if (error) {   // roll back
    state.myLikes[wasLiked ? 'add' : 'delete'](postId);
    state.likeCounts.set(postId, Math.max(0, (state.likeCounts.get(postId) || 0) + (wasLiked ? 1 : -1)));
    paintLike(card, postId);
    toast('Like failed: ' + error.message);
  }
}

function paintLike(card, postId) {
  const btn = card.querySelector('.like-btn');
  if (!btn) return;
  btn.classList.toggle('liked', state.myLikes.has(postId));
  btn.querySelector('.like-count').textContent = state.likeCounts.get(postId) || '';
  btn.classList.remove('pop');
  void btn.offsetWidth;   // restart the pop animation
  btn.classList.add('pop');
}

async function deletePost(id, card) {
  if (!confirm('Delete this post?')) return;
  const { error } = await supabase.from('feed_posts').delete().eq('id', id);
  if (error) { toast('Delete failed: ' + error.message); return; }
  card.classList.add('fade-out');
  setTimeout(() => card.remove(), 240);
}

$('btn-post').onclick = async () => {
  const contentEl = $('post-content');
  const imgEl = $('post-image-url');
  const content = contentEl.value.trim();
  const image_url = imgEl.value.trim();
  if (!content) { toast('Write something first 🌊'); return; }

  const btn = $('btn-post');
  btn.disabled = true;
  btn.textContent = 'Posting…';
  const { data, error } = await supabase
    .from('feed_posts')
    .insert({ author_id: state.user.id, content, image_url: image_url || null })
    .select().single();
  btn.disabled = false;
  btn.textContent = 'Post 🌊';

  if (error) { toast('Post failed: ' + error.message); return; }

  const post = {
    ...data,
    users: {
      username: state.profile.username,
      avatar_url: state.profile.avatar_url,
      native_language: state.profile.native_language,
      learning_language: state.profile.learning_language,
    },
  };
  state.likeCounts.set(post.id, 0);
  $('feed-list').querySelector('.empty-feed')?.remove();
  $('feed-list').prepend(postCard(post));
  contentEl.value = '';
  imgEl.value = '';
  $('post-image-wrap').classList.add('hidden');
  toast('Posted to the world 🌍');
};

$('btn-add-image').onclick = () => $('post-image-wrap').classList.toggle('hidden');

$('new-posts-pill').onclick = () => {
  resetFeed();
  loadFeedPage();
  $('feed-view').scrollTo({ top: 0, behavior: 'smooth' });
};

/* Infinite scroll */
const feedObserver = new IntersectionObserver(
  (entries) => entries.forEach((en) => en.isIntersecting && loadFeedPage()),
  { rootMargin: '600px' }
);
feedObserver.observe($('feed-sentinel'));

/* ════════════ Profile modal ════════════ */
function pmError(msg) {
  const el = $('pm-error');
  if (!msg) { el.classList.add('hidden'); return; }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function openProfileModal() {
  $('pm-username').value = state.profile?.username || '';
  $('pm-native').value = state.profile?.native_language || '';
  $('pm-learning').value = state.profile?.learning_language || '';
  $('pm-avatar').value = state.profile?.avatar_url || '';
  $('pm-bio').value = state.profile?.bio || '';
  pmError(null);
  $('profile-modal').classList.remove('hidden');
}
$('btn-edit-profile').onclick = openProfileModal;
$('pm-cancel').onclick = () => $('profile-modal').classList.add('hidden');
$('profile-modal').addEventListener('click', (e) => {
  if (e.target.id === 'profile-modal') $('profile-modal').classList.add('hidden');
});

$('pm-save').onclick = async () => {
  const username = $('pm-username').value.trim();
  if (!/^\w{3,20}$/.test(username)) {
    pmError('Username must be 3–20 letters, numbers or underscores.');
    return;
  }
  const payload = {
    username,
    native_language: $('pm-native').value || null,
    learning_language: $('pm-learning').value || null,
    avatar_url: $('pm-avatar').value.trim() || null,
    bio: $('pm-bio').value.trim() || null,
  };
  $('pm-save').disabled = true;
  const { data, error } = await supabase
    .from('users').update(payload).eq('id', state.user.id).select().single();
  $('pm-save').disabled = false;

  if (error) { pmError(error.code === '23505' ? 'That username is taken.' : error.message); return; }
  state.profile = data;
  renderSidebar();
  $('profile-modal').classList.add('hidden');
  toast('Profile saved ✨');
};

/* ---------- Init ---------- */
function fillLangSelect(sel, placeholder) {
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    LANGUAGES.map((l) => `<option value="${l}">${l}</option>`).join('');
}
fillLangSelect($('auth-native'), 'Native language…');
fillLangSelect($('auth-learning'), 'Learning…');
fillLangSelect($('pm-native'), '—');
fillLangSelect($('pm-learning'), '—');
setAuthMode('signin');
