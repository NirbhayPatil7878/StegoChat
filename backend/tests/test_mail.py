"""Mail provider selection and delivery behavior."""

import logging

import pytest

from app.config import Settings, settings
from app.services import mail


def _clear_mail_settings(monkeypatch):
    for name, value in {
        "environment": "production",
        "dev_mail_enabled": False,
        "gmail_client_id": None,
        "gmail_client_secret": None,
        "gmail_refresh_token": None,
        "smtp_host": None,
        "smtp_port": 587,
        "smtp_use_ssl": False,
        "smtp_user": None,
        "smtp_password": None,
        "mail_from": None,
    }.items():
        monkeypatch.setattr(settings, name, value)


def test_missing_production_provider_fails_clearly(monkeypatch):
    _clear_mail_settings(monkeypatch)

    with pytest.raises(mail.MailConfigurationError, match="email provider"):
        mail.select_mail_provider()


def test_settings_load_backend_env_after_repository_env(tmp_path):
    repository_env = tmp_path / "root.env"
    backend_env = tmp_path / "backend.env"
    repository_env.write_text("STEGOCHAT_SMTP_HOST=root-host\n")
    backend_env.write_text("STEGOCHAT_SMTP_HOST=smtp-relay.brevo.com\n")

    loaded = Settings(_env_file=(repository_env, backend_env))

    assert loaded.smtp_host == "smtp-relay.brevo.com"


def test_development_delivery_logs_otp_only_when_explicitly_enabled(monkeypatch, caplog):
    _clear_mail_settings(monkeypatch)
    settings.environment = "development"
    settings.dev_mail_enabled = True

    assert mail.select_mail_provider() == "development"
    with caplog.at_level(logging.INFO, logger="stegochat.mail"):
        assert mail.send_otp_email("user@example.com", "123456") is True
    assert "[dev mail]" in caplog.text
    assert "123456" in caplog.text


def test_development_delivery_does_not_log_password_reset_links(monkeypatch, caplog):
    _clear_mail_settings(monkeypatch)
    settings.environment = "development"
    settings.dev_mail_enabled = True
    reset_url = "http://localhost:5173/reset-password?token=private-test-token"

    with caplog.at_level(logging.INFO, logger="stegochat.mail"):
        assert mail.send_reset_email("user@example.com", reset_url) is True

    assert "private-test-token" not in caplog.text


def test_development_delivery_cannot_be_enabled_in_production(monkeypatch):
    _clear_mail_settings(monkeypatch)
    settings.dev_mail_enabled = True

    with pytest.raises(mail.MailConfigurationError, match="development only"):
        mail.select_mail_provider()


def test_valid_smtp_configuration_selects_smtp(monkeypatch):
    _clear_mail_settings(monkeypatch)
    settings.smtp_host = "smtp.gmail.com"
    settings.smtp_user = "sender@gmail.com"
    settings.smtp_password = "app-password"
    settings.mail_from = "sender@gmail.com"

    assert mail.select_mail_provider() == "smtp"


def test_brevo_smtp_takes_priority_over_configured_gmail_api(monkeypatch):
    _clear_mail_settings(monkeypatch)
    settings.gmail_client_id = "client"
    settings.gmail_client_secret = "secret"
    settings.gmail_refresh_token = "refresh"
    settings.smtp_host = "smtp-relay.brevo.com"
    settings.smtp_user = "brevo-login"
    settings.smtp_password = "brevo-key"
    settings.mail_from = "stegochat232@gmail.com"

    assert mail.select_mail_provider() == "smtp"


def test_smtp_delivery_uses_starttls_authentication_and_sender(monkeypatch):
    _clear_mail_settings(monkeypatch)
    settings.smtp_host = "smtp-relay.brevo.com"
    settings.smtp_user = "brevo-login"
    settings.smtp_password = "brevo-key"
    settings.mail_from = "stegochat232@gmail.com"
    observed = {}

    class FakeSMTP:
        def __init__(self, host, port, **kwargs):
            observed["host"] = host
            observed["port"] = port
            observed["timeout"] = kwargs.get("timeout")

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def ehlo(self):
            observed["ehlo"] = observed.get("ehlo", 0) + 1

        def starttls(self, context):
            observed["starttls"] = context

        def login(self, username, password):
            observed["credentials"] = (username, password)

        def send_message(self, message):
            observed["message"] = message

    monkeypatch.setattr(mail.smtplib, "SMTP", FakeSMTP)

    assert mail.send_mail("recipient@example.com", "Subject", "Body") is True
    assert observed["host"] == "smtp-relay.brevo.com"
    assert observed["port"] == 587
    assert observed["timeout"] is not None
    assert observed["credentials"] == ("brevo-login", "brevo-key")
    assert observed["message"]["From"] == "StegoChat <stegochat232@gmail.com>"
    assert observed["starttls"] is not None


