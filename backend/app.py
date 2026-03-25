
from flask import Flask, request, jsonify, send_from_directory
from stego_engine import embed_message, extract_message
import os, random, io, re, uuid, json, time, math, hashlib, mimetypes
from PIL import Image, UnidentifiedImageError

BASE = os.path.dirname(os.path.abspath(__file__))
FRONT = os.path.join(BASE, '..', 'frontend')
SAMPLE = os.path.join(BASE, '..', 'sample_images')
UPLOAD = os.path.join(BASE, '..', 'uploads')
os.makedirs(UPLOAD, exist_ok=True)

app = Flask(__name__, static_folder=FRONT, static_url_path='')

ALLOWED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg'}
PASSWORD_PATTERNS = [
    (re.compile(r'\bpassword\b', re.I), 'Contains password keyword'),
    (re.compile(r'\botp\b|\bone[- ]?time\b|\bverification code\b', re.I), 'Contains OTP-related phrase'),
    (re.compile(r'\b\d{4,8}\b'), 'Contains numeric code that may be an OTP or PIN'),
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'), 'Contains email address'),
    (re.compile(r'\bsk_[A-Za-z0-9]{16,}\b'), 'Contains API-style secret key'),
    (re.compile(r'\b0x[a-fA-F0-9]{40}\b'), 'Contains wallet address'),
    (re.compile(r'\b[A-Fa-f0-9]{32,}\b'), 'Contains long token or hash-like value'),
]

def serve_frontend_page(filename):
    return send_from_directory(FRONT, filename)

@app.route('/')
def login():
    return serve_frontend_page('login.html')

@app.route('/chat')
def chat_page():
    return serve_frontend_page('index.html')

@app.route('/embed')
@app.route('/embed.html')
def embed_page():
    return serve_frontend_page('embed.html')

@app.route('/extract')
@app.route('/extract.html')
def extract_page():
    return serve_frontend_page('extract.html')

@app.route('/settings')
@app.route('/settings.html')
def settings_page():
    return serve_frontend_page('settings.html')

@app.route('/uploads/<path:f>')
def uploaded(f):
    return send_from_directory(UPLOAD, f)

@app.route('/sample/<path:f>')
def sample_file(f):
    return send_from_directory(SAMPLE, f)

@app.route('/sample-list')
def sample_list():
    files = [x for x in os.listdir(SAMPLE) if x.lower().endswith(('.png', '.jpg', '.jpeg'))]
    return jsonify(files)

@app.route('/api/embed', methods=['POST'])
def api_embed():
    mode = request.form.get('mode', 'upload')
    msg = request.form.get('message', '')
    pw = request.form.get('password', '')
    decoy_pw = request.form.get('decoy_password', '').strip()
    decoy_msg = request.form.get('decoy_message', '').strip()
    if not msg or not pw:
        return jsonify({'error': 'message and password required'}), 400
    if decoy_pw and decoy_pw == pw:
        return jsonify({'error': 'decoy password must be different from the real password'}), 400
    if bool(decoy_pw) != bool(decoy_msg):
        return jsonify({'error': 'decoy password and decoy message must both be provided'}), 400

    if mode == 'upload':
        if 'image' not in request.files or request.files['image'].filename == '':
            return jsonify({'error': 'no image uploaded'}), 400
        f = request.files['image']
        cover = os.path.join(UPLOAD, 'user_' + f.filename)
        f.save(cover)
    else:
        opts = [x for x in os.listdir(SAMPLE) if x.lower().endswith(('.png', '.jpg', '.jpeg'))]
        if not opts:
            return jsonify({'error': 'no sample images found'}), 500
        c = random.choice(opts)
        cover = os.path.join(SAMPLE, c)

    out_name = f"stego_{random.randint(100000, 999999)}.png"
    out_path = os.path.join(UPLOAD, out_name)
    try:
        embed_message(
            cover,
            out_path,
            msg,
            pw,
            decoy_message=decoy_msg or None,
            decoy_password=decoy_pw or None,
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    return jsonify({
        'status': 'ok',
        'stego_url': f'/uploads/{out_name}',
        'decoy_enabled': bool(decoy_pw and decoy_msg),
    })

@app.route('/api/extract', methods=['POST'])
def api_extract():
    if 'image' not in request.files or request.files['image'].filename == '':
        return jsonify({'error': 'no image uploaded'}), 400
    pw = request.form.get('password', '')
    if not pw:
        return jsonify({'error': 'password required'}), 400

    f = request.files['image']
    inspection = inspect_image_file(f)
    if inspection['malformed']:
        return jsonify({'error': 'malformed or unreadable image'}), 400
    tmp = os.path.join(UPLOAD, 'tmp_' + f.filename)
    f.save(tmp)
    try:
        m = extract_message(tmp, pw)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'status': 'ok', 'message': m, 'inspection': inspection})


