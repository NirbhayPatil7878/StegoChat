let mode = 'upload';
let chats = [];
let currentChatId = null;
let messagesByChat = {};

const token = sessionStorage.getItem('secretsnap_token');
if (!token) window.location.href = '/';

const userLabel = document.getElementById('current-user-label');
const chatListEl = document.getElementById('chat-list');
const chatViewEl = document.getElementById('chat-view');
const chatTitleEl = document.getElementById('chat-title');
const embedStatus = document.getElementById('embed-status');
const extractResult = document.getElementById('extract-result');
const searchInput = document.getElementById('chat-search');
const filterType = document.getElementById('chat-type-filter');

const btnUploadMode = document.getElementById('btn-upload');
const btnRandomMode = document.getElementById('btn-random');
const btnLogout = document.getElementById('btn-logout');
const btnExportChat = document.getElementById('btn-export-chat');

const newChatPopup = document.getElementById('new-chat-popup');
const btnNewChat = document.getElementById('btn-new-chat');
const newChatEmail = document.getElementById('new-chat-email');
const newChatCreate = document.getElementById('new-chat-create');
const newChatCancel = document.getElementById('new-chat-cancel');

const hiddenPopup = document.getElementById('hidden-msg-popup');
const btnOpenHiddenPopup = document.getElementById('btn-open-hidden-popup');
const hmImage = document.getElementById('hm-image');
const hmMessage = document.getElementById('hm-message');
const hmPassword = document.getElementById('hm-password');
const hmPreset = document.getElementById('hm-preset');
const hmTtl = document.getElementById('hm-ttl');
const hmReadOnce = document.getElementById('hm-read-once');
const hmSendBtn = document.getElementById('hm-send-btn');
const hmCancelBtn = document.getElementById('hm-cancel-btn');

const passwordPopup = document.getElementById('password-popup');
const popupPass = document.getElementById('popup-pass');
const popupOpenBtn = document.getElementById('popup-open-btn');
const popupCancelBtn = document.getElementById('popup-cancel-btn');

const messagePopup = document.getElementById('message-popup');
const messagePopupText = document.getElementById('message-popup-text');
const messagePopupClose = document.getElementById('message-popup-close');

const extractImageInput = document.getElementById('extract-image');
const extractPass = document.getElementById('extract-pass');
const btnExtract = document.getElementById('btn-extract');

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  headers.Authorization = `Bearer ${sessionStorage.getItem('secretsnap_token') || ''}`;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function bootstrap() {
  try {
    const me = await api('/api/me');
    userLabel.textContent = me.user.email;
    await loadChats();
  } catch (e) {
    alert('Session expired. Please login again.');
    sessionStorage.clear();
    window.location.href = '/';
  }
}

async function loadChats() {
  const q = encodeURIComponent((searchInput?.value || '').trim());
  const type = encodeURIComponent(filterType?.value || '');
  const data = await api(`/api/chats?q=${q}&type=${type}`);
  chats = data.chats || [];
  renderChatList();
  if (!currentChatId && chats.length) {
    currentChatId = chats[0].id;
    await loadMessages(currentChatId);
  }
  renderChatView();
}

async function loadMessages(chatId) {
  const data = await api(`/api/chat-messages/${chatId}`);
  messagesByChat[chatId] = data.messages || [];
}

function chatName(c) {
  return c.name || (c.type === 'group' ? 'Group Chat' : 'Private Chat');
}

function renderChatList() {
  if (!chats.length) {
    chatListEl.innerHTML = '<div class="chat-placeholder">No chats found.</div>';
    return;
  }
  chatListEl.innerHTML = '';
  chats.forEach(chat => {
    const div = document.createElement('div');
    div.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
    div.innerHTML = `
      <div class="chat-thumb"><div class="avatar-circle">${chatName(chat)[0].toUpperCase()}</div></div>
      <div class="chat-meta">
        <div class="chat-title-row">
          <span class="chat-title">${chatName(chat)}</span>
          <span class="chat-time">${new Date(chat.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        </div>
        <div class="chat-meta-row">
          <small>${chat.lastPreview || ''}</small>
          <span class="badge-protected">${chat.type}</span>
        </div>
      </div>`;
    div.onclick = async () => {
      currentChatId = chat.id;
      await loadMessages(chat.id);
      renderChatList();
      renderChatView();
    };
    chatListEl.appendChild(div);
  });
}

