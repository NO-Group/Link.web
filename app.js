/* ============================================================
   LINK — App Edition
   Screen-based mobile web app (hash router):
   #/home · #/explore · #/messages · #/chat/:id · #/profile
   #/user/:id · #/compose · #/edit-profile
   ============================================================ */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* ---------- Supabase connection ---------- */
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
  booted: false,
  pendingCreds: null,     // kept in memory for the waiting room "I've confirmed" button
  lastRoot: '#/home',

  contacts: [],           // all users (+ _last message)
  activeContact: null,
  seenIds: new Set(),
  bubbleEls: new Map(),
  unreadBy: new Map(),

  feed: { page: 0, done: false, loading: false },
  myLikes: new Set(),
  likeCounts: new Map(),
  pendingNew: [],

  channel: null,
};

/* ---------- Utilities ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function timeAgo(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'now';
  const m = s / 60; if (m < 60) return Math.floor(m) + 'm';
  const h = m / 60; if (h < 24) return Math.floor(h) + 'h';
  const d = h / 24; if (d < 7) return Math.floor(d) + 'd';
  return new Date(ts).toLocaleDateString();
}

const ICONS = {
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  chat:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
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

function tagSpans(u) {
  if (!u) return '';
  const n = u.native_language   ? `<span class="tag tag-native">Native: ${esc(u.native_language)}</span>` : '';
  const l = u.learning_language ? `<span class="tag tag-learning">Learning: ${esc(u.learning_language)}</span>` : '';
  return n + l;
}

function tagsHTML(u, center = false) {
  if (!u || (!u.native_language && !u.learning_language)) return '';
  return `<div class="tags${center ? ' center' : ''}">${tagSpans(u)}</div>`;
}

function langLine(u) {
  const bits = [];
  if (u.native_language) bits.push(u.native_language);
  if (u.learning_language) bits.push('→ ' + u.learning_language);
  return bits.join(' ');
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ════════════ ROUTER ════════════ */
const SCREENS = ['home', 'explore', 'messages', 'chat', 'profile', 'user', 'compose', 'edit'];
const ROOT_TABS = { home: 'nav-home', explore: 'nav-explore', messages: 'nav-messages', profile: 'nav-profile' };

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function showScreen(name) {
  SCREENS.forEach((s) => $('screen-' + s).classList.toggle('active', s === name));
  // floating nav: visible on root tabs only
  $('bottom-nav').classList.toggle('hidden', !(name in ROOT_TABS));
  Object.values(ROOT_TABS).forEach((id) => $(id).classList.remove('active'));
  if (name in ROOT_TABS) {
    $(ROOT_TABS[name]).classList.add('active');
    state.lastRoot = '#/' + name;
  }
  $('screens').scrollTop = 0;
}

