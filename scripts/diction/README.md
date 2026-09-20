# Diction on iPhone with local Whisper Turbo

These Windows helpers connect the [Diction iOS app](https://diction.one/features/self-hosting-setup) to OpenWhispr's existing whisper.cpp server. Speech stays between the phone and the home PC over Tailscale. The gateway uses the model already loaded by OpenWhispr; configure **Local > Whisper > Turbo** first as described in the root README.

The request path is:

```text
iPhone Diction -> Tailscale HTTPS :8443 -> Diction gateway 127.0.0.1:8180
  -> adapter 127.0.0.1:8179 -> OpenWhispr whisper.cpp 127.0.0.1:8178
```

The gateway authenticates the phone and converts supported recordings to WAV with FFmpeg. The adapter translates the transcription endpoint to whisper.cpp's `/inference`. There is no cloud transcription or text cleanup configured.

## Build and configure

Prerequisites: Windows, Node.js 24 installed under `%ProgramFiles%\nodejs`, Git, Go, FFmpeg, and Tailscale. OpenWhispr's local server must return a successful response at `http://127.0.0.1:8178/health`. The adapter is configured for that loopback port; an installation using another port needs the adapter's `upstreamPort` default adjusted.

1. Clone [DictionLabs/Diction](https://github.com/DictionLabs/Diction) into a separate source directory and check out commit `2a43ad59fd8f7eab0c529e81e4788412c7c68bbd`.
2. Create `.private\diction` in this fork, with `bin`, `logs`, and `tmp` subdirectories. Restrict its Windows permissions to your user and SYSTEM. The root `.gitignore` excludes `.private/`. This directory holds the signing key, configuration, and pairing QR; do not publish it.
3. From this fork, run `node scripts/diction/prepare-gateway.cjs <absolute-Diction-source-path>`. It verifies the pinned revision, restricts the gateway listener to loopback, suppresses its startup QR output, hides FFmpeg child windows, and builds the gateway and pairing helper into `.private\diction\bin`.
4. Save the configuration below in `.private\diction\.env`, replacing the three machine-specific paths/addresses. Values are literal, without surrounding quotes. Use an absolute key path inside the protected directory.

```dotenv
GATEWAY_PORT=8180
DEFAULT_MODEL=custom
CUSTOM_BACKEND_URL=http://127.0.0.1:8179
CUSTOM_BACKEND_MODEL=large-v3-turbo
CUSTOM_BACKEND_CANONICAL_ID=openai/whisper-large-v3-turbo
CUSTOM_BACKEND_NEEDS_WAV=true
DICTION_GATEWAY_AUTH=required
DICTION_KEY_PATH=C:\path\to\openwhispr\.private\diction\gateway-keys.json
DICTION_TOKEN_TTL=2160h
PUBLIC_URL=https://your-pc.your-tailnet.ts.net:8443
MAX_BODY_SIZE=26214400
AUTH_ENABLED=false
TEXT_ROUTES_OPEN=false
DICTION_FFMPEG_DIR=C:\path\to\ffmpeg\bin
```

`DICTION_GATEWAY_AUTH=required` enforces signed device tokens. The separate upstream `AUTH_ENABLED` setting is false because this setup does not use Diction's hosted account authentication. The gateway generates and persists its native signing keyring in `DICTION_KEY_PATH`; preserve that file with the private configuration. The canonical model ID is distinct from Diction's built-in Whisper alias.

5. Start `scripts\diction\start-hidden.vbs` with Windows Script Host. It launches the gateway and adapter without terminal windows. The supervisor restarts either child after an exit and uses loopback port 8181 to prevent duplicate supervisors.
6. Run `tailscale serve --bg --https=8443 --yes http://127.0.0.1:8180`. Tailscale may first require enabling HTTPS for the tailnet. Use the exact hostname shown by Tailscale in `PUBLIC_URL`. This is private Serve access, not Funnel. Port 8443 leaves an existing HTTPS service on port 443 intact.
7. Run `node scripts/diction/create-pairing-qr.cjs`. It issues an official Diction device token, verifies it through the HTTPS gateway, and saves `.private\diction\pairing.png`. It does not print the token. An optional WAV file argument also tests real transcription through the same authenticated endpoint before creating the QR.

## Pair the iPhone

1. Turn on Tailscale on the iPhone and connect it to the same tailnet as the PC.
2. Open `pairing.png` on the PC. Treat it like a password, since it contains a signed device credential.
3. In Diction, choose the self-hosted option and **Scan to pair**. Scan the QR on the PC screen. Select **Custom** if prompted for a backend.
4. Record a short sentence and verify the returned text on the phone. The tested installation passed synthetic speech through the authenticated HTTPS endpoint; pairing and microphone behavior still need to be checked on the actual iPhone.

Tokens have a 90-day lifetime; Diction's gateway supports refresh and rotation. If the app requires pairing again, rerun the QR helper. Generating another QR does not revoke a previously issued token.

## Start at Windows sign-in

Enable **Launch at login** in OpenWhispr. Add a per-user Windows Run entry named `Diction Home Voice Server` with this command, replacing the repository path:

```text
"C:\Windows\System32\wscript.exe" "C:\path\to\openwhispr\scripts\diction\start-hidden.vbs"
```

Keep the entry enabled in Startup apps. Tailscale Serve's `--bg` configuration persists with the Tailscale service. These app startup entries run after Windows sign-in. The PC must stay powered on and awake; the setup does not wake a sleeping PC or load OpenWhispr before sign-in.

For diagnosis, check the private `logs` folder and `http://127.0.0.1:8181` for child process IDs. `/health` checks reachability; it does not prove transcription or authentication. A transcription request without a bearer token must return 401. Avoid sharing the private keyring, QR, or recordings in troubleshooting reports.