function renderChatView() {
  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) {
    chatTitleEl.textContent = 'No chat selected';
    chatViewEl.innerHTML = '<p class="empty">Select a chat.</p>';
    return;
  }
  chatTitleEl.textContent = `${chatName(chat)} (${chat.type})`;
  const messages = messagesByChat[chat.id] || [];
  if (!messages.length) {
    chatViewEl.innerHTML = '<p class="empty">No hidden messages yet.</p>';
    return;
  }

  chatViewEl.innerHTML = messages.map(m => {
    const exp = m.expiresAt ? `Expires: ${new Date(m.expiresAt).toLocaleString()}` : 'No expiry';
    const once = m.readOnce ? 'Burn-after-read enabled' : 'Reusable';
    return `<div class="bubble sent image-bubble" data-mid="${m.id}">
      <div class="bubble-header">
        <span>${m.sender}</span>
        <div class="bubble-menu-btn">⋮</div>
        <div class="bubble-menu-popup hidden">
          <div class="bubble-menu-item" data-action="open" data-mid="${m.id}">Open</div>
          <div class="bubble-menu-item" data-action="download" data-mid="${m.id}">Download</div>
          <div class="bubble-menu-item" data-action="info" data-mid="${m.id}">Info</div>
        </div>
      </div>
      <img src="${m.stegoUrl}" alt="Stego image">
      <div class="meta">${exp} • ${once}</div>
    </div>`;
  }).join('');
}

btnUploadMode.onclick = () => {
  mode = 'upload';
  btnUploadMode.classList.add('active');
  btnRandomMode.classList.remove('active');
};
btnRandomMode.onclick = () => {
  mode = 'random';
  btnRandomMode.classList.add('active');
  btnUploadMode.classList.remove('active');
};

searchInput?.addEventListener('input', () => loadChats());
filterType?.addEventListener('change', () => loadChats());

btnLogout.onclick = async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
  sessionStorage.clear();
  window.location.href = '/';
};

