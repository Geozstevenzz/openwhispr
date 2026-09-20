<p align="center">
  <img src="src/assets/logo.svg" alt="OpenWhispr" width="120" />
</p>

<h1 align="center">OpenWhispr</h1>

<p align="center">
  <a href="https://github.com/OpenWhispr/openwhispr/blob/main/LICENSE"><img src="https://img.shields.io/github/license/OpenWhispr/openwhispr?style=flat" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat" alt="Platform" />
  <a href="https://github.com/OpenWhispr/openwhispr/releases/latest"><img src="https://img.shields.io/github/v/release/OpenWhispr/openwhispr?style=flat&sort=semver" alt="GitHub release" /></a>
  <a href="https://github.com/OpenWhispr/openwhispr/releases"><img src="https://img.shields.io/github/downloads/OpenWhispr/openwhispr/total?style=flat&color=blue" alt="Downloads" /></a>
  <a href="https://github.com/OpenWhispr/openwhispr/stargazers"><img src="https://img.shields.io/github/stars/OpenWhispr/openwhispr?style=flat" alt="GitHub stars" /></a>
</p>

<p align="center">
  The open-source and free alternative to WisprFlow and Granola.<br/>
  Privacy-first voice-to-text dictation with AI agents, meeting transcription, and notes. Cross-platform for macOS, Windows, and Linux.
</p>

<p align="center">
  <a href="https://openwhispr.com">Website</a> &middot;
  <a href="https://docs.openwhispr.com">Docs</a> &middot;
  <a href="https://github.com/OpenWhispr/openwhispr/releases/latest">Download</a> &middot;
  <a href="https://docs.openwhispr.com/api/overview">API</a> &middot;
  <a href="https://github.com/OpenWhispr/openwhispr/blob/main/CHANGELOG.md">Changelog</a>
</p>

---

OpenWhispr turns your voice into text, notes, and actions from your desktop. Press a hotkey, speak, and your words appear at your cursor. Choose between fully private offline transcription with local speech-to-text models like Orukeet, Whisper, NVIDIA Parakeet, and Cohere Transcribe — where your audio never leaves your device — or cloud processing for speed. No data collection, no telemetry, fully open source.

## Download