async function route() {
  if (!state.user) return;
  const hash = location.hash || '#/home';
  const seg = hash.replace(/^#\//, '').split('/');
  const name = seg[0] || 'home';

  switch (name) {
    case 'home':
      showScreen('home');
      break;
    case 'explore':
      showScreen('explore');
      renderExplore();
      break;
    case 'messages':
      showScreen('messages');
      renderConvos();
      break;
    case 'chat':
      showScreen('chat');
      await openChatById(seg[1]);
      break;
    case 'profile':
      showScreen('profile');
      loadMyProfile();
      break;
    case 'user':
      showScreen('user');
      await loadUserProfile(seg[1]);
      break;
    case 'compose':
      showScreen('compose');
      setTimeout(() => $('compose-input').focus(), 150);
      break;
    case 'edit-profile':
      showScreen('edit');
      fillEditForm();
      break;
    default:
      go('#/home');
  }
}
window.addEventListener('hashchange', route);

document.querySelectorAll('#bottom-nav [data-go]').forEach((b) => {
  b.addEventListener('click', () => go(b.dataset.go));
});
$('nav-fab').onclick = () => go('#/compose');

/* ════════════ AUTH ════════════ */
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

      localStorage.setItem('link_pending_profile',
        JSON.stringify({ username, native_language: native, learning_language: learning }));
      state.pendingCreds = { email, password };

      if (!data.session) {
        // Email confirmation is ON in Supabase → show the waiting room
        $('wait-email').textContent = email;
        $('wait-view').classList.remove('hidden');
        $('auth-view').classList.add('hidden');
      }
      // If a session came back, confirmation is OFF → onAuthStateChange boots the app.
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (/confirm/i.test(error.message)) {
          throw new Error('This email isn\'t confirmed yet — tap the link in your inbox first (or resend from the sign-up waiting page).');
        }
        throw error;
      }
    }
  } catch (err) {
    authError(err.message || String(err));
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

/* ---- Waiting room ---- */
$('btn-wait-signin').onclick = () => {
  $('wait-view').classList.add('hidden');
  $('auth-view').classList.remove('hidden');
  setAuthMode('signin');
};

$('btn-confirmed').onclick = async () => {
  const el = $('wait-error');
  el.classList.add('hidden');
  if (!state.pendingCreds) {
    $('btn-wait-signin').click();
    return;
  }
  const btn = $('btn-confirmed');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  const { error } = await supabase.auth.signInWithPassword(state.pendingCreds);
  btn.disabled = false;
  btn.textContent = "I've confirmed — dive in 🌊";
  if (error) {
    el.textContent = 'Not confirmed yet — tap the link in the email first, then try again.';
    el.classList.remove('hidden');
  }
  // success → onAuthStateChange boots the app
};

let resendCooldown = 0;
$('btn-resend').onclick = async () => {
  if (resendCooldown > 0 || !state.pendingCreds) return;
  const { error } = await supabase.auth.resend({ type: 'signup', email: state.pendingCreds.email });
  const note = $('resend-note');
  if (error) {
    note.textContent = 'Could not resend: ' + error.message;
    return;
  }
  resendCooldown = 60;
  const btn = $('btn-resend');
  btn.disabled = true;
  const tick = setInterval(() => {
    resendCooldown--;
    note.textContent = resendCooldown > 0 ? `Email resent ✓ You can resend again in ${resendCooldown}s.` : '';
    if (resendCooldown <= 0) { clearInterval(tick); btn.disabled = false; }
  }, 1000);
  note.textContent = 'Email resent ✓ You can resend again in 60s.';
};

/* ---------- Profile creation (once per account) ---------- */
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
  state.profile = state.profile || { id: state.user.id, username: base };
}

/* ════════════ Boot / teardown ════════════ */
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
    renderChrome();
    await loadContacts();
    await refreshUnread();
    resetFeed();
    loadFeedPage();
    subscribeRealtime();
  } catch (err) {
    console.error(err);
    toast('Setup hiccup: ' + (err.message || err));
  }
  showApp();
  if (!location.hash) location.hash = '#/home';
  route();
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
  $('app-layer').classList.add('hidden');
  $('wait-view').classList.add('hidden');
  $('auth-layer').classList.remove('hidden');
  $('auth-view').classList.remove('hidden');
}

function showApp() {
  $('auth-layer').classList.add('hidden');
  $('app-layer').classList.remove('hidden');
}

function renderChrome() {
  $('teaser-avatar').innerHTML = avatarHTML(state.profile, 40);
  $('compose-avatar').innerHTML = avatarHTML(state.profile, 44);
  $('compose-name').textContent = state.profile?.username || '';
}

/* ════════════ CONTACTS / PEOPLE ════════════ */
async function loadContacts() {
  const me = state.user.id;
  const [{ data: users, error }, { data: recent }, { data: unread }] = await Promise.all([
    supabase.from('users')
      .select('id,username,native_language,learning_language,avatar_url,bio')
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
    if (!lastMsg.has(other)) lastMsg.set(other, m);
  });

  state.unreadBy = new Map();
  (unread || []).forEach((m) =>
    state.unreadBy.set(m.sender_id, (state.unreadBy.get(m.sender_id) || 0) + 1));

  const list = (users || []).map((u) => ({ ...u, _last: lastMsg.get(u.id) || null }));
  list.sort((a, b) => {
    const ta = a._last ? +new Date(a._last.created_at) : 0;
    const tb = b._last ? +new Date(b._last.created_at) : 0;
    if (ta !== tb) return tb - ta;
    return a.username.localeCompare(b.username);
  });
  state.contacts = list;
  refreshVisibleLists();
}

function refreshVisibleLists() {
  if ($('screen-explore').classList.contains('active')) renderExplore();
  if ($('screen-messages').classList.contains('active')) renderConvos();
}

