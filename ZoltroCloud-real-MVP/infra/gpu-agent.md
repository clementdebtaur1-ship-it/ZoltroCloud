# GPU host contract

A GPU worker is intentionally separate from the public API.

Recommended host:
- Windows Server/Windows 11 or Linux;
- NVIDIA GPU with hardware encoder;
- Steam installed;
- Sunshine or a compatible host;
- a browser WebRTC bridge such as `moonlight-web-stream`;
- isolated OS user/VM per customer session.

The control plane should expose only authenticated actions:

POST /agent/launch
```json
{"sessionId":"...","gameId":"steam-730","appId":"730","executable":"cs2.exe"}
```

POST /agent/stop
```json
{"sessionId":"..."}
```

POST /agent/heartbeat
```json
{"status":"ready","encoder":"nvenc","gpu":"..."}
```

The API server marks a host `busy` before requesting launch. The worker should:
1. verify the signed job token;
2. ensure the VM/session belongs to the requested user;
3. launch the game;
4. report `running`;
5. terminate the process and wipe session-local state on stop;
6. report `ready`.

Do not expose the worker admin port directly to the Internet. Put it behind a private network or mTLS/VPN.

## Browser gateway

For the first MVP, deploy an actual browser WebRTC gateway on the same GPU host or a private streaming tier and configure:

STREAM_GATEWAY_BASE_URL=https://stream.example.com

The gateway receives the short-lived ZoltroCloud stream token. Before accepting a connection it must validate:
- signature;
- expiration;
- session id;
- user id;
- host id;
- that the session is still active.

A public deployment should use TURN and TLS.