| Platform              | Download                                                                                                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS (Apple Silicon) | [`.dmg`](https://github.com/OpenWhispr/openwhispr/releases/latest)                                                                                                                                                                                                                        |
| macOS (Intel) \*      | [`.dmg`](https://github.com/OpenWhispr/openwhispr/releases/latest)                                                                                                                                                                                                                        |
| Windows               | [`.exe`](https://github.com/OpenWhispr/openwhispr/releases/latest)                                                                                                                                                                                                                        |
| Linux                 | [`.AppImage`](https://github.com/OpenWhispr/openwhispr/releases/latest) / [`.deb`](https://github.com/OpenWhispr/openwhispr/releases/latest) / [`.rpm`](https://github.com/OpenWhispr/openwhispr/releases/latest) / [`.tar.gz`](https://github.com/OpenWhispr/openwhispr/releases/latest) |

\* On Intel Macs, live speaker identification and voice fingerprinting are unavailable: they depend on ONNX Runtime, which [stopped shipping macOS x86_64 binaries in 1.24](https://github.com/microsoft/onnxruntime/releases/tag/v1.24.1). Meetings still record and transcribe normally, and notes search falls back to keyword matching instead of semantic search.

## Configure local Whisper large-v3-turbo

This fork documents the local voice-to-text setup used with OpenWhispr 1.10.2 on Windows. The speech model is **Whisper large-v3-turbo**, listed as **Turbo** in OpenWhispr. It is the same speech model specified in [Sotto's model instructions](https://github.com/davis7dotsh/sotto/blob/main/Server/README.md#models). OpenWhispr runs it directly through whisper.cpp; no Sotto server, account, or API key is required.

### Select and download the model

1. Install OpenWhispr from the [upstream releases](https://github.com/OpenWhispr/openwhispr/releases/latest). Choose **Continue without an account** during setup if you only want local dictation.
2. Open **Settings > Speech-to-Text > Dictation** and select **Local**.
3. Choose **Whisper**, download **Turbo** (about 1.6 GB), and make sure it is selected after the download finishes. Its internal model ID is `turbo` and its file is `ggml-large-v3-turbo.bin`.
4. Set the transcription language to automatic detection, or select the language you speak. Choose your microphone in Settings; this setup uses the Windows default microphone.
5. Turn off **Enable text cleanup** and the dictation AI agent to match this speech-only setup. Leave cloud fallback disabled. Sotto's Qwen proofreading model is a separate text model and is not needed for voice-to-text.
6. If you also use **Note Recording** or **Audio Upload**, select Local, Whisper, and Turbo in those tabs too. They have separate transcription settings.

The model download needs internet access. Once downloaded, this dictation configuration runs locally without sending audio to a cloud transcription provider.

### GPU acceleration

Enable GPU acceleration in the local transcription settings and let OpenWhispr download the supported GPU pack. The app selects a backend based on the hardware and installed packs; a fresh NVIDIA installation may offer CUDA.

The installation documented here was verified with **Vulkan on an NVIDIA GeForce GTX 1080 (8 GB VRAM)**, an AMD Ryzen 9 5900X, and 64 GB RAM. Those are the tested machine's specifications, not minimum requirements. A working Vulkan installation can be retained; CUDA is not required to use Turbo. CPU transcription also uses the same model, but latency will depend on the machine.

### Model file and exact version

With the default Windows cache location, the model is stored at:

```text
%USERPROFILE%\.cache\openwhispr\whisper-models\ggml-large-v3-turbo.bin
```

For the exact weights used in this setup, use [Sotto's pinned model download](https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo.bin). If downloading manually, fully quit OpenWhispr first, place the file in the folder above, then reopen the app and select Turbo. Do not replace an existing model without preserving a copy.

| Check | Expected value |
| --- | --- |
| File size | 1,624,555,275 bytes |
| SHA-256 | `1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69` |

The checksum comes from [Sotto's download script](https://github.com/davis7dotsh/sotto/blob/main/scripts/download-model.sh). OpenWhispr's built-in download uses the model repository's `main` revision, so use the pinned link when exact file reproducibility matters.

### Use dictation and start with Windows

Set the dictation hotkey to **Ctrl + Windows**, choose **Tap** activation, and enable **Automatic pasting**. Place the cursor in a text field, press the hotkey, speak, and press it again to finish and paste. If the shortcut conflicts with another application, choose another in Settings.

Enable **Settings > General > Launch at login** to start OpenWhispr in the system tray when you sign in to Windows. Confirm it is enabled in **Task Manager > Startup apps**.

To check the setup, restart OpenWhispr, confirm Turbo remains selected, and dictate a short sentence into a text editor. The documented installation passed a synthetic speech transcription test with GPU acceleration active. Test your own microphone and automatic pasting as well.

### Use the same model from an iPhone

[Diction](https://diction.one/features/self-hosting-setup) can connect to this PC through Tailscale and use the same local Whisper Turbo model. This fork includes a Windows gateway launcher, a whisper.cpp adapter, and a private pairing QR helper. See the [Diction setup instructions](scripts/diction/README.md).

The PC must be awake, signed in, and running OpenWhispr. On the iPhone, enable Tailscale, then use Diction's self-hosted **Scan to pair** option. The QR contains a device credential; keep it private. Select **Custom** if Diction asks which backend to use.

## Features

- **Voice dictation** — global hotkey to dictate into any app with automatic pasting
- **Dictation translation** — dedicated hotkey to dictate in one language and paste the text in another
- **AI agent** — talk to GPT-5, Claude, Gemini, Groq, Tinfoil, OpenRouter, or local models with a named voice assistant
- **Voice Assistant hotkey** — dedicated hotkey that sends what you say straight to your AI assistant as a command, no wake word needed and no cleanup pass; highlighted text is edited in place. With auto-paste enabled, answers paste at a focused text cursor or stream into a floating panel and copy to the clipboard when no writable cursor is available. You can also opt in to sending a screenshot of your current screen as context
- **Meeting transcription** — auto-detect Zoom, Teams, and FaceTime calls with live speaker diarization, voice fingerprinting, and Google, Microsoft, or Apple Calendar integration
- **Local speaker diarization** — on-device speaker labelling with voice fingerprint recognition across meetings, no cloud required
- **Notes** — create, organize, and search notes with folders, semantic search, cloud sync, and AI actions
- **Team spaces & sharing** — free for signed-in users; share notes on the web with link, domain, or invite-only visibility, and collaborate in team spaces with roles, invitations, and server-enforced membership
- **Audio import** — transcribe existing audio and video: drag in files, batch-upload, or paste a YouTube/audio URL, with optional speaker detection
- **Local or cloud — your choice** — all core features (transcription, AI reasoning, speaker diarization, semantic search) work with local models or cloud providers — including GPU-accelerated local Whisper on Metal, CUDA, and Vulkan (AMD/Intel)
- **Enterprise controls** — enforce organization policy, company SSO and SCIM, and centrally managed Amazon Bedrock or Azure OpenAI access without distributing cloud keys
- **Public API & MCP** — manage notes and transcriptions programmatically or connect your AI assistant via the [MCP server](https://docs.openwhispr.com/integrations/mcp)

## Quick start

```bash
git clone https://github.com/OpenWhispr/openwhispr.git
cd openwhispr
npm install
npm run dev
```

Requires Node.js 24+. See the [full documentation](https://docs.openwhispr.com/quickstart) for setup guides, platform-specific instructions, and build details.

## Documentation

Visit **[docs.openwhispr.com](https://docs.openwhispr.com)** for:

- [Getting started](https://docs.openwhispr.com/quickstart)
- [Platform guides](https://docs.openwhispr.com/platform/macos) (macOS, Windows, Linux)
- [API reference](https://docs.openwhispr.com/api/overview)
- [MCP server setup](https://docs.openwhispr.com/integrations/mcp)
- [Troubleshooting](https://docs.openwhispr.com/troubleshooting)

Repo examples:

- [Custom ASR shim](examples/custom-asr-shim/) for Self-Hosted transcription against non-OpenAI-compatible ASR APIs

## Tech stack

React 19, TypeScript, Tailwind CSS v4, Electron 41, better-sqlite3, whisper.cpp, sherpa-onnx, shadcn/ui

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=OpenWhispr/openwhispr&type=date&legend=top-left)](https://www.star-history.com/#OpenWhispr/openwhispr&type=date&legend=top-left)

## Sponsors

<p align="center">
  <a href="https://console.neon.tech/app/?promo=openwhispr">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
      <img width="250" alt="Neon" src="https://neon.com/brand/neon-logo-light-color.svg">
    </picture>
  </a>
</p>

<p align="center"><a href="https://console.neon.tech/app/?promo=openwhispr">Neon</a> is the serverless Postgres platform powering OpenWhispr Cloud.</p>

## Contributing

We welcome contributions. Fork the repo, create a feature branch, and open a pull request. See the [contributing guide](https://docs.openwhispr.com/contributing) for development setup and guidelines.

## License

[MIT](LICENSE) — free for personal and commercial use.

## Acknowledgments

- **[OpenAI Whisper](https://github.com/openai/whisper)** — speech recognition model powering local and cloud transcription
- **[whisper.cpp](https://github.com/ggerganov/whisper.cpp)** — high-performance C++ implementation for local processing
- **[NVIDIA Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)** — fast multilingual ASR model
- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** — cross-platform ONNX runtime for Parakeet inference
- **[Hugging Face](https://huggingface.co/)** — model hub hosting Whisper, Parakeet, and embedding model weights
- **[llama.cpp](https://github.com/ggerganov/llama.cpp)** — local LLM inference for AI text processing
- **[Electron](https://www.electronjs.org/)** — cross-platform desktop framework
- **[React](https://react.dev/)** — UI component library
- **[shadcn/ui](https://ui.shadcn.com/)** — accessible components built on Radix primitives
- **[Neon](https://console.neon.tech/app/?promo=openwhispr)** — serverless Postgres powering OpenWhispr Cloud