/* ---- EXPLORE (Interpals member discovery) ---- */
function renderExplore() {
  const q = $('explore-search').value.trim().toLowerCase();
  const list = $('explore-list');
  list.innerHTML = '';
  const matches = state.contacts.filter((c) => !q || c.username.toLowerCase().includes(q));
  $('explore-empty').classList.toggle('hidden', matches.length > 0);

  matches.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'person-row';
    row.innerHTML = `
      ${avatarHTML(c, 52)}
      <div class="person-meta">
        <div class="person-name">${esc(c.username)}</div>
        ${tagsHTML(c)}
        ${c.bio ? `<div class="person-sub">${esc(c.bio)}</div>` : ''}
      </div>
      <div class="person-right">
        <button class="chip-btn" type="button">${icon('chat', 14)} Message</button>
      </div>`;
    row.onclick = () => go('#/user/' + c.id);
    row.querySelector('.chip-btn').onclick = (e) => { e.stopPropagation(); go('#/chat/' + c.id); };
    list.appendChild(row);
  });
}
$('explore-search').addEventListener('input', renderExplore);

/* ---- MESSAGES (conversation list) ---- */
function renderConvos() {
  const q = $('msg-search').value.trim().toLowerCase();
  const list = $('convo-list');
  list.innerHTML = '';
  const convos = state.contacts.filter((c) =>
    (c._last || (state.unreadBy.get(c.id) || 0) > 0) &&
    (!q || c.username.toLowerCase().includes(q)));
  $('convo-empty').classList.toggle('hidden', convos.length > 0);

  convos.forEach((c) => {
    const unreadN = state.unreadBy.get(c.id) || 0;
    const preview = c._last
      ? `${c._last.sender_id === state.user.id ? 'You: ' : ''}${c._last.content}`
      : langLine(c);
    const row = document.createElement('div');
    row.className = 'person-row';
    row.innerHTML = `
      ${avatarHTML(c, 52)}
      <div class="person-meta">
        <div class="person-name">${esc(c.username)}</div>
        <div class="person-sub ${unreadN ? 'has-unread' : ''}">${esc(preview || 'Say hello 👋')}</div>
      </div>
      <div class="person-right">
        ${c._last ? `<span class="person-time">${timeAgo(c._last.created_at)}</span>` : ''}
        ${unreadN ? `<span class="badge">${unreadN}</span>` : ''}
      </div>`;
    row.onclick = () => go('#/chat/' + c.id);
    list.appendChild(row);
  });
}
$('msg-search').addEventListener('input', renderConvos);
$('btn-new-chat').onclick = () => go('#/explore');
$('btn-goto-explore').onclick = () => go('#/explore');

/* ════════════ CHAT ════════════ */
async function openChatById(id) {
  if (!id || id === state.user.id) { go('#/messages'); return; }
  let contact = state.contacts.find((x) => x.id === id);
  if (!contact) {
    const { data } = await supabase.from('users')
      .select('id,username,native_language,learning_language,avatar_url,bio')
      .eq('id', id).maybeSingle();
    if (!data) { toast('That user seems to have drifted away.'); go('#/messages'); return; }
    contact = { ...data, _last: null };
  }
  state.activeContact = contact;

  $('chat-avatar').innerHTML = avatarHTML(contact, 40);
  $('chat-name').textContent = contact.username;
  $('ch-tags').innerHTML = tagSpans(contact);
  $('chat-userlink').onclick = () => go('#/user/' + contact.id);

  const box = $('chat-messages');
  box.innerHTML = '<div class="feed-loading"><div class="spinner"></div></div>';
  state.bubbleEls.clear();

  const me = state.user.id;
  const { data, error } = await supabase
    .from('messages').select('*')
    .or(`and(sender_id.eq.${me},receiver_id.eq.${contact.id}),and(sender_id.eq.${contact.id},receiver_id.eq.${me}))`)
    .order('created_at', { ascending: false })
    .limit(300);

  if (state.activeContact?.id !== contact.id) return;
  box.innerHTML = '';
  if (error) {
    box.innerHTML = `<p class="empty-note">Couldn't load messages: ${esc(error.message)}</p>`;
    return;
  }
  (data || []).reverse().forEach((m) => appendBubble(m, { scroll: false }));
  if (!data?.length) {
    box.innerHTML = `<div class="chat-hint">Say hello to ${esc(contact.username)} 👋</div>`;
  }
  scrollChatBottom(false);
  $('chat-input').focus();
  await markRead(contact.id);
  await refreshUnread();
}
$('chat-back').onclick = () => { state.activeContact = null; go('#/messages'); };

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
  if ($('screen-messages').classList.contains('active')) renderConvos();
}

