
from flask import Flask, request, jsonify, send_from_directory
from stego_engine import embed_message, extract_message, _extract_payload, _decode_payload, PAYLOAD_MARKER, REAL_CHANNEL, DECOY_CHANNEL
import os, random, io, re, uuid, json, time, math, hashlib, mimetypes, bcrypt
from PIL import Image, UnidentifiedImageError

BASE = os.path.dirname(os.path.abspath(__file__))
FRONT = os.path.join(BASE, '..', 'frontend')
SAMPLE = os.path.join(BASE, '..', 'sample_images')
UPLOAD = os.path.join(BASE, '..', 'uploads')
os.makedirs(UPLOAD, exist_ok=True)

app = Flask(__name__, static_folder=FRONT, static_url_path='')

# Dead Drop Storage: token -> {type, data, created_at}
dead_drop_storage = {}

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

@app.route('/extract', methods=['GET'])
@app.route('/extract.html', methods=['GET'])
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
    print('[StegoChat] /api/embed hit')
    print('[StegoChat] request.form:', dict(request.form))
    print('[StegoChat] request.files:', dict(request.files))
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

    # Generate Dead Drop token
    token = uuid.uuid4().hex[:12]
    now_ms = int(time.time() * 1000)
    data = load_data()
    data['dead_drops'][token] = {
        'type': 'stego_file',
        'file': out_name,
        'password': pw,
        'decoy_password': decoy_pw or None,
        'message': msg[:100] + '...' if len(msg) > 100 else msg,
        'createdAt': now_ms,
        'expiresAt': now_ms + 7 * 24 * 3600 * 1000,  # 7 days
        'used': False,
    }
    save_data(data)

    return jsonify({
        'status': 'ok',
        'stego_url': f'/uploads/{out_name}',
        'decoy_enabled': bool(decoy_pw and decoy_msg),
        'token': token,
        'expiresAt': data['dead_drops'][token]['expiresAt'],
    })

