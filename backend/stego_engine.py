
from PIL import Image
from encryption import encrypt_message, decrypt_message
import random, struct

def _get_pixels_order(width, height, total_bits, password):
    total_pixels = width * height
    if total_bits > total_pixels:
        raise ValueError("Image too small for the hidden message")
    random.seed(password)
    idx = list(range(total_pixels))
    random.shuffle(idx)
    return idx[:total_bits]

def embed_message(cover_path, output_path, message, password):
    encrypted = encrypt_message(message, password)
    data_bytes = encrypted.encode('utf-8')
    length = len(data_bytes)
    header = struct.pack('>I', length)
    full = header + data_bytes
    bits = ''.join(f'{b:08b}' for b in full)
    total_bits = len(bits)

    img = Image.open(cover_path).convert('RGB')
    w, h = img.size
    px = img.load()

    order = _get_pixels_order(w, h, total_bits, password)

    for bi, pi in enumerate(order):
        x = pi % w
        y = pi // w
        r, g, b = px[x, y]
        px[x, y] = (r, g, (b & ~1) | int(bits[bi]))

    img.save(output_path)
    return output_path

def extract_message(path, password):
    img = Image.open(path).convert('RGB')
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
        bits += str(px[x, y][2] & 1)
    length = int(bits, 2)

    need = 32 + length * 8
    if need > total:
        raise ValueError("Image does not contain a valid message")

    bits = ""
    for i in range(need):
        x = order[i] % w
        y = order[i] // w
        bits += str(px[x, y][2] & 1)

    data = bytes(int(bits[i:i+8], 2) for i in range(0, len(bits), 8))
    enc = data[4:4+length].decode('utf-8')
    try:
        return decrypt_message(enc, password)
    except Exception:
        return "Invalid password or corrupted image."