/* ════════════ REALTIME ════════════ */
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
  if (m.sender_id !== me && m.receiver_id !== me) return;
  if (state.seenIds.has(m.id)) return;

  const onChatScreen = $('screen-chat').classList.contains('active');
  const appended = onChatScreen ? appendBubble(m) : false;
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

/* ════════════ FEED (shared rendering) ════════════ */
function resetFeed() {
  state.feed = { page: 0, done: false, loading: false };
  state.myLikes = new Set();
  state.likeCounts = new Map();
  state.pendingNew = [];
  $('feed-list').innerHTML = '';
  $('new-posts-pill').classList.add('hidden');
  $('feed-end').classList.add('hidden');
}

async function hydrateLikes(posts) {
  const ids = (posts || []).map((p) => p.id);
  if (!ids.length) return;
  const { data: likes } = await supabase
    .from('post_likes').select('post_id,user_id').in('post_id', ids);
  ids.forEach((id) => { if (!state.likeCounts.has(id)) state.likeCounts.set(id, 0); });
  (likes || []).forEach((l) => {
    state.likeCounts.set(l.post_id, (state.likeCounts.get(l.post_id) || 0) + 1);
    if (state.user && l.user_id === state.user.id) state.myLikes.add(l.post_id);
  });
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

  await hydrateLikes(posts);
  const list = $('feed-list');
  (posts || []).forEach((p) => list.appendChild(postCard(p)));
  f.page++;
  if ((posts || []).length < PAGE_SIZE) {
    f.done = true;
    if (posts?.length || f.page > 1) $('feed-end').classList.remove('hidden');
  }
  if (f.page === 1 && !(posts || []).length) {
    $('feed-end').classList.add('hidden');
    list.innerHTML = `<div class="post glass empty-feed"><h3>The ocean is quiet…</h3><p>Be the first to say something to the world. Tap the ✏️ below!</p></div>`;
  }
  f.loading = false;
  $('feed-loading').classList.add('hidden');
}

function postCard(p) {
  const mine = state.user && p.author_id === state.user.id;
  const card = document.createElement('article');
  card.className = 'post glass';
  card.dataset.id = p.id;
  card.innerHTML = `
    <div class="post-head">
      ${avatarHTML(p.users, 46)}
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
        ${icon('heart', 15)}<span class="like-count">${state.likeCounts.get(p.id) || ''}</span>
      </button>
      ${mine ? '' : `<button class="chip-btn" data-action="message" type="button">${icon('chat', 14)} Message</button>`}
    </div>`;

  card.querySelector('[data-action="like"]').onclick = () => toggleLike(p.id);
  card.querySelector('[data-action="delete"]')?.addEventListener('click', () => deletePost(p.id, card));
  card.querySelector('[data-action="message"]')?.addEventListener('click', () => go('#/chat/' + p.author_id));
  card.querySelector('[data-action="profile"]').onclick =
    () => go(mine ? '#/profile' : '#/user/' + p.author_id);
  const img = card.querySelector('.post-image img');
  if (img) img.onerror = () => img.closest('.post-image').remove();
  return card;
}

function repaintEverywhere(postId) {
  document.querySelectorAll(`.post[data-id="${postId}"]`).forEach((card) => {
    const btn = card.querySelector('.like-btn');
    if (!btn) return;
    btn.classList.toggle('liked', state.myLikes.has(postId));
    btn.querySelector('.like-count').textContent = state.likeCounts.get(postId) || '';
    btn.classList.remove('pop');
    void btn.offsetWidth;
    btn.classList.add('pop');
  });
}

