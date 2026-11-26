import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

function wrapPcmAsWav(pcmBytes: Buffer, sampleRate = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBytes.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBytes.length, 40);

  return Buffer.concat([header, pcmBytes]);
}

function trimToSentence(text: string, maxChars = 750): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastStop = Math.max(slice.lastIndexOf("।"), slice.lastIndexOf("."));
  return lastStop > 180 ? slice.slice(0, lastStop + 1) : slice;
}

const GEMINI_TTS_MODELS = [
  "gemini-3.8-flash-lite-tts",
  "gemini-3.8-flash-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
];

export async function POST(req: NextRequest) {
  try {
    const { text, elevenLabsKey, geminiApiKey, voiceId } =
      (await req.json()) as {
        text?: string;
        elevenLabsKey?: string;
        geminiApiKey?: string;
        voiceId?: string;
      };

    const cleanText = (text || "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[*_`#[\]()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleanText) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const spokenSnippet = trimToSentence(cleanText, 650);

    // 1. ElevenLabs if explicitly provided
    const elKey = (elevenLabsKey || process.env.ELEVENLABS_API_KEY || "").trim();
    if (elKey) {
      const selectedVoice = voiceId?.trim() || "21m00Tcm4TlvDq8ikWAM";
      const ttsRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
          selectedVoice
        )}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": elKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: spokenSnippet,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.78,
            },
          }),
          signal: AbortSignal.timeout(18000),
        }
      );

      if (ttsRes.ok) {
        const audioBuffer = await ttsRes.arrayBuffer();
        return new NextResponse(audioBuffer, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      }
    }

    // 2. Gemini Neural TTS with fast lite model first and clean failover
    const gemKey = (geminiApiKey || process.env.GEMINI_API_KEY || "").trim();
    if (gemKey) {
      const ai = new GoogleGenAI({ apiKey: gemKey });
      let lastErr: unknown;
      for (const model of GEMINI_TTS_MODELS) {
        try {
          const ttsResponse = await ai.models.generateContent({
            model,
            contents: spokenSnippet,
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Kore" },
                },
              },
              httpOptions: { timeout: 22000 },
            },
          });

          const part = ttsResponse.candidates?.[0]?.content?.parts?.find(
            (p) => p.inlineData?.data
          );
          if (part?.inlineData?.data) {
            const raw = Buffer.from(part.inlineData.data, "base64");
            const mime = (part.inlineData.mimeType || "audio/wav").toLowerCase();
            const wavBytes = mime.includes("wav") ? raw : wrapPcmAsWav(raw, 24000);
            return new NextResponse(new Uint8Array(wavBytes), {
              headers: {
                "Content-Type": "audio/wav",
                "Cache-Control": "no-store",
              },
            });
          }
        } catch (err) {
          lastErr = err;
          continue;
        }
      }
      return NextResponse.json(
        {
          error:
            lastErr instanceof Error
              ? lastErr.message
              : "Gemini TTS generation failed",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "No TTS provider configured" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "TTS failed" },
      { status: 500 }
    );
  }
}
