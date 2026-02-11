from flask import Flask, request, jsonify, send_from_directory, g
from stego_engine import embed_message, extract_message
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import os
import random
import json
import time
import uuid
import logging

BASE = os.path.dirname(os.path.abspath(__file__))
FRONT = os.path.join(BASE, '..', 'frontend')
SAMPLE = os.path.join(BASE, '..', 'sample_images')
UPLOAD = os.path.join(BASE, '..', 'uploads')
os.makedirs(UPLOAD, exist_ok=True)

app = Flask(__name__, static_folder=FRONT, static_url_path='')
logging.basicConfig(level=logging.INFO)

DATA_FILE = os.path.join(BASE, 'data.json')
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
SESSION_TTL_SECONDS = 60 * 60 * 24
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 60
rate_limit_store = {}


def now_ms():
    return int(time.time() * 1000)


def default_data():
    return {
        'users': [],
        'sessions': {},
        'chats': [],
        'messages': []
    }


def ensure_data_file():
    if not os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(default_data(), f, indent=2)


def load_data():
    ensure_data_file()
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    base = default_data()
    base.update(data)
    # migrate old chats to include roles/members
    for c in base['chats']:
        c.setdefault('members', [])
        c.setdefault('roles', {})
        c.setdefault('owner', 'unknown')
    return base


def save_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def cleanup_expired_messages(data):
    now = now_ms()
    kept = []
    for m in data.get('messages', []):
        exp = m.get('expiresAt')
        if exp and exp <= now:
            path = m.get('filePath')
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass
        else:
            kept.append(m)
    data['messages'] = kept


def list_sample_images():
    return [x for x in os.listdir(SAMPLE) if x.lower().endswith(('.png', '.jpg', '.jpeg'))]


def get_cover_capacity_bits(path):
    from PIL import Image
    img = Image.open(path).convert('RGB')
    w, h = img.size
    return w * h


def estimate_required_bits(message, password):
    from encryption import encrypt_message
    enc = encrypt_message(message, password)
    payload_bytes = len(enc.encode('utf-8')) + 4
    return payload_bytes * 8


def allowed_file(filename):
    return filename.lower().endswith(('.png', '.jpg', '.jpeg'))


def apply_rate_limit():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr) or 'unknown'
    now = int(time.time())
    arr = [t for t in rate_limit_store.get(ip, []) if now - t < RATE_LIMIT_WINDOW]
    arr.append(now)
    rate_limit_store[ip] = arr
    if len(arr) > RATE_LIMIT_MAX:
        return False
    return True


@app.before_request
def before_request():
    g.request_id = uuid.uuid4().hex[:12]
    if not apply_rate_limit():
        return jsonify({'error': 'Rate limit exceeded', 'request_id': g.request_id}), 429


@app.after_request
def after_request(resp):
    resp.headers['X-Request-ID'] = getattr(g, 'request_id', '-')
    app.logger.info('%s %s %s req=%s', request.method, request.path, resp.status_code, getattr(g, 'request_id', '-'))
    return resp


def get_bearer_token():
    h = request.headers.get('Authorization', '')
    if h.startswith('Bearer '):
        return h.split(' ', 1)[1].strip()
    return None


def get_current_user(data):
    token = get_bearer_token()
    if not token:
        return None, None
    sess = data.get('sessions', {}).get(token)
    if not sess:
        return None, None
    if sess.get('expiresAt', 0) < now_ms():
        data['sessions'].pop(token, None)
        save_data(data)
        return None, None
    email = sess.get('email')
    user = next((u for u in data.get('users', []) if u.get('email') == email), None)
    return user, token


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        data = load_data()
        cleanup_expired_messages(data)
        user, token = get_current_user(data)
        if not user:
            save_data(data)
            return jsonify({'error': 'Unauthorized'}), 401
        g.data = data
        g.user = user
        g.token = token
        return fn(*args, **kwargs)
    return wrapper


def chat_visible_to_user(chat, email):
    return chat.get('owner') == email or email in chat.get('members', [])


def message_visible_to_user(chat, email):
    return chat_visible_to_user(chat, email)


@app.route('/')
def login_page():
    return send_from_directory(FRONT, 'login.html')


@app.route('/chat')
def chat_page():
    return send_from_directory(FRONT, 'index.html')


@app.route('/uploads/<path:f>')
def uploaded(f):
    return send_from_directory(UPLOAD, f)


@app.route('/sample/<path:f>')
def sample_file(f):
    return send_from_directory(SAMPLE, f)


@app.route('/sample-list')
def sample_list():
    return jsonify(list_sample_images())


@app.route('/api/auth/register', methods=['POST'])
def register():
    data = load_data()
    payload = request.get_json() or {}
    email = (payload.get('email') or '').strip().lower()
    username = (payload.get('username') or '').strip()
    password = payload.get('password') or ''
    if not email or not password or not username:
        return jsonify({'error': 'email, username and password required'}), 400
    if next((u for u in data['users'] if u.get('email') == email), None):
        return jsonify({'error': 'User already exists'}), 409

    user = {
        'email': email,
        'username': username,
        'passwordHash': generate_password_hash(password),
        'createdAt': now_ms()
    }
    data['users'].append(user)
    save_data(data)
    return jsonify({'status': 'ok'})