btnExportChat.onclick = async () => {
  if (!currentChatId) return;
  const data = await api(`/api/chats/${currentChatId}/export`);
  const blob = new Blob([JSON.stringify(data.bundle, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chat-export-${currentChatId}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

btnNewChat.onclick = () => newChatPopup.classList.remove('hidden');
newChatCancel.onclick = () => newChatPopup.classList.add('hidden');
newChatCreate.onclick = async () => {
  const email = newChatEmail.value.trim().toLowerCase();
  if (!email) return alert('Peer email required');
  await api('/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'private', members: [email] })
  });
  newChatPopup.classList.add('hidden');
  newChatEmail.value = '';
  await loadChats();
};

// group create
document.getElementById('btn-group-chat').onclick = () => document.getElementById('group-chat-popup').classList.remove('hidden');
document.getElementById('group-create-cancel').onclick = () => document.getElementById('group-chat-popup').classList.add('hidden');
document.getElementById('group-create-confirm').onclick = async () => {
  const membersRaw = document.getElementById('group-members-input').value.trim();
  const name = document.getElementById('group-name-input').value.trim();
  const members = membersRaw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!members.length) return alert('Add at least one email');
  await api('/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'group', name, members })
  });
  document.getElementById('group-chat-popup').classList.add('hidden');
  await loadChats();
};

btnOpenHiddenPopup.onclick = () => hiddenPopup.classList.remove('hidden');
hmCancelBtn.onclick = () => hiddenPopup.classList.add('hidden');

hmSendBtn.onclick = async () => {
  if (!currentChatId) return alert('Choose chat first');
  const msg = hmMessage.value.trim();
  const pw = hmPassword.value.trim();
  if (!msg || !pw) return alert('Message/password required');
  if (mode === 'upload' && !hmImage.files[0]) return alert('Select image for upload mode');

  const fd = new FormData();
  fd.append('chat_id', currentChatId);
  fd.append('mode', mode);
  fd.append('message', msg);
  fd.append('password', pw);
  fd.append('preset', hmPreset.value || 'balanced');
  fd.append('ttl_seconds', String(parseInt(hmTtl.value || '0', 10) || 0));
  fd.append('read_once', hmReadOnce.checked ? 'true' : 'false');
  if (mode === 'upload') fd.append('image', hmImage.files[0]);

  try {
    await api('/api/embed', { method: 'POST', body: fd });
    embedStatus.textContent = 'Message embedded and sent.';
    hiddenPopup.classList.add('hidden');
    hmMessage.value = ''; hmPassword.value = ''; hmTtl.value = '';
    await loadChats();
    await loadMessages(currentChatId);
    renderChatView();
  } catch (e) {
    alert(e.message);
  }
};

let openingMessage = null;
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('bubble-menu-btn')) {
    const popup = e.target.parentElement.querySelector('.bubble-menu-popup');
    document.querySelectorAll('.bubble-menu-popup').forEach(p => p.classList.add('hidden'));
    popup.classList.toggle('hidden');
    return;
  }
  if (e.target.classList.contains('bubble-menu-item')) {
    const action = e.target.dataset.action;
    const mid = e.target.dataset.mid;
    const messages = messagesByChat[currentChatId] || [];
    const m = messages.find(x => x.id === mid);
    if (!m) return;

    if (action === 'download') {
      const a = document.createElement('a'); a.href = m.stegoUrl; a.download = `stego-${mid}.png`; a.click();
    }
    if (action === 'info') {
      alert(`Sender: ${m.sender}\nCreated: ${new Date(m.createdAt).toLocaleString()}\nRead once: ${m.readOnce ? 'Yes' : 'No'}\nExpires: ${m.expiresAt ? new Date(m.expiresAt).toLocaleString() : 'Never'}`);
    }
    if (action === 'open') {
      openingMessage = m;
      popupPass.value = '';
      passwordPopup.classList.remove('hidden');
    }
  }
});

popupCancelBtn.onclick = () => passwordPopup.classList.add('hidden');
popupOpenBtn.onclick = async () => {
  if (!openingMessage) return;
  const fd = new FormData();
  fd.append('password', popupPass.value.trim());
  fd.append('chat_id', currentChatId);
  fd.append('message_id', openingMessage.id);
  const blob = await (await fetch(openingMessage.stegoUrl)).blob();
  fd.append('image', blob, 'chat.png');
  try {
    const data = await api('/api/extract', { method: 'POST', body: fd });
    messagePopupText.textContent = data.message;
    messagePopup.classList.remove('hidden');
    passwordPopup.classList.add('hidden');
    await loadChats();
    await loadMessages(currentChatId);
    renderChatView();
  } catch (e) {
    alert(e.message);
  }
};

messagePopupClose.onclick = () => messagePopup.classList.add('hidden');

btnExtract.onclick = async () => {
  if (!extractImageInput.files[0]) return (extractResult.textContent = 'Choose image');
  if (!extractPass.value.trim()) return (extractResult.textContent = 'Enter password');
  const fd = new FormData();
  fd.append('image', extractImageInput.files[0]);
  fd.append('password', extractPass.value.trim());
  try {
    const data = await api('/api/extract', { method: 'POST', body: fd });
    extractResult.textContent = 'Revealed: ' + data.message;
  } catch (e) {
    extractResult.textContent = e.message;
  }
};

bootstrap();
