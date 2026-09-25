import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { pool, migrate } from "./db.js";
import { steamLoginUrl, validateSteamCallback, getSteamOwnedAppIds, randomState } from "./steam.js";
import { allocateHost, gatewayUrl, signStreamToken } from "./session.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60_000, limit: 180 }));
app.use((req,res,next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.WEB_BASE_URL || "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const sessions = new Map(); // dev-only auth sessions; use Redis in production

function userFromReq(req) {
  const sid = req.cookies.z_session;
  return sid ? sessions.get(sid) : null;
}

function requireUser(req,res,next) {
  const user = userFromReq(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });
  req.user = user;
  next();
}

app.get("/health", (_,res) => res.json({ ok: true, service: "zoltrocloud-api" }));

app.post("/api/auth/register", async (req,res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password || !displayName || password.length < 8)
    return res.status(400).json({ error: "email, displayName and 8+ char password required" });
  const hash = await bcrypt.hash(password, 12);
  const id = crypto.randomUUID();
  try {
    await pool.query(
      `INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)`,
      [id,email.toLowerCase(),hash,displayName]
    );
  } catch {
    return res.status(409).json({ error: "email_already_used" });
  }
  const sid = crypto.randomUUID(); sessions.set(sid,{id,email:email.toLowerCase(),displayName});
  res.cookie("z_session", sid, { httpOnly:true, sameSite:"lax", secure:false, maxAge:7*86400000 });
  res.json({ user: sessions.get(sid) });
});

app.post("/api/auth/login", async (req,res) => {
  const { email, password } = req.body || {};
  const { rows } = await pool.query(`SELECT * FROM users WHERE email=$1`, [String(email||"").toLowerCase()]);
  const u = rows[0];
  if (!u || !u.password_hash || !(await bcrypt.compare(password || "", u.password_hash)))
    return res.status(401).json({ error:"invalid_credentials" });
  const sid=crypto.randomUUID();
  sessions.set(sid,{id:u.id,email:u.email,displayName:u.display_name,steamId:u.steam_id});
  res.cookie("z_session",sid,{httpOnly:true,sameSite:"lax",secure:false,maxAge:7*86400000});
  res.json({user:sessions.get(sid)});
});

app.post("/api/auth/logout", (req,res) => {
  const sid=req.cookies.z_session; if(sid) sessions.delete(sid);
  res.clearCookie("z_session"); res.json({ok:true});
});

app.get("/api/auth/me", (req,res) => res.json({user:userFromReq(req)}));

app.get("/api/auth/steam", (req,res) => {
  const state=randomState();
  res.cookie("steam_state",state,{httpOnly:true,sameSite:"lax",secure:false,maxAge:10*60*1000});
  res.redirect(steamLoginUrl(state));
});

app.get("/api/auth/steam/callback", async (req,res) => {
  try {
    if (!req.query.state || req.query.state !== req.cookies.steam_state) throw new Error("bad_state");
    const steamId = await validateSteamCallback(req.query);
    const existing = userFromReq(req);
    if (existing) {
      await pool.query(`UPDATE users SET steam_id=$1 WHERE id=$2`,[steamId,existing.id]);
      existing.steamId=steamId;
      return res.redirect((process.env.WEB_BASE_URL||"http://localhost:3000")+"/account?steam=linked");
    }
    const found = await pool.query(`SELECT * FROM users WHERE steam_id=$1`,[steamId]);
    let user = found.rows[0];
    if (!user) {
      const id=crypto.randomUUID();
      await pool.query(
        `INSERT INTO users(id,display_name,steam_id) VALUES($1,$2,$3)`,
        [id,`Steam ${steamId.slice(-6)}`,steamId]
      );
      user=(await pool.query(`SELECT * FROM users WHERE id=$1`,[id])).rows[0];
    }
    const sid=crypto.randomUUID();
    sessions.set(sid,{id:user.id,email:user.email,displayName:user.display_name,steamId});
    res.cookie("z_session",sid,{httpOnly:true,sameSite:"lax",secure:false,maxAge:7*86400000});
    res.redirect((process.env.WEB_BASE_URL||"http://localhost:3000")+"/?steam=ok");
  } catch (e) {
    res.status(400).send(`Steam authentication failed: ${e.message}`);
  }
});

