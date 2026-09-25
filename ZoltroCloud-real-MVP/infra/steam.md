# Steam setup

Steam's official documentation supports browser authentication through OpenID and also documents OAuth for partner applications.

For this MVP:
- users authenticate on Steam's own domain;
- ZoltroCloud receives the SteamID;
- the server stores the SteamID, not the user's Steam password;
- ownership checks are server-side.

Set:
STEAM_API_KEY=...
STEAM_RETURN_URL=https://YOUR_API_DOMAIN/api/auth/steam/callback

Never put `STEAM_API_KEY` in frontend JavaScript.
