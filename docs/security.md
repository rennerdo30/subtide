# Security

Security considerations and best practices for Subtide.

---

## Overview

Subtide is designed with security in mind. This document covers:

- How your data is handled
- API key security
- Backend security
- Browser extension security

---

## Data Privacy

### What Data is Processed

Subtide processes:

| Data | Purpose | Storage |
|------|---------|---------|
| Video audio | Transcription via Whisper | Temporary (deleted after processing) |
| Subtitles | Translation via LLM | Cached locally (optional) |
| API keys | Authentication | Local browser storage |
| Settings | User preferences | Local browser storage |

### What Data is NOT Collected

Subtide does **not**:

- Track your viewing history
- Collect personal information
- Send analytics to third parties
- Store video content permanently
- Share data between users

### Data Flow

```
Video Audio → Backend (local) → Whisper → Transcription
                                    ↓
                              LLM API (your key)
                                    ↓
                              Translation
                                    ↓
                         Browser (display + cache)
```

All data stays within your control.

---

## API Key Security

### Storage

Your API keys are stored in Chrome's `chrome.storage.local`:

- Encrypted by Chrome's storage system
- Accessible only to the Subtide extension
- Never transmitted to Subtide servers

### Best Practices

1. **Use separate API keys** for Subtide (not your primary development key)
2. **Set usage limits** in your API provider dashboard
3. **Monitor usage** regularly for unexpected charges
4. **Rotate keys** periodically
5. **Revoke keys** immediately if compromised

### API Key Handling

| Tier | Key Location | Security Level |
|------|--------------|----------------|
| Tier 1 | Browser | User-controlled |
| Tier 2 | Browser | User-controlled |
| Tier 3 | Server | Admin-controlled |
| Tier 4 | Server | Admin-controlled |

For Tier 3/4, the server admin is responsible for key security.

---

## Backend Security

### Local Deployment

By default, the backend runs on `localhost:5001`:

```bash
# Only accessible from local machine
./subtide-backend
```

This is the most secure configuration for personal use.

### Network Deployment

If exposing the backend to a network:

1. **Use HTTPS** with a valid certificate
2. **Configure CORS** to allow only trusted origins:
   ```bash
   CORS_ORIGINS=https://youtube.com,https://www.youtube.com
   ```
3. **Use a reverse proxy** (nginx, Traefik) with rate limiting
4. **Enable firewall rules** to restrict access

### Docker Security

For Docker deployments:

```yaml
# docker-compose.yml security settings
services:
  subtide:
    # Don't run as root
    user: "1000:1000"

    # Read-only filesystem where possible
    read_only: true

    # Limit resources
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G

    # Don't expose unnecessary ports
    ports:
      - "127.0.0.1:5001:5001"  # Localhost only
```

### Environment Variables

Secure your environment:

```bash
# Don't commit .env files
echo ".env" >> .gitignore

# Use secrets management in production
# Example: Docker secrets, Kubernetes secrets, Vault
```

---

## Browser Extension Security

### Permissions

Subtide requests these permissions:

| Permission | Purpose | Risk Level |
|------------|---------|------------|
| `storage` | Save settings and cache | Low |
| `activeTab` | Access current video page | Low |
| `scripting` | Inject subtitle UI | Medium |
| `tabCapture` | Capture audio for live translation | Medium |
| `offscreen` | Audio processing | Low |
| `host_permissions` | Access video sites | Medium |

### Content Security Policy

The extension enforces a strict CSP:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'"
}
```

This prevents:

- Inline script execution
- External script loading
- Plugin-based attacks

### Web Accessible Resources

Only necessary files are web-accessible:

```json
"web_accessible_resources": [{
  "resources": [
    "src/content/network_interceptor.js",
    "src/content/shorts-interceptor.js",
    "src/offscreen/audio-processor.js"
  ],
  "matches": ["<all_urls>"]
}]
```

---

## Threat Model

### What Subtide Protects Against

| Threat | Protection |
|--------|------------|
| API key theft | Local storage encryption |
| Man-in-the-middle | HTTPS for API calls |
| XSS attacks | Strict CSP |
| Data leakage | No external data transmission |

### What Requires User Awareness

| Risk | Mitigation |
|------|------------|
| Malicious API providers | Use trusted providers only |
| Compromised backend | Run locally or verify server |
| Browser extension compromise | Install from official sources |
| API key exposure | Follow key security best practices |

---

## Secure Deployment Checklist

### Personal Use

- [ ] Run backend on localhost only
- [ ] Use your own API key
- [ ] Keep extension updated
- [ ] Review extension permissions

### Team/Shared Use

- [ ] Deploy backend with HTTPS
- [ ] Configure CORS restrictions
- [ ] Use Tier 3/4 with server-side keys
- [ ] Implement rate limiting
- [ ] Set up monitoring
- [ ] Regular security updates

### Production

- [ ] All items from Team/Shared
- [ ] Use secrets management (Vault, etc.)
- [ ] Enable audit logging
- [ ] Implement authentication (if needed)
- [ ] Regular security audits
- [ ] Incident response plan

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public GitHub issue
2. Email security concerns to the maintainer
3. Provide:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We take security seriously and will respond promptly.

---

## Third-Party Services

### LLM Providers

When using cloud LLM providers:

| Provider | Data Usage | Privacy Policy |
|----------|------------|----------------|
| OpenAI | May use for training (opt-out available) | [Policy](https://openai.com/policies/privacy-policy) |
| OpenRouter | Varies by model | [Policy](https://openrouter.ai/privacy) |
| Local LLM | No external transmission | N/A |

**Recommendation**: For sensitive content, use a local LLM.

### Whisper Processing

Whisper transcription happens locally in the backend. Audio is:

- Never sent to external services (unless using OpenAI API)
- Processed in memory
- Deleted after transcription completes

---

## Updates and Patches

### Staying Secure

1. **Update regularly** - Check for new releases
2. **Review changelogs** - Note security fixes
3. **Monitor dependencies** - Backend uses many libraries
4. **Follow announcements** - Watch the GitHub repository

### Version Policy

- Security patches are prioritized
- Critical fixes released ASAP
- Regular updates include security improvements

---

## Next Steps

- [Troubleshooting](troubleshooting.md) - Common issues
- [Configuration](getting-started/configuration.md) - Secure configuration
- [Contributing](contributing.md) - Report issues responsibly