async function toggleLike(postId) {
  const wasLiked = state.myLikes.has(postId);
  state.myLikes[wasLiked ? 'delete' : 'add'](postId);
  state.likeCounts.set(postId, Math.max(0, (state.likeCounts.get(postId) || 0) + (wasLiked ? -1 : 1)));
  repaintEverywhere(postId);

  const { error } = wasLiked
    ? await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', state.user.id)
    : await supabase.from('post_likes').insert({ post_id: postId, user_id: state.user.id });

  if (error) {
    state.myLikes[wasLiked ? 'add' : 'delete'](postId);
    state.likeCounts.set(postId, Math.max(0, (state.likeCounts.get(postId) || 0) + (wasLiked ? 1 : -1)));
    repaintEverywhere(postId);
    toast('Like failed: ' + error.message);
  }
}

async function deletePost(id, card) {
  if (!confirm('Delete this post?')) return;
  const { error } = await supabase.from('feed_posts').delete().eq('id', id);
  if (error) { toast('Delete failed: ' + error.message); return; }
  document.querySelectorAll(`.post[data-id="${id}"]`).forEach((c) => {
    c.classList.add('fade-out');
    setTimeout(() => c.remove(), 240);
  });
}

$('composer-teaser').onclick = () => go('#/compose');
$('home-refresh').onclick = () => { resetFeed(); loadFeedPage(); toast('Refreshed 🌊'); };
$('new-posts-pill').onclick = () => { resetFeed(); loadFeedPage(); $('screens').scrollTo({ top: 0, behavior: 'smooth' }); };

/* Infinite scroll (rooted in the screens container) */
const feedObserver = new IntersectionObserver(
  (entries) => entries.forEach((en) => {
    if (en.isIntersecting && $('screen-home').classList.contains('active')) loadFeedPage();
  }),
  { root: $('screens'), rootMargin: '600px' }
);
feedObserver.observe($('feed-sentinel'));

/* ════════════ COMPOSE (stylus) ════════════ */
$('compose-back').onclick = () => go(state.lastRoot || '#/home');

$('btn-compose-image').onclick = () => {
  $('compose-imgwrap').classList.toggle('hidden');
  if (!$('compose-imgwrap').classList.contains('hidden')) $('compose-image-url').focus();
};

$('compose-image-url').addEventListener('input', () => {
  const url = $('compose-image-url').value.trim();
  const wrap = $('compose-preview');
  if (!url) { wrap.classList.add('hidden'); return; }
  $('compose-preview-img').src = url;
  wrap.classList.remove('hidden');
});
$('compose-preview-img').onerror = () => $('compose-preview').classList.add('hidden');

$('btn-compose-post').onclick = async () => {
  const content = $('compose-input').value.trim();
  const image_url = $('compose-image-url').value.trim();
  if (!content) { toast('Write something first 🌊'); return; }

  const btn = $('btn-compose-post');
  btn.disabled = true;
  btn.textContent = 'Posting…';
  const { error } = await supabase
    .from('feed_posts')
    .insert({ author_id: state.user.id, content, image_url: image_url || null });
  btn.disabled = false;
  btn.textContent = 'Post 🌊';

  if (error) { toast('Post failed: ' + error.message); return; }

  $('compose-input').value = '';
  $('compose-image-url').value = '';
  $('compose-imgwrap').classList.add('hidden');
  $('compose-preview').classList.add('hidden');
  resetFeed();
  loadFeedPage();
  toast('Posted to the world 🌍');
  go('#/home');
};

/* ════════════ PROFILES ════════════ */
async function profileStats(id) {
  const { data: posts } = await supabase.from('feed_posts').select('id').eq('author_id', id);
  const ids = (posts || []).map((p) => p.id);
  let likes = 0;
  if (ids.length) {
    const { count } = await supabase
      .from('post_likes').select('id', { count: 'exact', head: true }).in('post_id', ids);
    likes = count || 0;
  }
  return { posts: ids.length, likes };
}

async function profilePosts(id, containerId) {
  const container = $(containerId);
  container.innerHTML = '<div class="feed-loading"><div class="spinner"></div></div>';
  const { data: posts, error } = await supabase
    .from('feed_posts')
    .select('*, users(username, avatar_url, native_language, learning_language)')
    .eq('author_id', id)
    .order('created_at', { ascending: false })
    .limit(50);
  container.innerHTML = '';
  if (error) { container.innerHTML = `<p class="empty-note">${esc(error.message)}</p>`; return; }
  if (!posts?.length) {
    container.innerHTML = `<p class="empty-note">No posts yet.</p>`;
    return;
  }
  await hydrateLikes(posts);
  posts.forEach((p) => container.appendChild(postCard(p)));
}

