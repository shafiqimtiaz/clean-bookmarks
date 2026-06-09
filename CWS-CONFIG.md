# Chrome Web Store Publishing Setup

## Prerequisites

- Google Cloud project with billing enabled
- Chrome Web Store Developer account
- GitHub repo with Actions enabled

---

## Step 1: Enable the Chrome Web Store API

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Library**
2. Search "Chrome Web Store API" → **Enable**

---

## Step 2: Create Desktop OAuth client → `CWS_CLIENT_ID` + `CWS_CLIENT_SECRET`

> **Note:** Use a **Desktop app** OAuth client for CWS publishing — not "Chrome Extension" type (that's for authenticating users inside the extension).

1. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
2. Application type: **Desktop app**
3. Name: `cws-publish`
4. Copy **Client ID** → `CWS_CLIENT_ID`
5. Copy **Client Secret** → `CWS_CLIENT_SECRET`

---

## Step 3: Get refresh token → `CWS_REFRESH_TOKEN`

One-time manual flow.

**Paste in browser** (replace `CLIENT_ID`):
```
https://accounts.google.com/o/oauth2/auth?client_id=CLIENT_ID&response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&redirect_uri=urn:ietf:wg:oauth:2.0:oob&access_type=offline
```

**Exchange code for token** (replace placeholders):
```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d client_id=CLIENT_ID \
  -d client_secret=CLIENT_SECRET \
  -d code=AUTH_CODE_FROM_BROWSER \
  -d grant_type=authorization_code \
  -d redirect_uri=urn:ietf:wg:oauth:2.0:oob
```

`refresh_token` in the response → `CWS_REFRESH_TOKEN`

---

## Step 4: Get extension ID → `EXTENSION_ID`

From the CWS Developer Dashboard URL:
```
https://chromewebstore.google.com/detail/your-extension-name/abcdefghijklmnopqrstuvwxyzabcdef
```
Last segment = `EXTENSION_ID`

> If not yet published, upload a first version manually in the Dashboard to get an ID assigned.

---

## Step 5: Add secrets to GitHub

**Repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret | Source |
|---|---|
| `EXTENSION_ID` | CWS Dashboard URL |
| `CWS_CLIENT_ID` | Desktop OAuth client |
| `CWS_CLIENT_SECRET` | Desktop OAuth client |
| `CWS_REFRESH_TOKEN` | curl response above |

---

## Workflow notes

- `pattern` on `workflow_dispatch` inputs is silently ignored by GitHub — use a validation step instead (already in `publish.yml`)
- First publish must be done **manually** via the Dashboard; the API can only update existing items
- Refresh tokens don't expire unless revoked — no need to redo Step 3 unless credentials are rotated
