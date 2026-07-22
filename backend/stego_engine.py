
from PIL import Image
from encryption import encrypt_message, decrypt_message
import random, struct, hashlib, json, base64

PAYLOAD_MARKER = "STEGOCHAT_V1::"
REAL_CHANNEL = 2
DECOY_CHANNEL = 0

def _get_pixels_order(width, height, total_bits, password):
    total_pixels = width * height
    if total_bits > total_pixels:
        raise ValueError("Image too small for the hidden message")
    random.seed(password)
    idx = list(range(total_pixels))
    random.shuffle(idx)
    return idx[:total_bits]

def _build_payload_bytes(message, password):
    encrypted = encrypt_message(PAYLOAD_MARKER + message, password)
    data_bytes = encrypted.encode('utf-8')
    length = len(data_bytes)
    header = struct.pack('>I', length)
    return header + data_bytes

def _embed_payload(img, payload_bytes, password, channel_index):
    bits = ''.join(f'{b:08b}' for b in payload_bytes)
    total_bits = len(bits)
    w, h = img.size
    px = img.load()
    order = _get_pixels_order(w, h, total_bits, password)

    for bi, pi in enumerate(order):
        x = pi % w
        y = pi // w
        channels = list(px[x, y])
        channels[channel_index] = (channels[channel_index] & ~1) | int(bits[bi])
        px[x, y] = tuple(channels)

def embed_message(cover_path, output_path, message, password, decoy_message=None, decoy_password=None):
    if decoy_message and not decoy_password:
        raise ValueError("Decoy password required when decoy message is provided")
    if decoy_password and not decoy_message:
        raise ValueError("Decoy message required when decoy password is provided")
    if decoy_password and decoy_password == password:
        raise ValueError("Decoy password must be different from the real password")

    img = Image.open(cover_path).convert('RGB')
    _embed_payload(img, _build_payload_bytes(message, password), password, REAL_CHANNEL)

    if decoy_message and decoy_password:
        _embed_payload(img, _build_payload_bytes(decoy_message, decoy_password), decoy_password, DECOY_CHANNEL)

    img.save(output_path)
    return output_path

def _extract_payload(path_or_img, password, channel_index):
    img = path_or_img if hasattr(path_or_img, "size") else Image.open(path_or_img).convert('RGB')
    w, h = img.size
    px = img.load()

    total = w * h
    random.seed(password)
    order = list(range(total))
    random.shuffle(order)

    # first 32 bits = length
    bits = ""
    for i in range(32):
        x = order[i] % w
        y = order[i] // w
        bits += str(px[x, y][channel_index] & 1)
    length = int(bits, 2)

    need = 32 + length * 8
    if length <= 0 or need > total:
        raise ValueError("Image does not contain a valid message")

    bits = ""
    for i in range(need):
        x = order[i] % w
        y = order[i] // w
        bits += str(px[x, y][channel_index] & 1)

    data = bytes(int(bits[i:i+8], 2) for i in range(0, len(bits), 8))
    return data[4:4+length].decode('utf-8')

def _decode_payload(enc_b64, password):
    plain = decrypt_message(enc_b64, password)
    if plain.startswith(PAYLOAD_MARKER):
        return plain[len(PAYLOAD_MARKER):], True
    return plain, False

def _believable_noise(password):
    digest = hashlib.sha256(password.encode('utf-8')).hexdigest()
    seed = int(digest[:8], 16)
    rng = random.Random(seed)
    subjects = ['Meeting', 'Package', 'Schedule', 'Note', 'Courier', 'Update', 'Reminder']
    verbs = ['moved to', 'confirmed for', 'arrives at', 'shifted to', 'scheduled for']
    places = ['the north gate', 'locker 12', 'the cafe', 'checkpoint B', 'the archive room']
    refs = ['Bring the blue folder', 'Use the side entrance', 'Wait for confirmation', 'Keep this offline', 'Do not forward this']
    code = digest[8:14].upper()
    hour = 8 + (seed % 11)
    minute = rng.choice(['05', '10', '15', '20', '30', '45', '50'])
    return f"{rng.choice(subjects)} {rng.choice(verbs)} {hour}:{minute} at {rng.choice(places)}. {rng.choice(refs)}. Ref {code}."