async function loadMyProfile() {
  const p = state.profile;
  $('pf-avatar').innerHTML = avatarHTML(p, 96);
  $('pf-name').textContent = p?.username || 'you';
  $('pf-tags').innerHTML = tagSpans(p);
  $('pf-bio').textContent = p?.bio || 'No bio yet — tap edit and tell the ocean who you are.';
  const stats = await profileStats(state.user.id);
  $('pf-posts-count').textContent = stats.posts;
  $('pf-likes-count').textContent = stats.likes;
  await profilePosts(state.user.id, 'pf-posts');
}

async function loadUserProfile(id) {
  if (!id || id === state.user.id) { go('#/profile'); return; }
  const { data: u } = await supabase
    .from('users').select('*').eq('id', id).maybeSingle();
  if (!u) { toast('That user seems to have drifted away.'); go(state.lastRoot); return; }
  $('up-avatar').innerHTML = avatarHTML(u, 96);
  $('up-name').textContent = u.username;
  $('up-tags').innerHTML = tagSpans(u);
  $('up-bio').textContent = u.bio || 'This explorer hasn\'t written a bio yet.';
  $('btn-up-msg').onclick = () => go('#/chat/' + u.id);
  const stats = await profileStats(u.id);
  $('up-posts-count').textContent = stats.posts;
  $('up-likes-count').textContent = stats.likes;
  await profilePosts(u.id, 'up-posts');
}
$('up-back').onclick = () => go(state.lastRoot || '#/home');

$('btn-signout').onclick = () => supabase.auth.signOut();
$('btn-edit-profile').onclick = () => go('#/edit-profile');
$('btn-edit-profile-2').onclick = () => go('#/edit-profile');

/* ════════════ EDIT PROFILE ════════════ */
function fillEditForm() {
  $('ep-username').value = state.profile?.username || '';
  $('ep-native').value = state.profile?.native_language || '';
  $('ep-learning').value = state.profile?.learning_language || '';
  $('ep-avatar').value = state.profile?.avatar_url || '';
  $('ep-bio').value = state.profile?.bio || '';
  updateEpPreview();
  epError(null);
}

function updateEpPreview() {
  $('ep-avatar-preview').innerHTML = avatarHTML(
    { username: $('ep-username').value || '?', avatar_url: $('ep-avatar').value.trim() || null }, 44);
}
$('ep-avatar').addEventListener('input', updateEpPreview);
$('ep-username').addEventListener('input', updateEpPreview);

function epError(msg) {
  const el = $('ep-error');
  if (!msg) { el.classList.add('hidden'); return; }
  el.textContent = msg;
  el.classList.remove('hidden');
}

$('ep-back').onclick = () => go('#/profile');

$('ep-save').onclick = async () => {
  const username = $('ep-username').value.trim();
  if (!/^\w{3,20}$/.test(username)) {
    epError('Username must be 3–20 letters, numbers or underscores.');
    return;
  }
  const payload = {
    username,
    native_language: $('ep-native').value || null,
    learning_language: $('ep-learning').value || null,
    avatar_url: $('ep-avatar').value.trim() || null,
    bio: $('ep-bio').value.trim() || null,
  };
  $('ep-save').disabled = true;
  const { data, error } = await supabase
    .from('users').update(payload).eq('id', state.user.id).select().single();
  $('ep-save').disabled = false;

  if (error) { epError(error.code === '23505' ? 'That username is taken.' : error.message); return; }
  state.profile = data;
  renderChrome();
  loadContacts();           // refresh my row everywhere
  toast('Profile saved ✨');
  go('#/profile');
};

/* ════════════ Init ════════════ */
function fillLangSelect(sel, placeholder) {
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    LANGUAGES.map((l) => `<option value="${l}">${l}</option>`).join('');
}
fillLangSelect($('auth-native'), 'Native language…');
fillLangSelect($('auth-learning'), 'Learning…');
fillLangSelect($('ep-native'), '—');
fillLangSelect($('ep-learning'), '—');
setAuthMode('signin');
