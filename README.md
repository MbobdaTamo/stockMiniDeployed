# CashFlow Auth Server--

Node.js + TypeScript + Express + MySQL + Google OAuth 2.0 + JWT.

---

## File Structure

```
src/
├── index.ts                 ← Express app entry point
├── config/
│   └── passport.ts          ← Google OAuth strategy (passport-google-oauth20)
├── db/
│   ├── pool.ts              ← mysql2 connection pool
│   └── migrate.ts           ← CREATE TABLE script (run once)
├── middleware/
│   └── auth.ts              ← requireAuth / requireAdmin JWT guards
├── models/
│   └── UserModel.ts         ← Typed DB queries + Google upsert
├── routes/
│   └── auth.ts              ← All /auth/* endpoints
└── utils/
    └── jwt.ts               ← signToken / verifyToken helpers
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# → edit .env with your MySQL credentials and Google OAuth keys

# 3. Create the database in MySQL first
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS cashflow CHARACTER SET utf8mb4;"

# 4. Run the migration (creates the `user` table)
npm run db:migrate

# 5. Start the dev server
npm run dev
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default `3001`) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL connection |
| `JWT_SECRET` | Long random string for signing tokens |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | Must match the URI registered in Google Console |
| `FRONTEND_URL` | Where to redirect after OAuth (e.g. `http://localhost:5173`) |

### Setting up Google OAuth credentials

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add to **Authorised JavaScript origins**: `http://localhost:5173`
4. Add to **Authorised redirect URIs**: `http://localhost:3001/auth/google/callback`
5. Copy Client ID and Client Secret into `.env`

---

## API Endpoints

### `GET /auth/google`
Starts the Google OAuth flow. The Vue frontend does:
```js
window.location.href = `${VITE_API_URL}/auth/google`
```

### `GET /auth/google/callback`
Google redirects here after consent. The server signs a JWT and redirects to:
```
{FRONTEND_URL}/auth/callback?token=<jwt>
```
The `AuthCallback.vue` page reads the token, stores it in `localStorage`, and navigates to `/dashboard`.

### `POST /auth/login`
Casher email/password login.
```json
// Body
{ "email": "casher@shop.com", "password": "secret" }

// 200 Response
{ "token": "<jwt>", "user": { "id": 1, "name": "...", "type": "casher", ... } }
```

### `POST /auth/register`
Casher self-registration (always creates `type: 'casher'`).
```json
// Body
{ "name": "Jean Dupont", "login": "jean", "email": "jean@shop.com", "password": "secret" }

// 201 Response
{ "token": "<jwt>", "user": { ... } }
```

### `GET /auth/me`
Returns the authenticated user's profile.
```
Authorization: Bearer <token>
```

### `GET /health`
Health check — returns `{ "status": "ok" }`.

---

## JWT Payload

```ts
{
  sub:    number          // user.id
  email:  string
  type:   'admin' | 'casher'
  shopId: number | null
}
```

Use the `requireAuth` middleware to protect any route in other Express routers:
```ts
import { requireAuth, requireAdmin } from './middleware/auth'

router.get('/protected',  requireAuth,  handler)
router.get('/admin-only', requireAdmin, handler)
```

---

## Frontend Integration (Vue)

```ts
// .env in Vue project
VITE_API_URL=http://localhost:3001

// Attach token to every API request
const token = localStorage.getItem('token')
fetch(`${import.meta.env.VITE_API_URL}/some-route`, {
  headers: { Authorization: `Bearer ${token}` }
})
```

Add `AuthCallback.vue` to your router at `/auth/callback` — it handles the post-OAuth redirect automatically.
