
let mode = 'upload';

// Track deleted stego image URLs for UI-only deletion persistence (frontend only)
if (typeof window !== 'undefined') {
  if (!window.deletedStegoUrls) {
    window.deletedStegoUrls = new Set();
  }
}

async function loadChatsFromServer(){
  try{
    const res = await fetch('/api/chats');
    const data = await res.json();
    if(data.status==='ok' && Array.isArray(data.chats)){
      chats = data.chats;
      renderChatList();
    }
  }catch(e){
    console.error('Failed to load chats', e);
  }
}
document.addEventListener('DOMContentLoaded', ()=>{
  loadChatsFromServer();
});

let chats = [];
let currentChatId = null;

// elements
const btnUploadMode = document.getElementById('btn-upload');
const btnRandomMode = document.getElementById('btn-random');

const chatListEl = document.getElementById('chat-list');
const chatViewEl = document.getElementById('chat-view');
const chatTitleEl = document.getElementById('chat-title');
const embedStatus = document.getElementById('embed-status');

const extractImageInput = document.getElementById('extract-image');
const extractPass = document.getElementById('extract-pass');
const btnExtract = document.getElementById('btn-extract');
const extractResult = document.getElementById('extract-result');

const btnNewChat = document.getElementById('btn-new-chat');
const newChatPopup = document.getElementById('new-chat-popup');
const newChatEmail = document.getElementById('new-chat-email');
const newChatProtect = document.getElementById('new-chat-protect');
const newChatPassword = document.getElementById('new-chat-password');
const newChatCreate = document.getElementById('new-chat-create');
const newChatCancel = document.getElementById('new-chat-cancel');

const passwordPopup = document.getElementById('password-popup');
const popupPass = document.getElementById('popup-pass');
const popupOpenBtn = document.getElementById('popup-open-btn');
const popupCancelBtn = document.getElementById('popup-cancel-btn');

const infoPopup = document.getElementById('info-popup');
const infoContent = document.getElementById('info-content');
const infoCloseBtn = document.getElementById('info-close-btn');

const messagePopup = document.getElementById('message-popup');
const messagePopupText = document.getElementById('message-popup-text');
const messagePopupClose = document.getElementById('message-popup-close');

const hiddenPopup = document.getElementById('hidden-msg-popup');
const hmImage = document.getElementById('hm-image');
const hmMessage = document.getElementById('hm-message');
const hmPassword = document.getElementById('hm-password');
const hmDecoyToggle = document.getElementById('hm-decoy-toggle');
const hmDecoySection = document.getElementById('hm-decoy-section');
const hmDecoyPass = document.getElementById('hm-decoy-pass');
const hmDecoyMessage = document.getElementById('hm-decoy-message');
const hmSelfDestruct = document.getElementById('hm-self-destruct');
const hmSendBtn = document.getElementById('hm-send-btn');
const hmCancelBtn = document.getElementById('hm-cancel-btn');
const btnOpenHiddenPopup = document.getElementById('btn-open-hidden-popup');

// show current user
const userLabel = document.getElementById('current-user-label');
try {
  const currentUser = JSON.parse(sessionStorage.getItem('secretsnap_current_user') || 'null');
  if (currentUser) {
    userLabel.textContent = currentUser.email;
  } else {
    userLabel.textContent = 'Guest';
  }
} catch (e) {
  userLabel.textContent = 'Guest';
}

// mode toggle
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

// render chat list
function renderChatList() {
  if (!chats.length) {
    chatListEl.innerHTML = '<div class="chat-placeholder">No chats yet. Create a chat to start messaging.</div>';
    return;
  }
  chatListEl.innerHTML = '';
  chats.forEach(chat => {
    const div = document.createElement('div');
    div.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
    div.dataset.id = chat.id;

    const created = chat.createdAt ? new Date(chat.createdAt) : new Date();
    const timeStr = created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const firstLetter = (chat.peerEmail || 'C')[0].toUpperCase();

    div.innerHTML = `
      <div class="chat-thumb">
        <div class="avatar-circle">${firstLetter}</div>
      </div>
      <div class="chat-meta">
        <div class="chat-title-row">
          <span class=\"chat-title\">${chat.name || chat.peerEmail || 'Chat #' + (chat.shortId||chat.id)}</span>
          <span class="chat-time">${timeStr}</span>
        </div>
        <div class="chat-meta-row">
          <small>${chat.lastPreview}</small>
          ${chat.protected ? '<span class="badge-protected">Password Protected</span>' :
            (chat.unread ? '<span class="unread-dot"></span>' : '')}
        </div>
      </div>
    `;

    div.addEventListener('click', () => {
      currentChatId = chat.id;
      renderChatList();
      renderChatView();
    });

    chatListEl.appendChild(div);
  });
}