def extract_message(path, password):
    img = Image.open(path).convert('RGB')

    for channel_index in (REAL_CHANNEL, DECOY_CHANNEL):
        try:
            enc = _extract_payload(img, password, channel_index)
            message, has_marker = _decode_payload(enc, password)
            if has_marker:
                return message
            if channel_index == REAL_CHANNEL:
                # Backward compatibility for older images without the marker prefix.
                return message
        except Exception:
            continue

    try:
        enc = _extract_payload(img, password, REAL_CHANNEL)
        return decrypt_message(enc, password)
    except Exception:
        return _believable_noise(password)
EOF_MARKER = b"::STEGO_EOF::"

def secure_shred(file_path, passes=3):
    import os
    if not os.path.exists(file_path):
        return
    length = os.path.getsize(file_path)
    try:
        with open(file_path, "ba+", buffering=0) as f:
            for _ in range(passes):
                f.seek(0)
                f.write(b'\x00' * length)
                f.seek(0)
                f.write(b'\xff' * length)
                f.seek(0)
                f.write(os.urandom(length))
    except Exception:
        pass
    finally:
        try:
            os.remove(file_path)
        except OSError:
            pass

def eof_embed(cover_path, output_path, payload_path, password, original_filename=None):
    import os
    import mimetypes
    
    with open(cover_path, 'rb') as f:
        cover_data = f.read()
    with open(payload_path, 'rb') as f:
        payload_data = f.read()
    
    # Get filename and guess MIME type
    # Use original_filename if provided, otherwise derive from payload_path
    if original_filename:
        filename = original_filename
        # If original filename doesn't have an extension, try to detect it
        if '.' not in original_filename:
            mime_type, ext = mimetypes.guess_extension(mimetypes.guess_type(payload_path)[0] or '')
            if ext:
                filename = original_filename + ext
    else:
        filename = os.path.basename(payload_path)
    
    mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = 'application/octet-stream'
    
    # Wrap payload in JSON with metadata
    payload_metadata = {
        'filename': filename,
        'type': mime_type,
        'data': base64.b64encode(payload_data).decode('utf-8')
    }
    wrapped_payload = json.dumps(payload_metadata).encode('utf-8')
    
    from Crypto.Cipher import AES
    from Crypto.Hash import SHA256
    from Crypto.Random import get_random_bytes
    h = SHA256.new()
    h.update(password.encode('utf-8'))
    key = h.digest()
    iv = get_random_bytes(16)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    pad_len = 16 - (len(wrapped_payload) % 16)
    padded_payload = wrapped_payload + bytes([pad_len]) * pad_len
    enc_payload = cipher.encrypt(padded_payload)
    final_data = cover_data + EOF_MARKER + iv + enc_payload
    with open(output_path, 'wb') as f:
        f.write(final_data)
    return output_path

def eof_extract(stego_path, output_path, password):
    with open(stego_path, 'rb') as f:
        data = f.read()
    if EOF_MARKER not in data:
        raise ValueError("No EOF payload found")
    enc_data = data.split(EOF_MARKER)[-1]
    iv = enc_data[:16]
    ct = enc_data[16:]
    from Crypto.Cipher import AES
    from Crypto.Hash import SHA256
    h = SHA256.new()
    h.update(password.encode('utf-8'))
    key = h.digest()
    cipher = AES.new(key, AES.MODE_CBC, iv)
    padded_payload = cipher.decrypt(ct)
    pad_len = padded_payload[-1]
    payload = padded_payload[:-pad_len]
    
    # Try to unwrap JSON metadata
    try:
        metadata = json.loads(payload.decode('utf-8'))
        if isinstance(metadata, dict) and 'data' in metadata and 'filename' in metadata:
            # Successfully extracted metadata
            original_filename = metadata['filename']
            original_data = base64.b64decode(metadata['data'])
            with open(output_path, 'wb') as f:
                f.write(original_data)
            return output_path, original_filename, metadata.get('type', 'application/octet-stream')
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
        # Not JSON metadata, treat as raw payload (backward compatibility)
        pass
    
    # Fall back to raw payload
    with open(output_path, 'wb') as f:
        f.write(payload)
    import os
    filename = os.path.basename(stego_path).replace('stego_', 'extracted_')
    return output_path, filename, 'application/octet-stream'

def remove_exif(image_path, output_path):
    from PIL import Image
    try:
        img = Image.open(image_path)
        data = list(img.getdata())
        image_without_exif = Image.new(img.mode, img.size)
        image_without_exif.putdata(data)
        # Preserve original format or default to PNG
        fmt = img.format if img.format else 'PNG'
        image_without_exif.save(output_path, fmt)
        return output_path
    except Exception as e:
        raise ValueError(f"Failed to remove EXIF: {e}")
