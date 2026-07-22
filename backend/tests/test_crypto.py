import pytest

from app.core.crypto import DecryptionError, decrypt, decrypt_bytes, encrypt, encrypt_bytes


def test_roundtrip_text():
    token = encrypt("hello world", "pw")
    assert decrypt(token, "pw") == "hello world"


def test_wrong_password_rejected():
    token = encrypt("secret", "correct")
    with pytest.raises(DecryptionError):
        decrypt(token, "wrong")


def test_ciphertext_is_not_plaintext():
    token = encrypt("visible?", "pw")
    assert "visible" not in token


def test_unique_ciphertext_per_call():
    # Random salt + nonce => different ciphertext each time.
    assert encrypt("same", "pw") != encrypt("same", "pw")


def test_tamper_detection():
    raw = encrypt_bytes(b"payload", "pw")
    tampered = raw[:-1] + bytes([raw[-1] ^ 0x01])
    with pytest.raises(DecryptionError):
        decrypt_bytes(tampered, "pw")


def test_bytes_roundtrip():
    data = bytes(range(256))
    assert decrypt_bytes(encrypt_bytes(data, "k"), "k") == data