// render chat view
function renderChatView() {
  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) {
    chatTitleEl.textContent = 'No chat selected';
    chatViewEl.innerHTML = '<p class="empty">Select a chat or create a new one to start messaging.</p>';
    return;
  }
  chatTitleEl.textContent = chat.peerEmail || `Chat #${chat.shortId}`;

  if (!chat.stegoUrl) {
    chatViewEl.innerHTML = '<p class="empty">No hidden messages yet. Click "Send Hidden Message".</p>';
    return;
  }

  const html = `
    <div class="bubble sent image-bubble" data-id="${chat.id}">
      <div class="bubble-header">
        <span>Hidden image sent</span>
        <div class="bubble-menu-btn">⋮</div>
        <div class="bubble-menu-popup hidden">
          <div class="bubble-menu-item" data-action="open" data-id="${chat.id}">Open</div>
          <div class="bubble-menu-item" data-action="download" data-id="${chat.id}">Download</div>
          <div class="bubble-menu-item" data-action="info" data-id="${chat.id}">Info</div>
          <div class="bubble-menu-item" data-action="delete" data-id="${chat.id}">Delete</div>
        </div>
      </div>
      <img src="${chat.stegoUrl}" alt="Stego image">
      <div class="meta">Cover mode: ${chat.mode === 'upload' ? 'User image' : 'Random image'}</div>
    </div>
  `;
  
  // Skip rendering stego image if it was deleted in this session
  try {
    if (typeof window !== 'undefined' && window.deletedStegoUrls && chat && chat.stegoUrl && window.deletedStegoUrls.has(chat.stegoUrl)) {
      console.debug('render: skipping deleted stegoUrl', chat.stegoUrl);
      html = ''; // clear html so it doesn't reappear
    }
  } catch (e) { console.error(e); }
chatViewEl.innerHTML = html;
  chatViewEl.scrollTop = chatViewEl.scrollHeight;
}

// New Chat modal
if (btnNewChat) btnNewChat.onclick = () => {
  newChatEmail.value = '';
  newChatProtect.checked = false;
  newChatPassword.value = '';
  newChatPassword.disabled = true;
  newChatPopup.classList.remove('hidden');
};

if (newChatProtect) newChatProtect.onchange = () => {
  newChatPassword.disabled = !newChatProtect.checked;
};

if (newChatCancel) newChatCancel.onclick = () => {
  newChatPopup.classList.add('hidden');
};

if (newChatCreate) newChatCreate.onclick = () => {
  const email = newChatEmail.value.trim();
  const protect = newChatProtect.checked;
  const chatPw = newChatPassword.value.trim();

  if (!email) {
    alert('Please enter user email');
    return;
  }
  if (protect && !chatPw) {
    alert('Please enter chat password');
    return;
  }

  const id = Date.now();
  const shortId = String(id).slice(-4);
  const now = new Date();

  const chat = {
    id,
    shortId,
    peerEmail: email,
    stegoUrl: null,
    mode: 'upload',
    lastPreview: 'No messages yet',
    createdAt: now.toISOString(),
    unread: false,
    protected: protect,
    chatPassword: chatPw || null,
    selfDestruct: false
  };

  chats.unshift(chat);
  currentChatId = id;
  renderChatList();
  renderChatView();
  newChatPopup.classList.add('hidden');
};

// open hidden message popup
btnOpenHiddenPopup.onclick = () => {
  if (!currentChatId) {
    alert('Please create or select a chat first.');
    return;
  }
  hmImage.value = '';
  hmMessage.value = '';
  hmPassword.value = '';
  hmDecoyToggle.checked = false;
  hmDecoySection.classList.add('hidden');
  hmDecoyPass.value = '';
  hmDecoyMessage.value = '';
  hmSelfDestruct.checked = false;
  hiddenPopup.classList.remove('hidden');
};

