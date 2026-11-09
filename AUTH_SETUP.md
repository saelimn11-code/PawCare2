# Meow Museum authentication

Email/password accounts and sessions are stored in `data/users.json` and
`data/sessions.json`. Passwords are hashed with Node.js `scrypt`; session
cookies are HTTP-only and same-site. Keep these files private and back them up
securely.

## Local setup

1. Copy `.env.example` to `.env`.
2. Register OAuth web clients and use these callback URLs:
   - Google: `http://localhost:3001/auth/google/callback`
   - LINE Login: `http://localhost:3001/auth/line/callback`
   - Facebook: `http://localhost:3001/auth/facebook/callback`
3. Put the client ID and secret for Google/Facebook or channel ID and secret
   for LINE in `.env`. Never commit `.env` or send the secrets in chat.
4. Install the server dependencies with `npm install`.
5. Start the server with `npm start` (Node.js 18 or newer).

OAuth buttons open a provider sign-in window and return to the page after
success. They work after the matching app credentials and callback URLs are
configured. Facebook Login must be enabled for the app and request the
`public_profile` and `email` permissions. LINE must allow the `openid`,
`profile`, and `email` scopes if email is needed.

## Production

Set `NODE_ENV=production`, `PUBLIC_BASE_URL` to the public HTTPS origin, and
register the exact HTTPS callback URLs with each provider. Persist the `data`
directory across deployments. This file-backed account store is suitable for a
single server instance; use a shared database and session store before running
multiple instances.