@app.route('/extract', methods=['POST'])
def extract():
    print('[StegoChat] /extract route hit')
    print('[StegoChat] request.files keys:', list(request.files.keys()))
    print('[StegoChat] request.form keys:', list(request.form.keys()))
    
    file = request.files.get('file')
    password = request.form.get('password', '')
    
    print('[StegoChat] file:', file)
    print('[StegoChat] password provided:', bool(password))
    
    if not file or file.filename == '':
        print('[StegoChat] No file uploaded')
        return jsonify({'error': 'No file uploaded'}), 400

    try:
        tmp_path = os.path.join(UPLOAD, 'extract_' + file.filename)
        file.save(tmp_path)
        print('[StegoChat] File saved to:', tmp_path)
        
        if not password:
            os.remove(tmp_path)
            return jsonify({
                'error': 'No hidden data found or password required'
            }), 400
        
        # Try EOF extraction first (for binary files)
        try:
            out_name = f"extracted_{random.randint(100000, 999999)}.bin"
            out_path = os.path.join(UPLOAD, out_name)
            from stego_engine import eof_extract
            result = eof_extract(tmp_path, out_path, password)
            
            # Handle both old and new return formats
            if isinstance(result, tuple):
                _, original_filename, mime_type = result
            else:
                original_filename = None
                mime_type = 'application/octet-stream'
            
            print('[StegoChat] EOF extraction successful')
            print('[StegoChat] Original filename:', original_filename)
            os.remove(tmp_path)
            return jsonify({
                'type': 'file',
                'data': f'/uploads/{out_name}',
                'filename': original_filename or out_name,
                'mime_type': mime_type
            })
        except Exception as e:
            print('[StegoChat] EOF extraction failed:', str(e))
        
        # Try LSB extraction (for text messages)
        try:
            img = Image.open(tmp_path).convert('RGB')
            
            # Try real channel first
            try:
                enc = _extract_payload(img, password, REAL_CHANNEL)
                message, has_marker = _decode_payload(enc, password)
                if has_marker:
                    print('[StegoChat] LSB extraction successful (real channel with marker)')
                    os.remove(tmp_path)
                    return jsonify({
                        'type': 'text',
                        'data': message
                    })
                # If no marker, this might be noise - continue to try decoy
            except Exception as e:
                print('[StegoChat] LSB real channel extraction failed:', str(e))
            
            # Try decoy channel
            try:
                enc = _extract_payload(img, password, DECOY_CHANNEL)
                message, has_marker = _decode_payload(enc, password)
                if has_marker:
                    print('[StegoChat] LSB extraction successful (decoy channel with marker)')
                    os.remove(tmp_path)
                    return jsonify({
                        'type': 'text',
                        'data': message
                    })
            except Exception as e:
                print('[StegoChat] LSB decoy channel extraction failed:', str(e))
                
        except Exception as e:
            print('[StegoChat] LSB extraction attempt failed:', str(e))
        
        # No valid hidden data found
        os.remove(tmp_path)
        return jsonify({
            'error': 'No hidden data found'
        }), 400
        
    except Exception as e:
        print('[StegoChat] Extraction error:', str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/extract', methods=['POST'])
def api_extract():
    if 'image' not in request.files or request.files['image'].filename == '':
        return jsonify({'error': 'no image uploaded'}), 400
    
    # Password is optional for chat extraction
    pw = request.form.get('password', 'stego123')  # Default password if not provided
    
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

def cleanup_expired_tokens():
    """Remove expired dead drop tokens"""
    data = load_data()
    now_ms = int(time.time() * 1000)
    
    expired_count = 0
    for token, drop in list(data.get('dead_drops', {}).items()):
        if drop.get('expiresAt', 0) < now_ms:
            data['dead_drops'].pop(token, None)
            expired_count += 1
    
    if expired_count > 0:
        save_data(data)
        print(f"[Cleanup] Removed {expired_count} expired tokens")
    
    return expired_count


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

@app.route('/api/dead-drop-file/<token>', methods=['GET'])
def api_fetch_dead_drop_file(token):
    """Retrieve a stego file stored in dead drop"""
    data = load_data()
    drop = data.get('dead_drops', {}).get(token)
    now_ms = int(time.time() * 1000)
    
    if not drop:
        return jsonify({'error': 'dead drop not found'}), 404
    
    if drop.get('type') != 'stego_file':
        return jsonify({'error': 'this token is not for a stego file'}), 400
    
    if drop.get('used'):
        return jsonify({'error': 'dead drop already opened'}), 410
    
    if drop.get('expiresAt', 0) < now_ms:
        data['dead_drops'].pop(token, None)
        save_data(data)
        return jsonify({'error': 'dead drop expired'}), 410
    
    file_url = f'/uploads/{drop.get("file")}'
    password = drop.get('password', '')
    message_preview = drop.get('message', '')
    created_at = drop.get('createdAt')
    expires_at = drop.get('expiresAt')
    
    # Calculate time remaining
    time_remaining_ms = expires_at - now_ms
    time_remaining_hours = max(0, time_remaining_ms // (3600 * 1000))
    
    # Check if expiring soon (< 24 hours)
    warning = None
    if time_remaining_hours < 24:
        warning = f"Token expires in {time_remaining_hours} hours"
    
    # Mark as used after retrieval
    drop['used'] = True
    drop['retrievedAt'] = now_ms
    data['dead_drops'][token] = drop
    save_data(data)
    
    response = {
        'status': 'ok',
        'file_url': file_url,
        'password': password,
        'message': message_preview,
        'createdAt': created_at,
        'expiresAt': expires_at,
        'time_remaining_ms': time_remaining_ms,
        'time_remaining_hours': time_remaining_hours
    }
    
    if warning:
        response['warning'] = warning
    
    return jsonify(response)

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

@app.route('/api/shred-all', methods=['POST'])
def api_shred_all():
    from stego_engine import secure_shred
    # Shred all files in UPLOAD dir
    for f in os.listdir(UPLOAD):
        fp = os.path.join(UPLOAD, f)
        if os.path.isfile(fp):
            secure_shred(fp)
    # Shred DATA_FILE
    if os.path.exists(DATA_FILE):
        secure_shred(DATA_FILE)
    # Re-initialize DATA_FILE
    save_data({'chats': [], 'dead_drops': {}})
    return jsonify({'status': 'ok', 'message': 'All data shredded'})

@app.route('/api/remove-exif', methods=['POST'])
def api_remove_exif():
    from stego_engine import remove_exif
    if 'image' not in request.files or request.files['image'].filename == '':
        return jsonify({'error': 'no image uploaded'}), 400
    f = request.files['image']
    in_path = os.path.join(UPLOAD, 'exif_in_' + f.filename)
    out_name = 'clean_' + f.filename
    out_path = os.path.join(UPLOAD, out_name)
    f.save(in_path)
    try:
        remove_exif(in_path, out_path)
        os.remove(in_path)
        return jsonify({'status': 'ok', 'url': f'/uploads/{out_name}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/eof-embed', methods=['POST'])
def api_eof_embed():
    from stego_engine import eof_embed
    if 'cover' not in request.files or 'payload' not in request.files:
        return jsonify({'error': 'cover and payload files required'}), 400
    pw = request.form.get('password', '')
    if not pw:
        return jsonify({'error': 'password required'}), 400
    cover = request.files['cover']
    payload = request.files['payload']
    
    cover_path = os.path.join(UPLOAD, 'cover_' + cover.filename)
    payload_path = os.path.join(UPLOAD, 'payload_' + payload.filename)
    cover.save(cover_path)
    payload.save(payload_path)
    
    out_name = f"stego_eof_{random.randint(100000, 999999)}.png"
    out_path = os.path.join(UPLOAD, out_name)
    
    try:
        # Pass original filename to preserve it during extraction
        eof_embed(cover_path, out_path, payload_path, pw, original_filename=payload.filename)
        os.remove(cover_path)
        os.remove(payload_path)
        
        # Generate Dead Drop token
        token = uuid.uuid4().hex[:12]
        now_ms = int(time.time() * 1000)
        
        # Get custom expiry time from frontend (default: 7 days = 168 hours)
        expiry_hours = request.form.get('expiryHours', 7 * 24, type=int)
        # Validate: minimum 1 hour, maximum 365 days (8760 hours)
        expiry_hours = max(1, min(expiry_hours, 8760))
        expiry_ms = expiry_hours * 3600 * 1000  # Convert hours to milliseconds
        
        data = load_data()
        data['dead_drops'][token] = {
            'type': 'stego_file',
            'file': out_name,
            'password': pw,
            'message': f'File: {payload.filename}',
            'createdAt': now_ms,
            'expiresAt': now_ms + expiry_ms,
            'expiryHours': expiry_hours,  # Store the expiry hours for reference
            'used': False,
        }
        save_data(data)
        
        return jsonify({
            'status': 'ok',
            'stego_url': f'/uploads/{out_name}',
            'token': token,
            'expiresAt': data['dead_drops'][token]['expiresAt'],
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/eof-extract', methods=['POST'])
def api_eof_extract():
    from stego_engine import eof_extract
    if 'stego' not in request.files:
        return jsonify({'error': 'stego file required'}), 400
    pw = request.form.get('password', '')
    if not pw:
        return jsonify({'error': 'password required'}), 400
    
    stego = request.files['stego']
    stego_path = os.path.join(UPLOAD, 'extract_stego_' + stego.filename)
    stego.save(stego_path)
    
    out_name = f"extracted_payload_{random.randint(100000, 999999)}.bin"
    out_path = os.path.join(UPLOAD, out_name)
    
    try:
        result = eof_extract(stego_path, out_path, pw)
        
        # Handle both old and new return formats
        if isinstance(result, tuple):
            _, original_filename, mime_type = result
        else:
            original_filename = out_name
            mime_type = 'application/octet-stream'
        
        os.remove(stego_path)
        return jsonify({
            'status': 'ok',
            'payload_url': f'/uploads/{out_name}',
            'filename': original_filename,
            'mime_type': mime_type
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== SETTINGS API ENDPOINTS ====================

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get user settings"""
    print('[StegoChat] /api/settings GET hit')
    try:
        data = load_data()
        settings = data.get('settings', {})
        
        # Default settings structure
        default_settings = {
            'encryption_protocol': 'AES-256',
            'embedding_method': 'LSB',
            'auto_delete_messages': True,
            'passphrase_lock': False,
            'biometric_auth': True,
            'theme': 'dark',
            'notifications_enabled': True,
            'language': 'en'
        }
        
        # Merge with saved settings
        for key, value in default_settings.items():
            if key not in settings:
                settings[key] = value
        
        return jsonify({'status': 'ok', 'settings': settings})
    except Exception as e:
        print(f'[StegoChat] Settings error: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings', methods=['POST'])
def update_settings():
    """Update user settings"""
    print('[StegoChat] /api/settings POST hit')
    try:
        data = load_data()
        new_settings = request.get_json()
        
        if not new_settings:
            return jsonify({'error': 'No settings provided'}), 400
        
        # Validate settings
        valid_protocols = ['AES-256', 'RSA-4096', 'ChaCha20']
        valid_methods = ['LSB', 'Parity Check', 'Spread Spectrum']
        
        if 'encryption_protocol' in new_settings:
            if new_settings['encryption_protocol'] not in valid_protocols:
                return jsonify({'error': 'Invalid encryption protocol'}), 400
        
        if 'embedding_method' in new_settings:
            if new_settings['embedding_method'] not in valid_methods:
                return jsonify({'error': 'Invalid embedding method'}), 400
        
        # Update settings
        data['settings'] = data.get('settings', {})
        data['settings'].update(new_settings)
        data['settings']['updated_at'] = int(time.time() * 1000)
        
        # Save to file
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        
        print('[StegoChat] Settings updated successfully')
        return jsonify({'status': 'ok', 'settings': data['settings']})
    except Exception as e:
        print(f'[StegoChat] Settings update error: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/profile', methods=['GET'])
def get_profile():
    """Get user profile information"""
    print('[StegoChat] /api/settings/profile GET hit')
    try:
        data = load_data()
        profile = data.get('profile', {})
        
        # Default profile
        default_profile = {
            'username': 'Obsidian Vault',
            'email': 'vault@stegochat.local',
            'created_at': int(time.time() * 1000),
            'last_login': int(time.time() * 1000),
            'vault_status': 'Encrypted',
            'encryption_level': 'Maximum Security'
        }
        
        # Merge defaults
        for key, value in default_profile.items():
            if key not in profile:
                profile[key] = value
        
        return jsonify({'status': 'ok', 'profile': profile})
    except Exception as e:
        print(f'[StegoChat] Profile error: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/profile', methods=['POST'])
def update_profile():
    """Update user profile"""
    print('[StegoChat] /api/settings/profile POST hit')
    try:
        data = load_data()
        new_profile = request.get_json()
        
        if not new_profile:
            return jsonify({'error': 'No profile data provided'}), 400
        
        # Validate email if provided
        if 'email' in new_profile:
            email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
            if not email_pattern.match(new_profile['email']):
                return jsonify({'error': 'Invalid email address'}), 400
        
        # Validate username if provided
        if 'username' in new_profile:
            if len(new_profile['username']) < 3 or len(new_profile['username']) > 50:
                return jsonify({'error': 'Username must be 3-50 characters'}), 400
        
        # Update profile
        data['profile'] = data.get('profile', {})
        data['profile'].update(new_profile)
        data['profile']['updated_at'] = int(time.time() * 1000)
        
        # Save to file
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        
        print('[StegoChat] Profile updated successfully')
        return jsonify({'status': 'ok', 'profile': data['profile']})
    except Exception as e:
        print(f'[StegoChat] Profile update error: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/password', methods=['POST'])
def change_password():
    """Change vault password"""
    print('[StegoChat] /api/settings/password POST hit')
    try:
        request_data = request.get_json()
        old_password = request_data.get('old_password')
        new_password = request_data.get('new_password')
        confirm_password = request_data.get('confirm_password')
        
        if not all([old_password, new_password, confirm_password]):
            return jsonify({'error': 'Missing password fields'}), 400
        
        if new_password != confirm_password:
            return jsonify({'error': 'Passwords do not match'}), 400
        
        if len(new_password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        data = load_data()
        
        # Check old password against stored hash
        stored_password_hash = data.get('vault_password', None)
        if stored_password_hash:
            # If hash exists, verify against it
            try:
                if not bcrypt.checkpw(old_password.encode('utf-8'), stored_password_hash.encode('utf-8')):
                    return jsonify({'error': 'Current password is incorrect'}), 401
            except:
                # Fallback to plaintext comparison for backwards compatibility
                if old_password != stored_password_hash:
                    return jsonify({'error': 'Current password is incorrect'}), 401
        else:
            # Default password check if none set
            if old_password != 'stego123':
                return jsonify({'error': 'Current password is incorrect'}), 401
        
        # Hash new password with bcrypt
        new_password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Update password
        data['vault_password'] = new_password_hash
        data['password_changed_at'] = int(time.time() * 1000)
        
        # Save to file
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        
        print('[StegoChat] Password changed successfully')
        return jsonify({'status': 'ok', 'message': 'Password changed successfully'})
    except Exception as e:
        print(f'[StegoChat] Password change error: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/sessions', methods=['GET'])
def get_sessions():
    """Get active sessions"""
    print('[StegoChat] /api/settings/sessions GET hit')
    try:
        data = load_data()
        sessions = data.get('sessions', [])
        
        # Create mock sessions if none exist
        if not sessions:
            sessions = [
                {
                    'id': str(uuid.uuid4()),
                    'device': 'Current Device',
                    'ip': '127.0.0.1',
                    'created_at': int(time.time() * 1000),
                    'last_activity': int(time.time() * 1000),
                    'is_current': True,
                    'os': 'Linux',
                    'browser': 'Chrome'
                }
            ]
        
        return jsonify({'status': 'ok', 'sessions': sessions})
    except Exception as e:
        print(f'[StegoChat] Sessions error: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete a specific session"""
    print(f'[StegoChat] Deleting session: {session_id}')
    try:
        if session_id == 'current':
            return jsonify({'error': 'Cannot delete current session'}), 400
        
        data = load_data()
        sessions = data.get('sessions', [])
        
        # Remove session
        data['sessions'] = [s for s in sessions if s.get('id') != session_id]
        
        # Save to file
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        
        print('[StegoChat] Session deleted')
        return jsonify({'status': 'ok', 'message': 'Session deleted'})
    except Exception as e:
        print(f'[StegoChat] Session delete error: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/export', methods=['GET'])
def export_settings():
    """Export all settings as JSON"""
    print('[StegoChat] /api/settings/export hit')
    try:
        data = load_data()
        
        export_data = {
            'settings': data.get('settings', {}),
            'profile': data.get('profile', {}),
            'exported_at': int(time.time() * 1000)
        }
        
        return jsonify({'status': 'ok', 'data': export_data})
    except Exception as e:
        print(f'[StegoChat] Export error: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/import', methods=['POST'])
def import_settings():
    """Import settings from exported JSON"""
    print('[StegoChat] /api/settings/import hit')
    try:
        import_data = request.get_json()
        
        if not import_data:
            return jsonify({'error': 'No data provided'}), 400
        
        data = load_data()
        
        # Import settings and profile
        if 'settings' in import_data:
            data['settings'] = import_data['settings']
        if 'profile' in import_data:
            data['profile'] = import_data['profile']
        
        data['imported_at'] = int(time.time() * 1000)
        
        # Save to file
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        
        print('[StegoChat] Settings imported successfully')
        return jsonify({'status': 'ok', 'message': 'Settings imported'})
    except Exception as e:
        print(f'[StegoChat] Import error: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/statistics', methods=['GET'])
def get_statistics():
    """Get vault statistics"""
    print('[StegoChat] /api/settings/statistics hit')
    try:
        data = load_data()
        chats = data.get('chats', [])
        dead_drops = data.get('dead_drops', {})
        
        # Count encrypted items
        encrypted_items = len(chats) + len(dead_drops)
        
        # Calculate vault uptime (mock for now)
        vault_uptime = 99.9
        
        # Get file counts
        uploads_dir = UPLOAD
        if os.path.exists(uploads_dir):
            file_count = len([f for f in os.listdir(uploads_dir) if os.path.isfile(os.path.join(uploads_dir, f))])
        else:
            file_count = 0
        
        stats = {
            'encrypted_items': encrypted_items,
            'vault_uptime': vault_uptime,
            'total_files': file_count,
            'total_chats': len(chats),
            'total_dead_drops': len(dead_drops),
            'last_backup': data.get('last_backup', int(time.time() * 1000))
        }
        
        return jsonify({'status': 'ok', 'statistics': stats})
    except Exception as e:
        print(f'[StegoChat] Statistics error: {str(e)}')
        return jsonify({'error': str(e)}), 500

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
