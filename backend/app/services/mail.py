"""Outbound email — Gmail API (OAuth2) or SMTP fallback.

Priority:
  1. Gmail API  — when GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN are set.
  2. SMTP       — when STEGOCHAT_SMTP_HOST is set (classic STARTTLS / SSL).
  3. Dev mode   — logs the message and echoes the token in the API response.
"""

from __future__ import annotations

import base64
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger("stegochat.mail")


# ---------------------------------------------------------------------------
# Transport selection
# ---------------------------------------------------------------------------


def _gmail_api_configured() -> bool:
    return bool(
        settings.gmail_client_id and settings.gmail_client_secret and settings.gmail_refresh_token
    )


def smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_password)


def _build_mime(to: str, subject: str, plain: str, html: str | None) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["From"] = f"StegoChat <{settings.mail_from}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(plain, "plain"))
    if html:
        msg.attach(MIMEText(html, "html"))
    return msg


def _send_via_gmail_api(msg: MIMEMultipart) -> bool:
    """Send using Gmail API with stored OAuth2 refresh token."""
    try:
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        logger.error(
            "google-auth / google-api-python-client not installed. "
            "Run: pip install google-auth google-auth-oauthlib google-api-python-client"
        )
        return False

    creds = Credentials(
        token=None,
        refresh_token=settings.gmail_refresh_token,
        client_id=settings.gmail_client_id,
        client_secret=settings.gmail_client_secret,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/gmail.send"],
    )

    try:
        creds.refresh(GoogleRequest())
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
        return True
    except Exception:
        logger.exception("Gmail API send failed")
        return False


def _send_via_smtp(msg: MIMEMultipart) -> bool:
    assert settings.smtp_host is not None
    try:
        if settings.smtp_use_ssl:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ctx) as srv:
                if settings.smtp_user:
                    srv.login(settings.smtp_user, settings.smtp_password or "")
                srv.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as srv:
                srv.ehlo()
                srv.starttls(context=ssl.create_default_context())
                srv.ehlo()
                if settings.smtp_user:
                    srv.login(settings.smtp_user, settings.smtp_password or "")
                srv.send_message(msg)
        return True
    except Exception:
        logger.exception("SMTP send failed")
        return False


def send_mail(to: str, subject: str, body: str, html: str | None = None) -> bool:
    """Send an email; returns True if accepted by a mail server."""
    if _gmail_api_configured():
        msg = _build_mime(to, subject, body, html)
        return _send_via_gmail_api(msg)

    if smtp_configured():
        msg = _build_mime(to, subject, body, html)
        return _send_via_smtp(msg)

    # Dev mode — log and let callers surface the token in the API response.
    logger.info("[dev mail] to=%s subject=%r\n%s", to, subject, body)
    return False


# ---------------------------------------------------------------------------
# Typed email helpers (all callers should use these, not send_mail directly)
# ---------------------------------------------------------------------------