hmDecoyToggle.onchange = () => {
  hmDecoySection.classList.toggle('hidden', !hmDecoyToggle.checked);
};

if (hmCancelBtn) hmCancelBtn.onclick = () => hiddenPopup.classList.add('hidden');

// send hidden message (embed)
if (hmSendBtn) hmSendBtn.onclick = async () => {
  embedStatus.textContent = '';
  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) {
    alert('No active chat');
    return;
  }
  const msg = hmMessage.value.trim();
  const pw = hmPassword.value.trim();
  if (!msg || !pw) {
    alert('Secret message and image password are required.');
    return;
  }
  if (!hmImage.files[0] && mode === 'upload') {
    alert('Please choose a cover image or switch to Random Image mode.');
    return;
  }

  const fd = new FormData();
  fd.append('mode', mode);
  fd.append('message', msg);
  fd.append('password', pw);

  if (mode === 'upload') {
    fd.append('image', hmImage.files[0]);
  }

  const decoyEnabled = hmDecoyToggle.checked;
  const decoyPass = hmDecoyPass.value.trim();
  const decoyMsg = hmDecoyMessage.value.trim();
  const selfDestruct = hmSelfDestruct.checked;

  // For now, decoy data is not used by backend; kept on client only
  chat.decoy = decoyEnabled ? { password: decoyPass, message: decoyMsg } : null;
  chat.selfDestruct = selfDestruct;
  chat.imagePassword = pw;

  try {
    const res = await fetch('/api/embed', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Error embedding message.');
      return;
    }
    chat.stegoUrl = data.stego_url;
    chat.mode = mode;
    chat.lastPreview = 'Hidden message (locked)';
    chat.unread = true;
    renderChatList();
    renderChatView();
    embedStatus.textContent = 'Hidden image created for this chat.';
    hiddenPopup.classList.add('hidden');
  } catch (err) {
    console.error(err);
    alert('Network error while embedding.');
  }
};

// bottom extract bar (manual)
if (btnExtract) btnExtract.onclick = async () => {
  extractResult.textContent = 'Revealing message...';
  const password = extractPass.value.trim();
  if (!password) {
    extractResult.textContent = 'Password is required.';
    return;
  }
  if (!extractImageInput.files[0]) {
    extractResult.textContent = 'Please choose a stego image.';
    return;
  }

  const fd = new FormData();
  fd.append('image', extractImageInput.files[0]);
  fd.append('password', password);

  try {
    const res = await fetch('/api/extract', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      extractResult.textContent = data.error || 'Error extracting message.';
      return;
    }
    const msg = data.message || '';
    extractResult.textContent = 'Revealed: ' + msg;
  } catch (err) {
    console.error(err);
    extractResult.textContent = 'Network error while extracting.';
  }
};

// bubble menu
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('bubble-menu-btn')) {
    const bubble = e.target.closest('.image-bubble');
    const popup = bubble.querySelector('.bubble-menu-popup');
    document.querySelectorAll('.bubble-menu-popup').forEach(p => p.classList.add('hidden'));
    if (popup) popup.classList.toggle('hidden');
    e.stopPropagation();
    return;
  } else if (!e.target.classList.contains('bubble-menu-item')) {
    document.querySelectorAll('.bubble-menu-popup').forEach(p => p.classList.add('hidden'));
  }

  if (!e.target.classList.contains('bubble-menu-item')) return;


  // determine action and chat id (support id or shortId)
  const action = e.target.dataset.action;
  const chatId = e.target.dataset.id || e.target.dataset.shortId || e.target.dataset.msgId;
  if (!action) {
    console.debug('bubble-menu: no action dataset on target', e.target);
    return;
  }
  console.debug('bubble-menu click', { action, chatId });

  // try to resolve chat object robustly
  let chat = null;
  if (chatId) {
    // try exact id match or shortId match
    chat = (Array.isArray(chats) && chats.find(c => String(c.id) === String(chatId))) ||
           (Array.isArray(chats) && chats.find(c => String(c.shortId) === String(chatId)));
  }

  // fallback: if viewing a single chat, try currentChat or currentChatId if present
  if (!chat) {
    if (typeof currentChat !== 'undefined' && currentChat && (String(currentChat.id) === String(chatId) || String(currentChat.shortId) === String(chatId))) {
      chat = currentChat;
    } else if (typeof currentChatId !== 'undefined' && String(currentChatId) === String(chatId)) {
      chat = (Array.isArray(chats) && chats.find(c => String(c.id) === String(currentChatId)));
    } else if (!chat) {
      // last resort: try to build minimal chat object from DOM (grab image src)
      const bubble = e.target.closest('.image-bubble') || e.target.closest('.bubble') || e.target.closest('[data-id]');
      if (bubble) {
        const img = bubble.querySelector('img');
        if (img && img.src) {
          chat = { id: chatId || null, stegoUrl: img.src, shortId: chatId || null };
          console.debug('bubble-menu: constructed chat from DOM', chat);
        }
      }
    }
  }

  if (!chat) {
    console.warn('bubble-menu: could not resolve chat for action', { action, chatId });
    return;
  }
