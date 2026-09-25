# ZoltroCloud — real cloud-gaming MVP

This repository is a real backend/frontend foundation for a browser cloud-gaming service.

It includes:
- real email/password accounts;
- PostgreSQL persistence;
- Steam OpenID login/linking;
- a game catalog;
- ownership checks through a server-side Steam Web API key;
- GPU host/session registration;
- launch/stop session APIs;
- a browser stream hand-off to a configured WebRTC browser gateway;
- the original ZoltroCloud visual assets;
- Docker Compose for PostgreSQL + API + web;
- a GPU-host agent contract for Sunshine/browser-stream infrastructure.

## Important

A website alone cannot provide GPU compute. To actually play games, you must attach at least one Windows/Linux GPU machine with:
1. Steam/Epic/etc. installed as permitted by the platform;
2. the games installed or installable;
3. Sunshine or another compatible host;
4. a browser-compatible streaming gateway (WebRTC).

For a browser MVP, this project expects a gateway URL in `STREAM_GATEWAY_BASE_URL`. An example compatible project is `moonlight-web-stream`, which bridges Sunshine/GameStream to browser WebRTC.

Do not ask users for their Steam password. Steam's documented browser flow uses OpenID, and Steam also documents OAuth for partner applications. Ownership checks and publisher keys belong on the server, never in browser code.

## Quick start

Requirements:
- Docker + Docker Compose
- Node 20+ if running outside Docker

1. Copy `.env.example` to `.env`.
2. Set `SESSION_SECRET`.
3. For Steam linking, configure:
   - `STEAM_API_KEY`
   - `STEAM_RETURN_URL`, e.g. `https://your-domain.example/api/auth/steam/callback`
   - `PUBLIC_BASE_URL`
4. Set `STREAM_GATEWAY_BASE_URL` to your browser-stream gateway.
5. Start:

```bash
docker compose up --build
```

Then open:
- Web: http://localhost:3000
- API health: http://localhost:8080/health

## Steam

The API uses Steam OpenID for browser login/linking. The callback validates the claimed Steam ID with Steam's OpenID endpoint.

Ownership synchronization is deliberately server-side. The code supports a publisher-key based ownership lookup where available; for a production catalog, keep a curated list of supported games and verify each title's ownership before launch.

## Browser streaming

The application does not pretend that an HTML `<video>` element is a cloud-gaming transport. The `stream` page hands the session to a real WebRTC gateway.

Set:

```env
STREAM_GATEWAY_BASE_URL=https://stream.example.com
```

The backend returns a signed, short-lived stream URL containing the session id. The gateway must enforce the same authorization contract before allowing the browser to connect.

## Production hardening

Before public launch:
- HTTPS everywhere;
- secure, httpOnly, sameSite cookies;
- Redis-backed sessions instead of memory;
- rate limits;
- CSRF protection for browser state-changing routes;
- encrypted provider tokens;
- per-user GPU isolation;
- short-lived stream tokens;
- TURN for difficult NATs;
- monitoring and automatic host draining;
- a proper VM image / provisioning system;
- publisher/store policy review for every supported storefront.

## Architecture

Browser -> Web app -> API -> PostgreSQL
                         |
                         +-> Steam identity / ownership
                         |
                         +-> Session manager -> GPU host
                                              |
                                              +-> game process
                                              +-> encoder
                                              +-> WebRTC gateway -> Browser