DATA_FILE = os.path.join(BASE, 'data.json')
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'w') as f:
        json.dump({'chats': [], 'dead_drops': {}}, f)

def load_data():
    with open(DATA_FILE,'r') as f:
        data = json.load(f)
    data.setdefault('chats', [])
    data.setdefault('dead_drops', {})
    return data

def save_data(data):
    with open(DATA_FILE,'w') as f:
        json.dump(data, f, indent=2)

def scan_message_risk(message: str):
    findings = []
    for pattern, label in PASSWORD_PATTERNS:
        if pattern.search(message):
            findings.append(label)
    findings = list(dict.fromkeys(findings))

    if any('secret key' in item.lower() or 'token' in item.lower() or 'wallet' in item.lower() for item in findings):
        level = 'suspicious'
    elif findings:
        level = 'risky'
    else:
        level = 'safe'
    return {
        'status': 'ok',
        'level': level,
        'findings': findings,
        'should_hide': bool(findings),
    }

def _entropy(raw: bytes):
    if not raw:
        return 0.0
    counts = [0] * 256
    for byte in raw:
        counts[byte] += 1
    total = len(raw)
    return -sum((count / total) * math.log2(count / total) for count in counts if count)

def inspect_image_file(file_storage):
    raw = file_storage.read()
    file_storage.seek(0)
    filename = (file_storage.filename or '').strip()
    ext = os.path.splitext(filename)[1].lower()
    mimetype = file_storage.mimetype or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    reasons = []
    malformed = False
    image_info = {'width': None, 'height': None, 'mode': None, 'format': None}

    if ext and ext not in ALLOWED_IMAGE_EXTENSIONS:
        reasons.append('Suspicious extension for image upload')

    try:
        img = Image.open(io.BytesIO(raw))
        img.verify()
        img = Image.open(io.BytesIO(raw)).convert('RGB')
        image_info = {
            'width': img.width,
            'height': img.height,
            'mode': img.mode,
            'format': Image.open(io.BytesIO(raw)).format,
        }
        pixels = list(img.getdata())
        if pixels:
            lsb_total = len(pixels) * 3
            lsb_ones = sum((r & 1) + (g & 1) + (b & 1) for r, g, b in pixels[: min(len(pixels), 50000)])
            sample_total = min(len(pixels), 50000) * 3
            modified_density = lsb_ones / sample_total if sample_total else 0.0
            anomaly_score = round(abs(modified_density - 0.5) * 200, 2)
        else:
            modified_density = 0.0
            anomaly_score = 0.0
    except (UnidentifiedImageError, OSError, ValueError):
        malformed = True
        modified_density = 0.0
        anomaly_score = 100.0
        reasons.append('Malformed or unreadable image payload')

    if raw and len(raw) > 8 * 1024 * 1024:
        reasons.append('Oversized image payload')
    if mimetype not in ('image/png', 'image/jpeg', 'application/octet-stream'):
        reasons.append('Fake or unexpected MIME type')
    entropy = round(_entropy(raw[: min(len(raw), 65536)]), 3)
    if entropy > 7.85:
        reasons.append('High entropy payload may indicate embedded data or encrypted content')
    if anomaly_score > 18:
        reasons.append('LSB anomaly score is elevated')

    level = 'safe'
    if malformed:
        level = 'suspicious'
    elif reasons:
        level = 'risky'

    return {
        'status': 'ok',
        'level': level,
        'reasons': reasons,
        'malformed': malformed,
        'entropy': entropy,
        'pixel_anomaly_score': anomaly_score,
        'modified_channel_density': round(modified_density, 4),
        'size_bytes': len(raw),
        'mimetype': mimetype,
        'filename': filename,
        'image': image_info,
    }