if (action === 'open') {
    openPasswordPopup(chat);
  }
  if (action === 'download') {
    const a = document.createElement('a');
    a.href = chat.stegoUrl;
    a.download = `secretsnap-${chat.shortId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  if (action === 'info') {
    openInfoPopup(chat);
  }
  
  
  if (action === 'delete') {
    // Confirm deletion
    if (!confirm('Delete this hidden image from this chat?')) {
      return;
    }

    // Try to find the bubble element in the DOM
    const bubbleEl =
      e.target.closest('.image-bubble') ||
      e.target.closest('.bubble') ||
      e.target.closest('[data-msg-id]') ||
      e.target.closest('[data-id]');

    // Mark this stego URL as deleted for this session (so it does not re-render)
    try {
      if (typeof window !== 'undefined' && window.deletedStegoUrls && chat && chat.stegoUrl) {
        window.deletedStegoUrls.add(chat.stegoUrl);
        console.debug('bubble-menu: marked stegoUrl deleted (via chat object)', chat.stegoUrl);
      }
    } catch (err) {
      console.error('Error tracking deleted stegoUrl:', err);
    }

    // Clear stego image from this chat object so future renders treat it as empty
    try {
      if (chat) {
        chat.stegoUrl = null;
        chat.lastPreview = 'Hidden image deleted';
        chat.unread = false;
      }
    } catch (err) {
      console.error('Error clearing chat stegoUrl:', err);
    }

    // Remove bubble element from DOM if present
    if (bubbleEl && bubbleEl.remove) {
      try {
        bubbleEl.remove();
      } catch (err) {
        console.error('Error removing bubble element:', err);
      }
    }

    // Refresh UI
    try {
      if (typeof renderChatList === 'function') renderChatList();
      if (typeof renderChatView === 'function') renderChatView();
    } catch (err) {
      console.error('Error refreshing view after delete:', err);
    }

    return;
  }

});

// open password popup for chat
function openPasswordPopup(chat) {
  popupPass.value = '';
  passwordPopup.classList.remove('hidden');

  if (popupOpenBtn) popupOpenBtn.onclick = async () => {
    const password = popupPass.value.trim();
    if (!password) return;

    // decoy logic (UI only)
    if (chat.decoy && chat.decoy.password && password === chat.decoy.password) {
      messagePopupText.textContent = chat.decoy.message || '(No decoy message configured)';
      messagePopup.classList.remove('hidden');
      passwordPopup.classList.add('hidden');
      return;
    }

    const fd = new FormData();
    fd.append('password', password);
    const resImg = await fetch(chat.stegoUrl);
    const blob = await resImg.blob();
    fd.append('image', blob, 'chat.png');

    const res = await fetch('/api/extract', { method: 'POST', body: fd });
    const data = await res.json();

    if (res.ok) {
      const msg = data.message || '';
      chat.lastPreview = msg.length > 20 ? msg.slice(0, 20) + '…' : msg;
      chat.unread = false;
      messagePopupText.textContent = msg;
      messagePopup.classList.remove('hidden');

      if (chat.selfDestruct) {
        chat.stegoUrl = null;
        chat.lastPreview = 'Message self-destructed';
      }
      renderChatList();
      renderChatView();
    } else {
      alert(data.error || 'Error extracting message.');
    }
    passwordPopup.classList.add('hidden');
  };

  if (popupCancelBtn) popupCancelBtn.onclick = () => passwordPopup.classList.add('hidden');
}

// info popup
function openInfoPopup(chat) {
  const created = chat.createdAt ? new Date(chat.createdAt) : new Date();
  const createdStr = created.toLocaleString();
  const modeLabel = chat.mode === 'upload' ? 'User uploaded image' : 'Random system image';
  const status = chat.stegoUrl ? (chat.unread ? 'Locked' : 'Opened') : 'No active stego image';

  infoContent.innerHTML = `
    <b>Chat partner:</b> ${chat.peerEmail}<br>
    <b>Chat ID:</b> #${chat.shortId}<br>
    <b>Cover Mode:</b> ${modeLabel}<br>
    <b>Status:</b> ${status}<br>
    <b>Created:</b> ${createdStr}<br>
    ${chat.protected ? '<b>Chat protected with password.</b><br>' : ''}
    ${chat.selfDestruct ? '<b>Self-destruct enabled.</b><br>' : ''}
    ${chat.stegoUrl ? '<b>Stego URL:</b> <span style="word-break:break-all;">' + location.origin + chat.stegoUrl + '</span>' : ''}
  `;
  infoPopup.classList.remove('hidden');
}

if (infoCloseBtn) infoCloseBtn.onclick = () => infoPopup.classList.add('hidden');

// message popup close
messagePopupClose.onclick = () => messagePopup.classList.add('hidden');

// initial
renderChatList();
renderChatView();



// Group chat UI handlers (ensure present)
document.addEventListener('DOMContentLoaded', function(){
  const btnGroup = document.getElementById('btn-group-chat');
  const popup = document.getElementById('group-chat-popup');
  const cancel = document.getElementById('group-create-cancel');
  const confirm = document.getElementById('group-create-confirm');
  if(btnGroup && popup){
    btnGroup.addEventListener('click', ()=> { popup.classList.remove('hidden'); popup.querySelector('#group-members-input').focus(); });
  }
  if(cancel){
    cancel.addEventListener('click', ()=> { popup.classList.add('hidden'); });
  }
  if(confirm){
    confirm.addEventListener('click', async ()=> {
      const membersRaw = document.getElementById('group-members-input').value.trim();
      const name = document.getElementById('group-name-input').value.trim();
      if(!membersRaw){ alert('Please enter at least one member email'); return; }
      const members = membersRaw.split(',').map(s=>s.trim()).filter(Boolean);
      const owner = (document.getElementById('current-user-label') && document.getElementById('current-user-label').textContent) || 'admin@gmail.com';
      try{
        const res = await fetch('/api/chats', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'group', name: name, members: members, owner: owner}) });
        const data = await res.json();
        if(data.status === 'ok'){
          // ensure name populated
          if(!data.chat.name || data.chat.name.trim()===''){
            data.chat.name = data.chat.members && data.chat.members.length ? data.chat.members.join(', ') : (data.chat.owner || 'Group');
          }
          // add to local chats and re-render list if renderChatList exists
          if(typeof chats !== 'undefined' && typeof renderChatList === 'function'){
            chats.push(data.chat);
            renderChatList();
          }
          popup.classList.add('hidden');
        } else {
          alert('Failed to create group: ' + (data.error || JSON.stringify(data)));
        }
      }catch(err){ console.error(err); alert('Error creating group'); }
    });
  }
});



// Message options handlers (added to support Open/Download/Info/Delete)
function downloadImage(filename, url){ 
  // create link and click
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'stego-image.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function deleteMessageById(msgId){
  // frontend-only: remove message from UI and optionally call backend (not implemented)
  const el = document.querySelector('[data-msg-id="' + msgId + '"]');
  if(el) el.remove();
  // TODO: call backend to delete stored file/message if needed
}

function openMessageInNewTab(url){
  window.open(url, '_blank');
}

function showMessageInfo(msg){
  alert('Message info:\n' + JSON.stringify(msg, null, 2));
}