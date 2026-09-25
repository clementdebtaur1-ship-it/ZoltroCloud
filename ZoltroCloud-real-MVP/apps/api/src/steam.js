import crypto from "node:crypto";

const steamOpenId = "https://steamcommunity.com/openid/";
const apiKey = process.env.STEAM_API_KEY;

export function steamLoginUrl(state) {
  const returnUrl = process.env.STEAM_RETURN_URL;
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${returnUrl}?state=${encodeURIComponent(state)}`,
    "openid.realm": new URL(returnUrl).origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select"
  });
  return `${steamOpenId}?${params}`;
}

export async function validateSteamCallback(query) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith("openid.")) params.set(k, v);
  }
  params.set("openid.mode", "check_authentication");

  const response = await fetch(steamOpenId, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params
  });
  const text = await response.text();
  if (!text.includes("is_valid:true")) throw new Error("Steam OpenID validation failed");

  const claimed = query["openid.claimed_id"];
  const match = String(claimed).match(/\/id\/(\d+)$/);
  if (!match) throw new Error("SteamID missing");
  return match[1];
}

export async function getSteamOwnedAppIds(steamId) {
  if (!apiKey) return null;
  const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "false");
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Steam API error ${r.status}`);
  const data = await r.json();
  return new Set((data.response?.games || []).map(g => String(g.appid)));
}

export function randomState() {
  return crypto.randomBytes(24).toString("hex");
}