def test_partial_smtp_configuration_does_not_select_development(monkeypatch):
    _clear_mail_settings(monkeypatch)
    settings.environment = "development"
    settings.dev_mail_enabled = True
    settings.smtp_host = "smtp.gmail.com"

    with pytest.raises(mail.MailConfigurationError, match="Incomplete SMTP"):
        mail.select_mail_provider()


def test_configured_gmail_api_failure_does_not_fall_back_to_console(monkeypatch):
    _clear_mail_settings(monkeypatch)
    settings.environment = "development"
    settings.dev_mail_enabled = True
    settings.gmail_client_id = "client"
    settings.gmail_client_secret = "secret"
    settings.gmail_refresh_token = "refresh"
    settings.mail_from = "sender@gmail.com"

    def fail_gmail(_message):
        return False

    monkeypatch.setattr(mail, "_send_via_gmail_api", fail_gmail)
    assert mail.send_mail("recipient@example.com", "Subject", "Body") is False


def test_smtp_failure_never_falls_back_to_development_otp_logs(monkeypatch, caplog):
    _clear_mail_settings(monkeypatch)
    settings.environment = "development"
    settings.dev_mail_enabled = True
    settings.smtp_host = "smtp-relay.brevo.com"
    settings.smtp_user = "mock-smtp-login"
    settings.smtp_password = "mock-smtp-key"
    settings.mail_from = "stegochat232@gmail.com"
    monkeypatch.setattr(mail, "_send_via_smtp", lambda _message: False)

    with caplog.at_level(logging.INFO, logger="stegochat.mail"):
        assert mail.send_otp_email("user@example.com", "654321") is False

    assert "654321" not in caplog.text


def test_smtp_authentication_failure_is_reported_without_logging_otp(monkeypatch, caplog):
    import smtplib

    _clear_mail_settings(monkeypatch)
    settings.smtp_host = "smtp.gmail.com"
    settings.smtp_user = "sender@gmail.com"
    settings.smtp_password = "app-password"
    settings.mail_from = "sender@gmail.com"

    class RejectingSMTP:
        def __init__(self, *_args, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def ehlo(self):
            pass

        def starttls(self, **_kwargs):
            pass

        def login(self, *_args):
            raise smtplib.SMTPAuthenticationError(535, b"credentials rejected")

    monkeypatch.setattr(mail.smtplib, "SMTP", RejectingSMTP)
    with caplog.at_level(logging.INFO, logger="stegochat.mail"):
        assert mail.send_otp_email("recipient@example.com", "827104", 15) is False
    assert "827104" not in caplog.text
    assert "app-password" not in caplog.text


def test_smtp_network_failure_returns_failure_without_fallback(monkeypatch):
    import smtplib

    _clear_mail_settings(monkeypatch)
    settings.smtp_host = "smtp.gmail.com"
    settings.smtp_user = "sender@gmail.com"
    settings.smtp_password = "app-password"
    settings.mail_from = "sender@gmail.com"

    def fail_connect(*_args, **_kwargs):
        raise smtplib.SMTPConnectError(421, b"connection unavailable")

    monkeypatch.setattr(mail.smtplib, "SMTP", fail_connect)
    assert mail.send_mail("recipient@example.com", "Subject", "Body") is False


def test_gmail_invalid_grant_is_actionable_and_does_not_log_credentials(monkeypatch, caplog):
    from google.auth.transport import requests
    from google.oauth2 import credentials

    _clear_mail_settings(monkeypatch)
    settings.gmail_client_id = "private-client-id"
    settings.gmail_client_secret = "private-client-secret"
    settings.gmail_refresh_token = "private-refresh-token"
    settings.mail_from = "sender@gmail.com"

    class ExpiredCredentials:
        def __init__(self, **_kwargs):
            pass

        def refresh(self, _request):
            raise RuntimeError("invalid_grant")

    monkeypatch.setattr(credentials, "Credentials", ExpiredCredentials)
    monkeypatch.setattr(requests, "Request", lambda: object())
    message = mail._build_mime("recipient@example.com", "Subject", "OTP body", None)

    with caplog.at_level(logging.INFO, logger="stegochat.mail"):
        assert mail._send_via_gmail_api(message) is False

    assert "invalid_grant" in caplog.text
    assert "get_gmail_token.py" in caplog.text
    assert "private-client-secret" not in caplog.text
    assert "private-refresh-token" not in caplog.text
    assert "OTP body" not in caplog.text
