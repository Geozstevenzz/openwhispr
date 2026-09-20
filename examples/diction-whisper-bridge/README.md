# Diction bridge for local Whisper

This dependency-free Node.js 24 adapter connects the official Diction gateway
to OpenWhispr's existing whisper.cpp server. It listens only on
`127.0.0.1:8179` and forwards transcription requests to
`http://127.0.0.1:8178/inference`. Start the whisper.cpp server with the
`large-v3-turbo` model first, then run `node bridge.mjs` from this directory.

Configure the Diction gateway with these environment variables:

```dotenv
CUSTOM_BACKEND_URL=http://127.0.0.1:8179
CUSTOM_BACKEND_MODEL=large-v3-turbo
CUSTOM_BACKEND_CANONICAL_ID=openai/whisper-large-v3-turbo
CUSTOM_BACKEND_NEEDS_WAV=true
DEFAULT_MODEL=custom
```

The gateway requires ffmpeg on PATH for its WAV conversion. The gateway
selects the fixed custom model; the bridge streams its multipart request
without parsing or storing the audio. The model field cannot switch the
model already loaded by whisper.cpp. Model discovery advertises
`large-v3-turbo`; `/health` checks the upstream server's health endpoint.

Connect the iPhone to the authenticated Diction gateway through Tailscale,
using the gateway's own pairing QR code. The bridge itself has no pairing
or authentication and must stay on loopback. It is not a general-purpose
OpenAI API server. It accepts WAV files prepared by the gateway, limits
uploads to 25 MiB, and times out transcription after two minutes. Client
disconnects close the upstream request, although whisper.cpp may finish
inference that has already started.

The bridge does not log audio, transcripts, or credentials. Review the
gateway and whisper.cpp logging settings separately.

Run the focused contract checks with `node --test bridge.test.mjs`.
