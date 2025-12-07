
from Crypto.Cipher import AES
from Crypto.Hash import SHA256
from Crypto.Random import get_random_bytes
import base64

BLOCK_SIZE = 16

def _derive_key(password: str) -> bytes:
    h = SHA256.new()
    h.update(password.encode('utf-8'))
    return h.digest()

def _pad(data: bytes) -> bytes:
    pad_len = BLOCK_SIZE - (len(data) % BLOCK_SIZE)
    return data + bytes([pad_len]) * pad_len

def _unpad(data: bytes) -> bytes:
    pad_len = data[-1]
    return data[:-pad_len]

def encrypt_message(plain_text: str, password: str) -> str:
    key = _derive_key(password)
    iv = get_random_bytes(BLOCK_SIZE)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    ct = cipher.encrypt(_pad(plain_text.encode('utf-8')))
    return base64.b64encode(iv + ct).decode('utf-8')

def decrypt_message(enc_b64: str, password: str) -> str:
    key = _derive_key(password)
    raw = base64.b64decode(enc_b64)
    iv, ct = raw[:BLOCK_SIZE], raw[BLOCK_SIZE:]
    cipher = AES.new(key, AES.MODE_CBC, iv)
    pt = _unpad(cipher.decrypt(ct))
    return pt.decode('utf-8')
