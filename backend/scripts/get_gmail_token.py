#!/usr/bin/env python3
"""One-time helper to obtain a Gmail OAuth2 refresh token.

Run from the backend/ directory:

    python scripts/get_gmail_token.py

It reads STEGOCHAT_GMAIL_CLIENT_ID and STEGOCHAT_GMAIL_CLIENT_SECRET from
.env, opens your browser to authorise stegochat232@gmail.com, then writes
STEGOCHAT_GMAIL_REFRESH_TOKEN back into .env automatically.
"""

import os
import re
import sys
from pathlib import Path

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    sys.exit(
        "Missing dependency.\n"
        "Run: /home/grim/Projects/StegoChat/venv/bin/python3 -m pip install "
        "google-auth-oauthlib google-auth google-api-python-client"
    )

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def read_env(key: str) -> str:
    """Read a value from .env without loading the whole settings module."""
    if not ENV_FILE.exists():
        return ""
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return ""


def write_env(key: str, value: str) -> None:
    """Update or append a key=value line in .env."""
    content = ENV_FILE.read_text() if ENV_FILE.exists() else ""
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    new_line = f"{key}={value}"
    if pattern.search(content):
        content = pattern.sub(new_line, content)
    else:
        content = content.rstrip("\n") + f"\n{new_line}\n"
    ENV_FILE.write_text(content)


def main() -> None:
    print("=" * 60)
    print("  StegoChat — Gmail OAuth2 token setup")
    print("=" * 60)

    client_id = read_env("STEGOCHAT_GMAIL_CLIENT_ID")
    client_secret = read_env("STEGOCHAT_GMAIL_CLIENT_SECRET")

    if not client_id or not client_secret:
        sys.exit(
            "STEGOCHAT_GMAIL_CLIENT_ID or STEGOCHAT_GMAIL_CLIENT_SECRET not found in .env.\n"
            "Make sure they are set before running this script."
        )

    print(f"\nUsing client ID: {client_id[:40]}…")
    print("\nOpening browser — sign in as stegochat232@gmail.com when prompted.\n")

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    creds = flow.run_local_server(port=0, open_browser=True)

    refresh_token = creds.refresh_token
    if not refresh_token:
        sys.exit("No refresh token received. Make sure you granted access.")

    write_env("STEGOCHAT_GMAIL_REFRESH_TOKEN", refresh_token)

    print("\n" + "=" * 60)
    print("  Success! Refresh token saved to backend/.env")
    print("=" * 60)
    print("\nRestart the backend server — Gmail OTP emails will now be live.")


if __name__ == "__main__":
    main()