def send_otp_email(to: str, code: str, ttl_minutes: int = 10) -> bool:
    subject = "Your StegoChat login code"
    plain = (
        f"Your one-time login code is:\n\n"
        f"  {code}\n\n"
        f"It expires in {ttl_minutes} minutes. Do not share it with anyone.\n\n"
        f"If you did not request this, you can safely ignore this email."
    )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Your StegoChat login code</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:'Segoe UI',Arial,sans-serif;color:#e5e5e5;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0"
       style="background:#111113;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#e5e5e5;">
        stego<span style="color:#8B5CF6;">chat</span>
      </span>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:36px 40px 16px;">
      <p style="margin:0 0 8px;font-size:15px;color:rgba(229,229,229,0.7);">
        Here is your one-time sign-in code:
      </p>
      <div style="margin:28px 0;text-align:center;">
        <span style="display:inline-block;padding:20px 40px;
                     background:rgba(139,92,246,0.12);
                     border:2px solid rgba(139,92,246,0.45);
                     border-radius:16px;
                     font-size:42px;font-weight:700;
                     letter-spacing:0.22em;color:#e5e5e5;
                     font-family:'Courier New',monospace;">
          {code}
        </span>
      </div>
      <p style="margin:0;font-size:13px;color:rgba(229,229,229,0.4);text-align:center;">
        Expires in <strong style="color:rgba(229,229,229,0.65);">{ttl_minutes}&nbsp;minutes</strong>.
        Never share this code.
      </p>
    </td>
  </tr>

  <!-- Divider -->
  <tr><td style="padding:0 40px;">
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:12px 0;"/>
  </td></tr>

  <!-- Footer -->
  <tr>
    <td style="padding:20px 40px 32px;">
      <p style="margin:0;font-size:12px;color:rgba(229,229,229,0.3);">
        If you did not try to sign in to StegoChat, ignore this email.
        Someone may have typed your address by mistake.
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>"""
    return send_mail(to, subject, plain, html)


def send_reset_email(to: str, reset_url: str) -> bool:
    subject = "Reset your StegoChat password"
    plain = (
        f"Someone requested a password reset for your StegoChat account.\n\n"
        f"Reset link (valid 30 minutes):\n{reset_url}\n\n"
        f"If you did not request this, your password is unchanged."
    )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Reset your StegoChat password</title></head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:'Segoe UI',Arial,sans-serif;color:#e5e5e5;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0"
       style="background:#111113;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
  <tr>
    <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#e5e5e5;">
        stego<span style="color:#8B5CF6;">chat</span>
      </span>
    </td>
  </tr>
  <tr>
    <td style="padding:36px 40px 16px;">
      <p style="margin:0 0 16px;font-size:15px;color:rgba(229,229,229,0.7);">
        You requested a password reset. This link expires in
        <strong style="color:#e5e5e5;">30 minutes</strong>.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="{reset_url}"
           style="display:inline-block;padding:14px 32px;
                  background:#8B5CF6;border-radius:12px;
                  font-size:15px;font-weight:700;color:#fff;text-decoration:none;">
          Reset my password
        </a>
      </div>
      <p style="margin:0;font-size:12px;color:rgba(229,229,229,0.3);text-align:center;">
        Or copy: <span style="color:rgba(229,229,229,0.5);">{reset_url}</span>
      </p>
    </td>
  </tr>
  <tr><td style="padding:0 40px;">
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:12px 0;"/>
  </td></tr>
  <tr>
    <td style="padding:20px 40px 32px;">
      <p style="margin:0;font-size:12px;color:rgba(229,229,229,0.3);">
        If you did not request this, your password is unchanged.
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>"""
    return send_mail(to, subject, plain, html)


def send_verification_email(to: str, verify_url: str) -> bool:
    subject = "Verify your StegoChat email"
    plain = (
        f"Confirm your email address (valid 24 hours):\n{verify_url}\n\n"
        f"If you did not create a StegoChat account, ignore this email."
    )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Verify your StegoChat email</title></head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:'Segoe UI',Arial,sans-serif;color:#e5e5e5;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0"
       style="background:#111113;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
  <tr>
    <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#e5e5e5;">
        stego<span style="color:#8B5CF6;">chat</span>
      </span>
    </td>
  </tr>
  <tr>
    <td style="padding:36px 40px 16px;">
      <p style="margin:0 0 16px;font-size:15px;color:rgba(229,229,229,0.7);">
        Verify your email address to unlock all StegoChat features.
        This link expires in <strong style="color:#e5e5e5;">24 hours</strong>.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="{verify_url}"
           style="display:inline-block;padding:14px 32px;
                  background:#8B5CF6;border-radius:12px;
                  font-size:15px;font-weight:700;color:#fff;text-decoration:none;">
          Verify my email
        </a>
      </div>
      <p style="margin:0;font-size:12px;color:rgba(229,229,229,0.3);text-align:center;">
        Or copy: <span style="color:rgba(229,229,229,0.5);">{verify_url}</span>
      </p>
    </td>
  </tr>
  <tr><td style="padding:0 40px;">
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:12px 0;"/>
  </td></tr>
  <tr>
    <td style="padding:20px 40px 32px;">
      <p style="margin:0;font-size:12px;color:rgba(229,229,229,0.3);">
        If you did not create a StegoChat account, ignore this email.
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>"""
    return send_mail(to, subject, plain, html)
