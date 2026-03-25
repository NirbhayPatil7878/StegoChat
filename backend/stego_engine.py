
from PIL import Image
from encryption import encrypt_message, decrypt_message
import random, struct, hashlib

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
