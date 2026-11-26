import { Type, type FunctionDeclaration } from "@google/genai";

export const LIVE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_live_news",
    description:
      "Fetches today's latest live news headlines and visits news portals (BBC Bangla, Google News BD, The Daily Star). Call this whenever the user asks for news, current events, breaking news, or 'ajker news'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: {
          type: Type.STRING,
          description:
            "Optional topic filter like 'Bangladesh', 'technology', 'cricket', 'world'.",
        },
        language: {
          type: Type.STRING,
          description: "Preferred language: 'bn', 'en', or 'both'.",
        },
      },
    },
  },
  {
    name: "visit_website",
    description:
      "Visits any public website URL in real time and extracts its title, headings, and readable text.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: "The URL or domain to visit, e.g. 'https://www.bbc.com/bengali'.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "get_live_weather",
    description:
      "Fetches live real-time weather temperature, condition, humidity, and wind speed for a city.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        city: {
          type: Type.STRING,
          description: "City name such as 'Dhaka', 'Chattogram', 'Sylhet'.",
        },
      },
    },
  },
  {
    name: "search_wikipedia",
    description:
      "Looks up factual knowledge, people, places, science, or definitions on Wikipedia.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Topic or entity to look up.",
        },
        preferBangla: {
          type: Type.BOOLEAN,
          description: "True if Bengali context is preferred.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_web",
    description:
      "Searches the live internet for any current topic, exchange rates, scores, recent events, products, or factual answers beyond headlines.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Search query.",
        },
        preferBangla: {
          type: Type.BOOLEAN,
          description: "True if Bengali context/results are helpful.",
        },
      },
      required: ["query"],
    },
  },
];

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function pcm24kBase64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLen = binary.length;
  const sampleCount = Math.floor(byteLen / 2);
  const float32 = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    let int16 = (hi << 8) | lo;
    if (int16 >= 0x8000) int16 -= 0x10000;
    float32[i] = int16 / 32768;
  }
  return float32;
}

export function formatCallDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
