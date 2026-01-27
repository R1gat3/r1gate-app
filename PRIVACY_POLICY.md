# Privacy Policy for R1Gate Desktop Application

**Last Updated:** January 27, 2026

## Overview

R1Gate Desktop is a voice communication application that respects your privacy. This policy describes how the desktop application and R1Gate service handle data.

---

## Part 1: Desktop Application (No Data Collection)

**The R1Gate Desktop Application itself does NOT automatically collect or transmit any personal user data.**

### Automatic Network Requests

The application makes only one automatic network request:

1. **Update Check** (optional)
   - **URL:** `https://r1gate.ru/downloads/version.json`
   - **Data Sent:** Only application identifier (User-Agent: `R1Gate/1.0`)
   - **Data Received:** Version number and download links for updates
   - **Purpose:** To notify users about available updates
   - **Personal Data Transmitted:** None

### Local Data Storage

The application stores the following data **locally on your device only**:
- Application logs in `%APPDATA%/r1gate/r1gate.log` (Windows) or `~/.config/r1gate/r1gate.log` (Linux)
- User preferences and settings
- **This data never leaves your device**

### Third-Party Services

The desktop application does not integrate any third-party analytics, tracking, or telemetry services.

---

## Part 2: R1Gate Service (Data Collection When Using the Service)

When you use the R1Gate service through the desktop application, the following data is collected and stored on our servers:

### Account Information
- **Username** - chosen by you during registration
- **Email address** - for account recovery and notifications
- **Password** - stored as a cryptographic hash (we never store plain-text passwords)
- **Avatar** - if you upload one
- **Registration date** - when your account was created

### Usage Data
- **Servers** - servers you create or join
- **Channels** - text and voice channels you access
- **Messages** - text messages you send (stored with timestamp and author)
- **Voice activity** - connection timestamps and participants (audio content is NOT recorded or stored)
- **Online status** - whether you are currently online
- **Last seen** - timestamp of your last activity

### Administrative Access

R1Gate administrators have access to aggregated statistics through an admin panel at `web.r1gate.ru/admin`, including:

**Aggregated Statistics:**
- Total number of users, servers, channels, and messages
- New registrations per day
- Online user count
- Server activity metrics
- System resource usage (server health monitoring)

**Limited User Data:**
- List of recently registered users (username, email, registration date)
- User activity timestamps
- Server membership information

**What Administrators CANNOT Access:**
- Your password (stored as irreversible hash)
- Private message content in real-time without proper legal authorization
- Voice call audio (not recorded)
- Your application logs (stored only on your device)

### Data Retention

- **Account data:** Retained while your account is active
- **Messages:** Retained indefinitely unless deleted by users or server administrators
- **Logs:** Server logs retained for 30 days for debugging purposes

### Data Deletion

You can request account deletion by contacting support. Upon deletion:
- Your account information will be permanently removed
- Your messages will be anonymized (author will show as "Deleted User")
- Your servers will be transferred to another member or deleted if you are the sole owner

---

## Data Security

We implement industry-standard security measures:
- HTTPS/TLS encryption for all data transmission
- Password hashing using bcrypt
- Secure token-based authentication (JWT)
- Regular security updates

---

## Your Rights

Under GDPR and similar privacy laws, you have the right to:
- Access your personal data
- Correct inaccurate data
- Request data deletion
- Export your data
- Withdraw consent

To exercise these rights, contact us through GitHub issues or email.

---

## Changes to This Policy

Any changes to this privacy policy will be:
- Published on GitHub at https://github.com/R1gat3/r1gate-app
- Announced in application updates
- Effective immediately upon publication

---

## Contact

For privacy-related questions:
- **GitHub Issues:** https://github.com/R1gat3/r1gate-app/issues
- **Email:** gaga.gaga.ga@mail.ru

---

**Repository:** https://github.com/R1gat3/r1gate-app
**License:** MIT License
**Copyright:** © 2025 R1Gate