@app.route('/api/scan-risk', methods=['POST'])
def api_scan_risk():
    payload = request.get_json(silent=True) or {}
    message = (payload.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'message required'}), 400
    return jsonify(scan_message_risk(message))

@app.route('/api/inspect-image', methods=['POST'])
@app.route('/api/forensic-analyze', methods=['POST'])
def api_inspect_image():
    if 'image' not in request.files or request.files['image'].filename == '':
        return jsonify({'error': 'no image uploaded'}), 400
    return jsonify(inspect_image_file(request.files['image']))

@app.route('/api/dead-drop', methods=['POST'])
def api_create_dead_drop():
    payload = request.get_json(silent=True) or {}
    message = (payload.get('message') or '').strip()
    try:
        ttl_hours = int(payload.get('ttl_hours') or 24)
    except (TypeError, ValueError):
        return jsonify({'error': 'ttl_hours must be an integer'}), 400
    if not message:
        return jsonify({'error': 'message required'}), 400
    if ttl_hours < 1 or ttl_hours > 168:
        return jsonify({'error': 'ttl_hours must be between 1 and 168'}), 400

    token = uuid.uuid4().hex[:16]
    now_ms = int(time.time() * 1000)
    expires_at = now_ms + ttl_hours * 3600 * 1000
    data = load_data()
    data['dead_drops'][token] = {
        'message': message,
        'createdAt': now_ms,
        'expiresAt': expires_at,
        'used': False,
    }
    save_data(data)
    return jsonify({'status': 'ok', 'token': token, 'expiresAt': expires_at})

@app.route('/api/dead-drop/<token>', methods=['GET'])
def api_fetch_dead_drop(token):
    data = load_data()
    drop = data.get('dead_drops', {}).get(token)
    now_ms = int(time.time() * 1000)
    if not drop:
        return jsonify({'error': 'dead drop not found'}), 404
    if drop.get('used'):
        return jsonify({'error': 'dead drop already opened'}), 410
    if drop.get('expiresAt', 0) < now_ms:
        data['dead_drops'].pop(token, None)
        save_data(data)
        return jsonify({'error': 'dead drop expired'}), 410

    drop['used'] = True
    save_data(data)
    return jsonify({'status': 'ok', 'message': drop.get('message', ''), 'createdAt': drop.get('createdAt'), 'expiresAt': drop.get('expiresAt')})

@app.route('/api/chats', methods=['GET'])
def api_list_chats():
    data = load_data()
    return jsonify({'status':'ok', 'chats': data.get('chats', [])})

@app.route('/api/chats', methods=['POST'])
def api_create_chat():
    payload = request.get_json() or {}
    chat_type = payload.get('type','private')
    name = payload.get('name') or ''
    members = payload.get('members') or []
    owner = payload.get('owner') or 'unknown'
    chat_id = ''.join(random.choice('0123456789abcdef') for _ in range(12))
    chat = {
        'id': chat_id,
        'type': chat_type,
        'name': name,
        'members': members,
        'owner': owner,
        'createdAt': int(time.time() * 1000),
        'lastPreview': '',
        'protected': False
    }
    data = load_data()
    data.setdefault('chats', []).append(chat)
    save_data(data)
    return jsonify({'status':'ok', 'chat': chat})

def main():
    host = os.environ.get('STEGOCHAT_HOST', '127.0.0.1')
    port = int(os.environ.get('STEGOCHAT_PORT', '5000'))
    debug = os.environ.get('STEGOCHAT_DEBUG', '').strip().lower() in {'1', 'true', 'yes', 'on'}

    print('[StegoChat] Starting Flask server')
    print(f'[StegoChat] Frontend directory: {FRONT}')
    print(f'[StegoChat] Sample directory:   {SAMPLE}')
    print(f'[StegoChat] Upload directory:   {UPLOAD}')
    print(f'[StegoChat] Data file:          {DATA_FILE}')
    print(f'[StegoChat] URL:                http://{host}:{port}')
    print(f'[StegoChat] Debug mode:         {debug}')

    app.run(host=host, port=port, debug=debug, use_reloader=False)


if __name__ == '__main__':
    main()