@app.route('/api/auth/login', methods=['POST'])
def login_api():
    data = load_data()
    payload = request.get_json() or {}
    email = (payload.get('email') or '').strip().lower()
    password = payload.get('password') or ''
    user = next((u for u in data['users'] if u.get('email') == email), None)
    if not user or not check_password_hash(user.get('passwordHash', ''), password):
        return jsonify({'error': 'Invalid credentials'}), 401

    token = uuid.uuid4().hex
    data['sessions'][token] = {'email': email, 'expiresAt': now_ms() + SESSION_TTL_SECONDS * 1000}
    save_data(data)
    return jsonify({'status': 'ok', 'token': token, 'user': {'email': user['email'], 'username': user['username']}})


@app.route('/api/auth/logout', methods=['POST'])
@auth_required
def logout_api():
    g.data['sessions'].pop(g.token, None)
    save_data(g.data)
    return jsonify({'status': 'ok'})


@app.route('/api/me', methods=['GET'])
@auth_required
def me_api():
    return jsonify({'status': 'ok', 'user': {'email': g.user['email'], 'username': g.user['username']}})


@app.route('/api/chats', methods=['GET'])
@auth_required
def api_list_chats():
    data = g.data
    q = (request.args.get('q') or '').strip().lower()
    ctype = (request.args.get('type') or '').strip().lower()
    visible = [c for c in data.get('chats', []) if chat_visible_to_user(c, g.user['email'])]
    if ctype in ('private', 'group'):
        visible = [c for c in visible if c.get('type') == ctype]
    if q:
        visible = [c for c in visible if q in (c.get('name') or '').lower() or q in ','.join(c.get('members', [])).lower()]

    messages = data.get('messages', [])
    for c in visible:
        cm = [m for m in messages if m.get('chatId') == c['id']]
        cm.sort(key=lambda x: x.get('createdAt', 0), reverse=True)
        latest = cm[0] if cm else None
        c['latestMessage'] = latest
        c['lastPreview'] = latest.get('preview', '') if latest else c.get('lastPreview', '')
    visible.sort(key=lambda x: (x.get('latestMessage', {}) or {}).get('createdAt', x.get('createdAt', 0)), reverse=True)
    save_data(data)
    return jsonify({'status': 'ok', 'chats': visible})


@app.route('/api/chats', methods=['POST'])
@auth_required
def api_create_chat():
    payload = request.get_json() or {}
    chat_type = payload.get('type', 'private')
    name = (payload.get('name') or '').strip()
    members = payload.get('members') or []
    members = [m.strip().lower() for m in members if isinstance(m, str) and m.strip()]
    owner = g.user['email']
    if chat_type not in ('private', 'group'):
        return jsonify({'error': 'Invalid chat type'}), 400
    if chat_type == 'private' and len(members) != 1:
        return jsonify({'error': 'Private chat requires exactly one peer email'}), 400

    chat_id = uuid.uuid4().hex[:12]
    uniq_members = sorted(set(members + [owner]))
    roles = {owner: 'owner'}
    for m in uniq_members:
        roles.setdefault(m, 'member')
    chat = {
        'id': chat_id,
        'type': chat_type,
        'name': name if name else (members[0] if chat_type == 'private' else 'New Group'),
        'members': uniq_members,
        'roles': roles,
        'owner': owner,
        'createdAt': now_ms(),
        'protected': False,
        'lastPreview': ''
    }
    g.data['chats'].append(chat)
    save_data(g.data)
    return jsonify({'status': 'ok', 'chat': chat})


@app.route('/api/chats/<chat_id>/members', methods=['POST'])
@auth_required
def add_member(chat_id):
    payload = request.get_json() or {}
    email = (payload.get('email') or '').strip().lower()
    role = (payload.get('role') or 'member').strip().lower()
    if role not in ('member', 'admin'):
        return jsonify({'error': 'Invalid role'}), 400
    chat = next((c for c in g.data['chats'] if c['id'] == chat_id), None)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    my_role = chat.get('roles', {}).get(g.user['email'], 'member')
    if my_role not in ('owner', 'admin'):
        return jsonify({'error': 'Only owner/admin can add members'}), 403
    if email and email not in chat['members']:
        chat['members'].append(email)
    chat.setdefault('roles', {})[email] = role
    save_data(g.data)
    return jsonify({'status': 'ok', 'chat': chat})


@app.route('/api/chats/<chat_id>/export', methods=['GET'])
@auth_required
def export_chat(chat_id):
    chat = next((c for c in g.data['chats'] if c['id'] == chat_id), None)
    if not chat or not chat_visible_to_user(chat, g.user['email']):
        return jsonify({'error': 'Chat not found'}), 404
    messages = [m for m in g.data.get('messages', []) if m.get('chatId') == chat_id]
    for m in messages:
        m.pop('filePath', None)
    bundle = {
        'exportedAt': now_ms(),
        'chat': chat,
        'messages': messages
    }
    return jsonify({'status': 'ok', 'bundle': bundle})


