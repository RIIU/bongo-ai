# Bongo Voice Assistant

Bilingual (Bengali & English) real-time AI voice assistant featuring an audio-reactive optical plasma ring, full-duplex Gemini Live voice sessions, neural TTS, and live website & news intelligence.

## Features
- **Continuous Full-Duplex Live Voice**: Real-time bidirectional PCM audio streaming via Gemini Live (`gemini-3.1-flash-live-preview`) with barge-in interruption, streaming captions, and ephemeral token auth.
- **Audio-Reactive Optical Plasma Ring**: 60fps canvas visualizer driven by Web Audio `AnalyserNode` across listening, web browsing, and speaking states.
- **Live Website Visiting & News Reader**: Real-time tool calling (`get_live_news`, `search_web`, `visit_website`, `get_live_weather`, `search_wikipedia`) with clickable source cards.
- **Multi-Model Failover**: Automatic fallback across Gemini models and continuous Web Speech API loop for high availability.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Add your `GEMINI_API_KEY` inside `.env.local` (or enter it in the in-app Preferences dialog).

3. Run locally:
   ```bash
   npm run dev
   ```
   Or build and start production:
   ```bash
   npm run build && npm run start
   ```
