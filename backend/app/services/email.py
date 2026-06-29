"""
Email Service for PlacementHub OTP delivery.

Configuration (via .env or environment variables):
  SMTP_HOST      - SMTP host (default: smtp.gmail.com)
  SMTP_PORT      - SMTP port (default: 587)
  SMTP_USER      - Sender email address
  SMTP_PASSWORD  - Sender email password / app password
  SMTP_FROM_NAME - Display name for sender (default: PlacementHub)

If SMTP_USER is not set, the service falls back to console-only logging.
"""

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

logger = logging.getLogger("app.services.email")


def _build_otp_html(name: str, otp: str, role: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #070A13; margin: 0; padding: 0; }}
    .container {{ max-width: 520px; margin: 40px auto; background: #0F1322; border-radius: 16px;
                  border: 1px solid rgba(139,92,246,0.3); overflow: hidden; }}
    .header {{ background: linear-gradient(135deg, #8B5CF6, #6366F1); padding: 32px; text-align: center; }}
    .header h1 {{ color: #fff; margin: 0; font-size: 1.6rem; letter-spacing: 1px; }}
    .body {{ padding: 36px; color: #E5E7EB; }}
    .otp-box {{ background: rgba(139,92,246,0.12); border: 1.5px solid rgba(139,92,246,0.5);
                border-radius: 12px; padding: 24px; text-align: center; margin: 28px 0; }}
    .otp {{ font-size: 2.8rem; font-weight: 800; color: #A78BFA; letter-spacing: 10px; }}
    .badge {{ display: inline-block; background: rgba(139,92,246,0.2); border-radius: 20px;
              padding: 4px 14px; font-size: 0.8rem; color: #C4B5FD; margin-bottom: 16px; }}
    p {{ line-height: 1.7; color: #9CA3AF; font-size: 0.95rem; }}
    .warning {{ color: #F87171; font-size: 0.85rem; margin-top: 24px; }}
    .footer {{ padding: 20px 36px; border-top: 1px solid rgba(255,255,255,0.05);
               font-size: 0.8rem; color: #4B5563; text-align: center; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎓 PlacementHub</h1>
    </div>
    <div class="body">
      <div class="badge">{role} Login</div>
      <p>Hello <strong style="color:#E5E7EB">{name}</strong>,</p>
      <p>Here is your one-time password (OTP) to access your PlacementHub account:</p>
      <div class="otp-box">
        <div class="otp">{otp}</div>
        <p style="margin:8px 0 0; font-size:0.85rem; color:#9CA3AF;">Valid for <strong>5 minutes</strong></p>
      </div>
      <p>Enter this code on the login screen to proceed. Do not share this code with anyone.</p>
      <p class="warning">⚠️ If you did not request this OTP, please ignore this email or contact your administrator.</p>
    </div>
    <div class="footer">PlacementHub · Multi-Tenant Placement Management Platform</div>
  </div>
</body>
</html>
"""


async def send_otp_email(email: str, name: str, otp: str, role: str) -> bool:
    """
    Sends an OTP email. Returns True on success, False on failure.
    Falls back to console log if SMTP is not configured.
    """
    # Always log to console for easy debugging
    logger.info("=" * 48)
    logger.info(f"OTP FOR: {email} | Name: {name} | Role: {role}")
    logger.info(f"OTP CODE: {otp}")
    logger.info("=" * 48)
    print(f"\n[OTP SERVICE LOG] Email: {email} | OTP: {otp} | Role: {role}\n", flush=True)

    smtp_user = getattr(settings, "SMTP_USER", None)
    smtp_password = getattr(settings, "SMTP_PASSWORD", None)

    if not smtp_user or not smtp_password:
        logger.warning("SMTP not configured (SMTP_USER/SMTP_PASSWORD missing). OTP printed to console only.")
        return False

    smtp_host = getattr(settings, "SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(getattr(settings, "SMTP_PORT", 587))
    from_name = getattr(settings, "SMTP_FROM_NAME", "PlacementHub")

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[PlacementHub] Your OTP: {otp}"
        msg["From"] = f"{from_name} <{smtp_user}>"
        msg["To"] = email

        # Plain text fallback
        text_part = MIMEText(
            f"Hello {name},\n\nYour PlacementHub OTP is: {otp}\n\nValid for 5 minutes.\n\n– PlacementHub",
            "plain"
        )
        html_part = MIMEText(_build_otp_html(name, otp, role), "html")

        msg.attach(text_part)
        msg.attach(html_part)

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, email, msg.as_string())

        logger.info(f"OTP email sent successfully to {email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send OTP email to {email}: {e}")
        return False


async def send_drive_notification_email(
    email: str,
    student_name: str,
    company_name: str,
    job_role: str,
    package: str,
    deadline: str,
    apply_url: str,
) -> bool:
    """Sends a placement drive notification email to an eligible student."""

    smtp_user = getattr(settings, "SMTP_USER", None)
    smtp_password = getattr(settings, "SMTP_PASSWORD", None)

    if not smtp_user or not smtp_password:
        print(
            f"\n[EMAIL NOTIFICATION] To: {email} | Drive: {company_name} - {job_role} | "
            f"Package: {package} | Deadline: {deadline}\n",
            flush=True
        )
        return False

    smtp_host = getattr(settings, "SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(getattr(settings, "SMTP_PORT", 587))
    from_name = getattr(settings, "SMTP_FROM_NAME", "PlacementHub")

    html = f"""
<!DOCTYPE html><html><head><style>
  body {{ font-family: Arial, sans-serif; background: #070A13; }}
  .container {{ max-width: 520px; margin: 40px auto; background: #0F1322;
                border-radius: 16px; border: 1px solid rgba(59,130,246,0.3); overflow: hidden; }}
  .header {{ background: linear-gradient(135deg, #2563EB, #7C3AED); padding: 28px; text-align:center; }}
  .header h1 {{ color:#fff; margin:0; font-size:1.4rem; }}
  .body {{ padding: 32px; color: #E5E7EB; }}
  .info-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:20px 0; }}
  .info-box {{ background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
               border-radius:8px; padding:12px; }}
  .info-label {{ font-size:0.75rem; color:#9CA3AF; margin-bottom:4px; }}
  .info-value {{ font-size:1rem; font-weight:700; color:#E5E7EB; }}
  .cta {{ display:block; background:linear-gradient(135deg,#2563EB,#7C3AED);
          color:#fff; padding:14px 28px; border-radius:8px; text-decoration:none;
          text-align:center; font-weight:700; margin: 24px 0; }}
  .footer {{ padding:16px 32px; border-top:1px solid rgba(255,255,255,0.05);
             font-size:0.78rem; color:#4B5563; text-align:center; }}
</style></head>
<body>
  <div class="container">
    <div class="header"><h1>🚀 New Placement Drive</h1></div>
    <div class="body">
      <p>Hello <strong>{student_name}</strong>,</p>
      <p>You are eligible for a new placement opportunity:</p>
      <div class="info-grid">
        <div class="info-box"><div class="info-label">Company</div><div class="info-value">{company_name}</div></div>
        <div class="info-box"><div class="info-label">Role</div><div class="info-value">{job_role}</div></div>
        <div class="info-box"><div class="info-label">Package</div><div class="info-value">{package}</div></div>
        <div class="info-box"><div class="info-label">Deadline</div><div class="info-value">{deadline}</div></div>
      </div>
      <a href="{apply_url}" class="cta">View & Apply Now →</a>
    </div>
    <div class="footer">PlacementHub · You are receiving this because you meet the eligibility criteria.</div>
  </div>
</body></html>
"""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[PlacementHub] New Drive: {company_name} – {job_role} ({package})"
        msg["From"] = f"{from_name} <{smtp_user}>"
        msg["To"] = email
        msg.attach(MIMEText(
            f"New Placement Drive\n\n{company_name} | {job_role} | {package}\nDeadline: {deadline}\n\nApply: {apply_url}",
            "plain"
        ))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, email, msg.as_string())

        return True
    except Exception as e:
        logger.error(f"Drive notification email failed for {email}: {e}")
        return False