@app.route('/api/chat-messages/<chat_id>', methods=['GET'])
@auth_required
def get_messages(chat_id):
    chat = next((c for c in g.data['chats'] if c['id'] == chat_id), None)
    if not chat or not message_visible_to_user(chat, g.user['email']):
        return jsonify({'error': 'Chat not found'}), 404
    msgs = [m for m in g.data.get('messages', []) if m.get('chatId') == chat_id]
    msgs.sort(key=lambda x: x.get('createdAt', 0))
    cleaned = []
    for m in msgs:
        x = dict(m)
        x.pop('filePath', None)
        cleaned.append(x)
    save_data(g.data)
    return jsonify({'status': 'ok', 'messages': cleaned})


@app.route('/api/embed', methods=['POST'])
@auth_required
def api_embed():
    mode = request.form.get('mode', 'upload')
    msg = request.form.get('message', '')
    pw = request.form.get('password', '')
    chat_id = request.form.get('chat_id', '')
    preset = request.form.get('preset', 'balanced')
    ttl_seconds = int(request.form.get('ttl_seconds', '0') or '0')
    read_once = request.form.get('read_once', 'false').lower() == 'true'

    chat = next((c for c in g.data['chats'] if c['id'] == chat_id), None)
    if not chat or not chat_visible_to_user(chat, g.user['email']):
        return jsonify({'error': 'Chat not found'}), 404

    if not msg or not pw:
        return jsonify({'error': 'message and password required'}), 400

    if mode == 'upload':
        if 'image' not in request.files or request.files['image'].filename == '':
            return jsonify({'error': 'no image uploaded'}), 400
        f = request.files['image']
        if not allowed_file(f.filename):
            return jsonify({'error': 'unsupported file type'}), 400
        data_bytes = f.read()
        if len(data_bytes) > MAX_UPLOAD_BYTES:
            return jsonify({'error': 'image too large'}), 400
        f.seek(0)
        cover = os.path.join(UPLOAD, 'user_' + str(now_ms()) + '_' + os.path.basename(f.filename))
        f.save(cover)
    else:
        opts = list_sample_images()
        if not opts:
            return jsonify({'error': 'no sample images found'}), 500
        cover = os.path.join(SAMPLE, random.choice(opts))

    try:
        need_bits = estimate_required_bits(msg, pw)
        cap_bits = get_cover_capacity_bits(cover)
        # low detectability uses fewer effective bits
        factor = {'low': 0.55, 'balanced': 0.75, 'high': 0.95}.get(preset, 0.75)
        if need_bits > int(cap_bits * factor):
            return jsonify({'error': f'message too large for selected preset ({preset}) on this image'}), 400
    except Exception:
        pass

    out_name = f"stego_{random.randint(100000, 999999)}.png"
    out_path = os.path.join(UPLOAD, out_name)
    try:
        embed_message(cover, out_path, msg, pw)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    message_id = uuid.uuid4().hex[:14]
    exp = now_ms() + ttl_seconds * 1000 if ttl_seconds > 0 else None
    preview = 'Hidden message (locked)'
    message_obj = {
        'id': message_id,
        'chatId': chat_id,
        'sender': g.user['email'],
        'stegoUrl': f'/uploads/{out_name}',
        'filePath': out_path,
        'mode': mode,
        'preview': preview,
        'createdAt': now_ms(),
        'expiresAt': exp,
        'readOnce': read_once,
        'openedBy': []
    }
    g.data.setdefault('messages', []).append(message_obj)
    chat['lastPreview'] = preview
    save_data(g.data)

    return jsonify({'status': 'ok', 'stego_url': f'/uploads/{out_name}', 'message_id': message_id, 'expires_at': exp})


@app.route('/api/extract', methods=['POST'])
@auth_required
def api_extract():
    if 'image' not in request.files or request.files['image'].filename == '':
        return jsonify({'error': 'no image uploaded'}), 400
    pw = request.form.get('password', '')
    chat_id = request.form.get('chat_id')
    message_id = request.form.get('message_id')
    if not pw:
        return jsonify({'error': 'password required'}), 400

    f = request.files['image']
    tmp = os.path.join(UPLOAD, 'tmp_' + str(now_ms()) + '_' + os.path.basename(f.filename or 'chat.png'))
    f.save(tmp)

    try:
        m = extract_message(tmp, pw)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass

    if message_id and chat_id:
        msg = next((x for x in g.data.get('messages', []) if x.get('id') == message_id and x.get('chatId') == chat_id), None)
        if msg and msg.get('readOnce'):
            if g.user['email'] in msg.get('openedBy', []):
                return jsonify({'error': 'This burn-after-read message was already opened by you.'}), 410
            msg.setdefault('openedBy', []).append(g.user['email'])
        if msg:
            msg['preview'] = (m[:30] + '…') if len(m) > 30 else m
    save_data(g.data)

    return jsonify({'status': 'ok', 'message': m})


if __name__ == '__main__':
    app.run(debug=True)