app.get("/api/games", async (req,res) => {
  const {rows}=await pool.query(`SELECT * FROM games ORDER BY name`);
  res.json({games:rows});
});

app.get("/api/games/:id", async (req,res) => {
  const {rows}=await pool.query(`SELECT * FROM games WHERE id=$1`,[req.params.id]);
  if(!rows[0]) return res.sendStatus(404);
  res.json({game:rows[0]});
});

app.post("/api/hosts/register", async (req,res) => {
  const {name,region,endpoint} = req.body||{};
  if(!name||!region||!endpoint) return res.status(400).json({error:"missing_fields"});
  const id=crypto.randomUUID();
  await pool.query(`INSERT INTO gpu_hosts(id,name,region,endpoint,status) VALUES($1,$2,$3,$4,'ready')`,[id,name,region,endpoint]);
  res.json({id});
});

app.post("/api/hosts/:id/heartbeat", async (req,res) => {
  await pool.query(`UPDATE gpu_hosts SET status=$1 WHERE id=$2`,[req.body?.status||"ready",req.params.id]);
  res.json({ok:true});
});

app.post("/api/sessions/launch", requireUser, async (req,res) => {
  const gameId=req.body?.gameId;
  const {rows:games}=await pool.query(`SELECT * FROM games WHERE id=$1`,[gameId]);
  if(!games[0]) return res.status(404).json({error:"game_not_found"});
  const game=games[0];

  if (game.store === "steam" && req.user.steamId) {
    const owned = await getSteamOwnedAppIds(req.user.steamId);
    if (owned && !owned.has(game.app_id))
      return res.status(403).json({error:"game_not_owned"});
  } else if (game.store === "steam" && !req.user.steamId) {
    return res.status(403).json({error:"link_steam_first"});
  }

  const host=await allocateHost();
  if(!host) return res.status(503).json({error:"no_gpu_available"});

  const id=crypto.randomUUID();
  const expires=new Date(Date.now()+Number(process.env.DEFAULT_SESSION_MINUTES||60)*60_000);
  const token=signStreamToken({sessionId:id,userId:req.user.id,hostId:host.id,exp:expires.getTime()});
  const stream=gatewayUrl(id,token);

  await pool.query(
    `INSERT INTO sessions(id,user_id,game_id,host_id,status,stream_url,started_at,expires_at)
     VALUES($1,$2,$3,$4,'starting',$5,NOW(),$6)`,
    [id,req.user.id,gameId,host.id,stream,expires]
  );
  await pool.query(`UPDATE gpu_hosts SET active_session_id=$1,status='busy' WHERE id=$2`,[id,host.id]);

  // A production deployment should call the GPU agent here to launch the selected executable.
  // The agent contract is documented in infra/gpu-agent.md.
  await pool.query(`UPDATE sessions SET status='ready' WHERE id=$1`,[id]);

  res.json({session:{id,gameId,status:"ready",streamUrl:stream,expiresAt:expires}});
});

app.get("/api/sessions/:id", requireUser, async (req,res) => {
  const {rows}=await pool.query(`SELECT s.*,g.name game_name FROM sessions s JOIN games g ON g.id=s.game_id WHERE s.id=$1 AND s.user_id=$2`,[req.params.id,req.user.id]);
  if(!rows[0]) return res.sendStatus(404);
  res.json({session:rows[0]});
});

app.post("/api/sessions/:id/stop", requireUser, async (req,res) => {
  const {rows}=await pool.query(`SELECT * FROM sessions WHERE id=$1 AND user_id=$2`,[req.params.id,req.user.id]);
  const s=rows[0]; if(!s) return res.sendStatus(404);
  await pool.query(`UPDATE sessions SET status='stopped',ended_at=NOW() WHERE id=$1`,[s.id]);
  if(s.host_id) await pool.query(`UPDATE gpu_hosts SET active_session_id=NULL,status='ready' WHERE id=$1`,[s.host_id]);
  res.json({ok:true});
});

app.get("/api/account",requireUser,async(req,res)=>{
  const {rows}=await pool.query(`SELECT id,email,display_name,steam_id,created_at FROM users WHERE id=$1`,[req.user.id]);
  res.json({account:rows[0]});
});

const port=Number(process.env.PORT||8080);
migrate().then(()=>app.listen(port,()=>console.log(`ZoltroCloud API listening on ${port}`))).catch(err=>{console.error(err);process.exit(1)});
