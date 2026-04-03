# ChatLid2Outlook — Setup Guide

## Prerequisites
- Node.js 18+
- A GoHighLevel account with API/Marketplace access
- A Microsoft Azure account (free tier works)

---

## 1. Microsoft Azure App Registration

### Step 1: Create the App
1. Go to [Azure Portal](https://portal.azure.com) → **Azure Active Directory** → **App registrations** → **New registration**
2. Name: `ChatLid2Outlook`
3. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
4. Redirect URI: **Web** → `https://your-domain.com/auth/microsoft/callback`
5. Click **Register**

### Step 2: Get Credentials
1. On the app overview page, copy:
   - **Application (client) ID** → `MS_CLIENT_ID`
   - **Directory (tenant) ID** → `MS_TENANT_ID` (use `common` for multi-tenant)
2. Go to **Certificates & secrets** → **New client secret**
   - Description: `ChatLid2Outlook`
   - Expires: 24 months
   - Copy the **Value** → `MS_CLIENT_SECRET`

### Step 3: API Permissions
1. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**
2. Add these permissions:
   - `Calendars.ReadWrite`
   - `User.Read`
   - `offline_access`
3. Click **Grant admin consent** (if you're an admin)

### Step 4: Enable Webhook Notifications
No extra setup needed — webhook subscriptions are created via the Graph API at runtime.

---

## 2. GoHighLevel Marketplace App

### Step 1: Create the App
1. Go to [GHL Marketplace](https://marketplace.gohighlevel.com) → **My Apps** → **Create App**
2. App Name: `ChatLid2Outlook`
3. App Type: **Sub-Account** (location-level)
4. Add these scopes:
   - `calendars.readonly`
   - `calendars/events.readwrite`
   - `contacts.readwrite`
   - `workflows.readonly`
5. Redirect URI: `https://your-domain.com/auth/ghl/callback`
6. Copy **Client ID** → `GHL_CLIENT_ID`
7. Copy **Client Secret** → `GHL_CLIENT_SECRET`

### Step 2: Set Up Webhooks in GHL
1. In your GHL sub-account, go to **Settings** → **Webhooks** (or set up via the Marketplace app)
2. Add a webhook URL: `https://your-domain.com/webhooks/ghl`
3. Select events:
   - `AppointmentCreate`
   - `AppointmentUpdate`
   - `AppointmentDelete`

---

## 3. Environment Setup

```bash
cp .env.example .env
```

Fill in all values in `.env`:
- `BASE_URL` — your public-facing URL (e.g. `https://chatlid2outlook.up.railway.app`)
- `ADMIN_API_KEY` — generate with `openssl rand -hex 32`
- `ENCRYPTION_KEY` — generate with `openssl rand -hex 16`
- Microsoft and GHL credentials from above

---

## 4. Run Locally

```bash
npm install
npm run dev
```

Server starts on `http://localhost:3000`. Check health: `GET /health`

---

## 5. Deploy to Railway / Render

### Railway
1. Push to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Add all `.env` variables in the Railway dashboard
4. Railway auto-detects Node.js and runs `npm start`

### Render
1. Push to GitHub
2. Go to [render.com](https://render.com) → **New Web Service** → connect your repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add all `.env` variables in the Render dashboard

---

## 6. Connect Staff Members

### Step 1: Create staff mappings
```bash
curl -X POST https://your-domain.com/admin/staff \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ghl_user_id": "abc123", "ghl_user_name": "John Smith"}'
```

### Step 2: Connect GHL (one-time, location-level)
Visit: `https://your-domain.com/auth/ghl/connect`

### Step 3: Connect each staff member's Microsoft account
Visit: `https://your-domain.com/auth/microsoft/connect?staff_id=1`

(Each staff member visits this URL with their staff_id to authorize their Outlook calendar)

### Step 4: Create webhook subscriptions
```bash
curl -X POST https://your-domain.com/admin/staff/1/subscribe \
  -H "x-api-key: YOUR_ADMIN_API_KEY"
```

### Step 5: Trigger manual sync (optional)
```bash
curl -X POST https://your-domain.com/admin/sync/all \
  -H "x-api-key: YOUR_ADMIN_API_KEY"
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/auth/ghl/connect` | Start GHL OAuth |
| GET | `/auth/ghl/callback` | GHL OAuth callback |
| GET | `/auth/microsoft/connect?staff_id=X` | Start Microsoft OAuth for staff |
| GET | `/auth/microsoft/callback` | Microsoft OAuth callback |
| POST | `/webhooks/ghl` | GHL inbound webhook |
| POST | `/webhooks/microsoft` | Microsoft Graph notifications |
| GET | `/admin/staff` | List staff mappings |
| POST | `/admin/staff` | Create staff mapping |
| PATCH | `/admin/staff/:id` | Update staff mapping |
| DELETE | `/admin/staff/:id` | Delete staff mapping |
| POST | `/admin/staff/:id/subscribe` | Create Graph subscription |
| POST | `/admin/sync/staff/:id` | Manual sync for one staff |
| POST | `/admin/sync/all` | Manual sync all staff |
| GET | `/admin/sync-log` | View sync audit log |
| GET | `/admin/stats` | Dashboard stats |

All `/admin/*` endpoints require `x-api-key` header.
