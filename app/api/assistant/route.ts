import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type, type Content, type FunctionDeclaration } from "@google/genai";
import {
  fetchLiveNews,
  fetchLiveWeather,
  searchLiveWeb,
  searchWikipedia,
  visitWebsite,
  type VisitedSite,
} from "@/lib/web-browser";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AssistantRequest {
  message?: string;
  history?: ChatMessage[];
  languagePreference?: "auto" | "bn" | "en";
  geminiApiKey?: string;
  audioBase64?: string;
  audioMimeType?: string;
}

function detectBanglaOrBanglish(text: string): "bn" | "en" {
  if (/[\u0980-\u09FF]/.test(text)) return "bn";
  const banglishMarkers =
    /\b(ajker|khobor|bolo|kemon|acho|koro|korba|ki|keno|kothay|koyta|baje|ami|tumi|bangla|dhaka|chittagong|sylhet|bongo|abohawa|taka|naam|tomar|amar|shuno|dekhau|visit)\b/i;
  if (banglishMarkers.test(text)) return "bn";
  return "en";
}

function cleanSpeechText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUrlFromText(text: string): string | null {
  const fullUrl = text.match(/https?:\/\/[^\s,)]+/i);
  if (fullUrl) return fullUrl[0];
  const domainLike = text.match(
    /\b([a-z0-9-]+\.(?:com|org|net|edu|gov|io|ai|bd|com\.bd|co\.uk)(?:\/[^\s,)]*)?)\b/i
  );
  if (domainLike) return `https://${domainLike[1]}`;
  return null;
}

function extractNewsTopic(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/(cricket|খেলা|sports|football|বিশ্বকাপ|ক্রিকেট)/i.test(t)) return "cricket sports";
  if (/(tech|technology|ai|প্রযুক্তি|বিজ্ঞান|science)/i.test(t)) return "technology AI";
  if (/(business|economy|stock|টাকা|অর্থনীতি|ব্যবসা)/i.test(t)) return "business economy";
  if (/(world|international|বিশ্ব|আন্তর্জাতিক)/i.test(t)) return "world news";
  if (/(bangladesh|বাংলাদেশ|dhaka|ঢাকা)/i.test(t)) return "Bangladesh";
  return undefined;
}

function extractCity(text: string): string {
  const cities = [
    "dhaka",
    "chattogram",
    "chittagong",
    "sylhet",
    "rajshahi",
    "khulna",
    "barishal",
    "rangpur",
    "kolkata",
    "london",
    "new york",
    "tokyo",
    "dubai",
  ];
  const lower = text.toLowerCase();
  for (const c of cities) {
    if (lower.includes(c)) return c;
  }
  if (/ঢাকা/.test(text)) return "Dhaka";
  if (/চট্টগ্রাম/.test(text)) return "Chattogram";
  if (/সিলেট/.test(text)) return "Sylhet";
  if (/কলকাতা/.test(text)) return "Kolkata";
  return "Dhaka";
}

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_live_news",
    description:
      "Fetches today's latest live news headlines and visits news portals (BBC Bangla, Google News BD, The Daily Star). Use whenever the user asks for today's news, current events, breaking news, sports/tech/world news, or 'ajker news'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: {
          type: Type.STRING,
          description:
            "Optional topic filter like 'Bangladesh', 'technology', 'cricket', 'world', or leave empty for top headlines.",
        },
        language: {
          type: Type.STRING,
          description: "Preferred news language: 'bn', 'en', or 'both'.",
        },
      },
    },
  },
  {
    name: "visit_website",
    description:
      "Visits any public website URL in real time, reads its title, headings, and main article text. Use whenever the user asks to visit, open, read, or summarize a specific website.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: "The website URL or domain to visit, e.g. 'https://www.bbc.com/bengali'.",
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
          description: "City name, e.g. 'Dhaka', 'Chattogram', 'Sylhet', 'London'.",
        },
      },
    },
  },
  {
    name: "search_wikipedia",
    description:
      "Looks up factual knowledge, people, countries, history, science, or definitions on Wikipedia.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Topic or entity to look up.",
        },
        preferBangla: {
          type: Type.BOOLEAN,
          description: "True if user wants Bengali context.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_web",
    description:
      "Searches the live internet for any current topic, exchange rates, sports scores, recent events, products, or real-time facts.",
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

const GEMINI_MODEL_CANDIDATES = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.8-flash",
];

async function generateWithFallback(
  ai: GoogleGenAI,
  contents: Content[],
  systemInstruction: string
) {
  let lastError: unknown;
  for (const model of GEMINI_MODEL_CANDIDATES) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          temperature: 0.55,
          httpOptions: { timeout: 14000 },
        },
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function runGeminiAssistant(
  message: string,
  history: ChatMessage[],
  langPref: "auto" | "bn" | "en",
  apiKey: string,
  audioBase64?: string,
  audioMimeType?: string
) {
  const ai = new GoogleGenAI({ apiKey });
  const visitedSites: VisitedSite[] = [];
  const usedTools: string[] = [];

  const langHint =
    langPref === "bn"
      ? "Always respond in clear, natural Bengali (বাংলা) script suitable for speaking out loud."
      : langPref === "en"
        ? "Always respond in clear, natural English suitable for speaking out loud."
        : "Respond in natural Bengali (বাংলা) if the user speaks/writes Bangla or Banglish, or in English if they use English.";

  const todayStr = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Dhaka",
    dateStyle: "full",
    timeStyle: "short",
  });

  const systemInstruction = `You are Bongo (বঙ্গ), a flagship bilingual (Bengali & English) voice and web intelligence assistant.
Current date/time in Dhaka: ${todayStr}.
${langHint}
Guidelines for best-in-class output:
1. Be accurate, articulate, and directly helpful. Give concrete numbers, names, and takeaways—never vague filler.
2. Optimize for both reading and natural listening: use concise paragraphs or clean **bold lead-ins**, and never put raw URLs or messy symbols in your reply.
3. Whenever asked for today's news, current events, live prices/scores, weather, facts, or to inspect a website, ALWAYS call your live tools (get_live_news, search_web, visit_website, get_live_weather, search_wikipedia) before answering.
4. When reading news, synthesize the top 3-4 stories clearly like a broadcast anchor.`;

  const contents: Content[] = [];
  for (const h of history.slice(-6)) {
    contents.push({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    });
  }

  const userParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  if (audioBase64 && audioMimeType) {
    userParts.push({
      inlineData: {
        data: audioBase64,
        mimeType: audioMimeType,
      },
    });
    userParts.push({
      text:
        message ||
        "Listen to the user's voice audio carefully and answer their question directly. If they ask for news or websites, use your tools.",
    });
  } else {
    userParts.push({ text: message });
  }
  contents.push({ role: "user", parts: userParts });

  let response = await generateWithFallback(ai, contents, systemInstruction);

  for (let round = 0; round < 3; round++) {
    const calls = response.functionCalls;
    if (!calls || calls.length === 0) break;

    const modelCandidate = response.candidates?.[0]?.content;
    if (modelCandidate) {
      contents.push(modelCandidate);
    }

    const responseParts = [];
    for (const call of calls) {
      const args = (call.args ?? {}) as Record<string, unknown>;
      usedTools.push(call.name || "tool");

      if (call.name === "get_live_news") {
        const topic = typeof args.topic === "string" ? args.topic : undefined;
        const lang =
          args.language === "bn" || args.language === "en" || args.language === "both"
            ? args.language
            : "both";
        const news = await fetchLiveNews(topic, lang);
        visitedSites.push(...news.visitedSites);
        responseParts.push({
          functionResponse: {
            name: call.name,
            id: call.id,
            response: { headlines: news.headlines },
          },
        });
      } else if (call.name === "visit_website") {
        const url = typeof args.url === "string" ? args.url : "";
        const visited = await visitWebsite(url);
        if (visited.ok && visited.site) {
          visitedSites.push(visited.site);
        }
        responseParts.push({
          functionResponse: {
            name: call.name,
            id: call.id,
            response: visited,
          },
        });
      } else if (call.name === "get_live_weather") {
        const city = typeof args.city === "string" ? args.city : "Dhaka";
        const weather = await fetchLiveWeather(city);
        if (weather.ok && weather.site) {
          visitedSites.push(weather.site);
        }
        responseParts.push({
          functionResponse: {
            name: call.name,
            id: call.id,
            response: weather,
          },
        });
      } else if (call.name === "search_wikipedia") {
        const query = typeof args.query === "string" ? args.query : message;
        const preferBangla = Boolean(args.preferBangla);
        const wiki = await searchWikipedia(query, preferBangla);
        if (wiki.ok && wiki.site) {
          visitedSites.push(wiki.site);
        }
        responseParts.push({
          functionResponse: {
            name: call.name,
            id: call.id,
            response: wiki,
          },
        });
      } else if (call.name === "search_web") {
        const query = typeof args.query === "string" ? args.query : message;
        const preferBangla =
          typeof args.preferBangla === "boolean"
            ? args.preferBangla
            : langPref !== "en";
        const webRes = await searchLiveWeb(query, preferBangla);
        visitedSites.push(...webRes.visitedSites);
        responseParts.push({
          functionResponse: {
            name: call.name,
            id: call.id,
            response: { ok: webRes.ok, results: webRes.results },
          },
        });
      }
    }

    contents.push({
      role: "user",
      parts: responseParts,
    });

    response = await generateWithFallback(ai, contents, systemInstruction);
  }

  const rawTextParts =
    response.candidates?.[0]?.content?.parts
      ?.map((p) => (typeof p.text === "string" ? p.text : ""))
      .join("") || "";
  const displayText =
    rawTextParts.trim() ||
    "আমি উত্তরটি তৈরি করতে পারিনি, দয়া করে আবার বলুন।";
  const detectedLang = /[\u0980-\u09FF]/.test(displayText) ? "bn" : "en";

  return {
    displayText,
    spokenText: cleanSpeechText(displayText),
    language: detectedLang as "bn" | "en",
    visitedSites: visitedSites.slice(0, 6),
    usedTools,
    mode: "gemini" as const,
  };
}

async function runBuiltInLiveAssistant(
  message: string,
  langPref: "auto" | "bn" | "en"
) {
  const detected =
    langPref === "auto" ? detectBanglaOrBanglish(message) : langPref;
  const isBn = detected === "bn";
  const lower = message.toLowerCase();

  // 1. Direct Website Visit Request
  const directUrl = extractUrlFromText(message);
  if (directUrl) {
    const visited = await visitWebsite(directUrl);
    if (visited.ok && visited.site) {
      const topHeads = (visited.headlines || []).slice(0, 3);
      const summaryBody =
        topHeads.length > 0
          ? topHeads.join("। ")
          : visited.site.snippet;
      const displayText = isBn
        ? `আমি ${visited.site.siteName} ওয়েবসাইটটি ভিজিট করেছি। শিরোনাম হলো: ${visited.site.title}। মূল তথ্য: ${summaryBody}`
        : `I just visited ${visited.site.siteName}. Page title: ${visited.site.title}. Key highlights: ${summaryBody}`;
      return {
        displayText,
        spokenText: cleanSpeechText(displayText),
        language: detected,
        visitedSites: [visited.site],
        usedTools: ["visit_website"],
        mode: "live-web" as const,
      };
    }
  }

  // 2. Live News / "Ajker News"
  if (
    /(news|headline|খবর|নিউজ|সংবাদ|আজকের খবর|ajker|prothom\s*alo|bbc|daily\s*star|update|সাম্প্রতিক)/i.test(
      lower
    )
  ) {
    const topic = extractNewsTopic(message);
    const news = await fetchLiveNews(topic, isBn ? "bn" : "both");
    if (news.headlines.length > 0) {
      const top4 = news.headlines.slice(0, 4);
      const lines = top4.map((h, i) => `${i + 1}. ${h.title} (${h.source})`);
      const displayText = isBn
        ? `আমি এই মুহূর্তের নিউজ ওয়েবসাইট ভিজিট করে আজকের প্রধান খবরগুলো এনেছি:\n${lines.join("\n")}`
        : `I checked live news portals right now. Here are today's top headlines:\n${lines.join("\n")}`;

      const spokenIntro = isBn
        ? `আজকের প্রধান খবরগুলো বলছি। `
        : `Here are today's top news headlines. `;
      const spokenItems = top4
        .map((h) => `${h.source} থেকে: ${h.title}`)
        .join("। ");
      const spokenEn = top4
        .map((h) => `From ${h.source}: ${h.title}`)
        .join(". ");

      return {
        displayText,
        spokenText: cleanSpeechText(
          spokenIntro + (isBn ? spokenItems : spokenEn)
        ),
        language: detected,
        visitedSites: news.visitedSites,
        usedTools: ["get_live_news", "visit_website"],
        mode: "live-web" as const,
      };
    }
  }

  // 3. Live Weather
  if (
    /(weather|আবহাওয়া|আবহাওয়া|বৃষ্টি|তাপমাত্রা|temperature|forecast|গরম|শীত)/i.test(
      lower
    )
  ) {
    const city = extractCity(message);
    const weather = await fetchLiveWeather(city);
    if (weather.ok) {
      const displayText = isBn
        ? `${weather.city}-এর বর্তমান আবহাওয়া ${weather.condition}, তাপমাত্রা ${weather.temperatureC}°C, আর্দ্রতা ${weather.humidity}% এবং বাতাসের গতি ঘণ্টায় ${weather.windKmh} কিলোমিটার।`
        : `Current weather in ${weather.city} is ${weather.condition} at ${weather.temperatureC}°C, with ${weather.humidity}% humidity and ${weather.windKmh} km/h wind.`;
      return {
        displayText,
        spokenText: cleanSpeechText(displayText),
        language: detected,
        visitedSites: weather.site ? [weather.site] : [],
        usedTools: ["get_live_weather"],
        mode: "live-web" as const,
      };
    }
  }

  // 4. Live Time / Date in Bangladesh
  if (
    /(time|koyta|কয়টা|কয়টা|সময়|সময়|date|তারিখ|কি বার|কী বার|today)/i.test(
      lower
    )
  ) {
    const now = new Date();
    const bdTime = now.toLocaleTimeString(isBn ? "bn-BD" : "en-US", {
      timeZone: "Asia/Dhaka",
      hour: "numeric",
      minute: "2-digit",
    });
    const bdDate = now.toLocaleDateString(isBn ? "bn-BD" : "en-US", {
      timeZone: "Asia/Dhaka",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const displayText = isBn
      ? `ঢাকায় এখন সময় ${bdTime}, এবং আজ ${bdDate}।`
      : `The current time in Dhaka is ${bdTime}, and today is ${bdDate}.`;
    return {
      displayText,
      spokenText: cleanSpeechText(displayText),
      language: detected,
      visitedSites: [],
      usedTools: ["live_clock"],
      mode: "live-web" as const,
    };
  }

  // 5. Simple Safe Arithmetic
  const mathMatch = message.match(
    /^\s*(\d+(?:\.\d+)?)\s*([+\-*/x×÷])\s*(\d+(?:\.\d+)?)\s*\??\s*$/i
  );
  if (mathMatch) {
    const a = Number(mathMatch[1]);
    const op = mathMatch[2];
    const b = Number(mathMatch[3]);
    let res = 0;
    if (op === "+") res = a + b;
    else if (op === "-") res = a - b;
    else if (op === "*" || op.toLowerCase() === "x" || op === "×") res = a * b;
    else if ((op === "/" || op === "÷") && b !== 0) res = Number((a / b).toFixed(4));
    const displayText = isBn ? `ফলাফল হলো ${res}।` : `The result is ${res}.`;
    return {
      displayText,
      spokenText: displayText,
      language: detected,
      visitedSites: [],
      usedTools: [],
      mode: "live-web" as const,
    };
  }

  // 6. Greetings & Identity
  if (
    /^(hi|hello|hey|salam|assalamu|কেমন আছ|হ্যালো|হাই|নমস্কার|তোমার নাম|who are you|what is your name)/i.test(
      lower.trim()
    )
  ) {
    const displayText = isBn
      ? `হ্যালো! আমি Bongo AI, আপনার বাংলা ও ইংরেজি ভয়েস অ্যাসিস্ট্যান্ট। আমাকে "আজকের নিউজ বলো", "ঢাকার আবহাওয়া কেমন", কিংবা যেকোনো ওয়েবসাইটের নাম বলে ভিজিট করতে বলতে পারেন!`
      : `Hello! I am Bongo AI, your voice assistant. Ask me for today's live news, weather, Wikipedia facts, or tell me any website to visit!`;
    return {
      displayText,
      spokenText: cleanSpeechText(displayText),
      language: detected,
      visitedSites: [],
      usedTools: [],
      mode: "live-web" as const,
    };
  }

  // 7. Live Wikipedia Lookup Fallback for Knowledge Questions
  const cleanedTopic = message
    .replace(
      /\b(what is|who is|tell me about|explain|about|সম্পর্কে বলো|কে ছিলেন|কে|কী|কি)\b/gi,
      ""
    )
    .replace(/[?।!]/g, "")
    .trim();

  if (cleanedTopic.length >= 2) {
    const wiki = await searchWikipedia(cleanedTopic, isBn);
    if (wiki.ok && wiki.extract) {
      const displayText = isBn
        ? `${wiki.title} সম্পর্কে লাইভ তথ্য: ${wiki.extract}`
        : `Here is what I found about ${wiki.title}: ${wiki.extract}`;
      return {
        displayText,
        spokenText: cleanSpeechText(displayText),
        language: detected,
        visitedSites: wiki.site ? [wiki.site] : [],
        usedTools: ["search_wikipedia"],
        mode: "live-web" as const,
      };
    }
  }

  // 8. Live Web Search Fallback before static message
  const liveWeb = await searchLiveWeb(message, isBn);
  if (liveWeb.ok && liveWeb.results.length > 0) {
    const top = liveWeb.results.slice(0, 3);
    const summaryLines = top.map(
      (r, idx) => `${idx + 1}. **${r.title}** (${r.source}): ${r.snippet.slice(0, 160)}`
    );
    const displayText = isBn
      ? `লাইভ ওয়েব সার্চ থেকে পাওয়া তথ্য:\n${summaryLines.join("\n")}`
      : `Here is what I found from live web search:\n${summaryLines.join("\n")}`;
    return {
      displayText,
      spokenText: cleanSpeechText(
        top.map((r) => `${r.title}. ${r.snippet.slice(0, 130)}`).join("। ")
      ),
      language: detected,
      visitedSites: liveWeb.visitedSites,
      usedTools: ["search_web"],
      mode: "live-web" as const,
    };
  }

  // 9. Final graceful fallback
  const displayText = isBn
    ? `আমি লাইভ ওয়েব মোডে আছি—তাই আজকের নিউজ, যেকোনো ওয়েবসাইট ভিজিট, আবহাওয়া বা উইকিপিডিয়া তথ্য এখনই এনে দিতে পারি। আরও গভীর কথোপকথনের জন্য উপরের Settings থেকে আপনার Gemini API Key যুক্ত করতে পারেন।`
    : `I am currently in Live Web Mode—I can fetch today's news, visit websites, check weather, and look up Wikipedia facts right now. Add a Gemini API Key in Settings for full open-ended AI conversations.`;

  return {
    displayText,
    spokenText: cleanSpeechText(displayText),
    language: detected,
    visitedSites: [],
    usedTools: [],
    mode: "live-web" as const,
  };
}

export async function GET() {
  return NextResponse.json({
    geminiConfigured: Boolean((process.env.GEMINI_API_KEY || "").trim()),
    model: "gemini-flash-lite-latest",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AssistantRequest;
    const message = (body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const languagePreference = body.languagePreference || "auto";
    const apiKey =
      (body.geminiApiKey || "").trim() ||
      (process.env.GEMINI_API_KEY || "").trim();

    if (!message && !body.audioBase64) {
      return NextResponse.json(
        { error: "Message or voice input is required." },
        { status: 400 }
      );
    }

    if (apiKey) {
      try {
        const geminiResult = await runGeminiAssistant(
          message,
          history,
          languagePreference,
          apiKey,
          body.audioBase64,
          body.audioMimeType
        );
        return NextResponse.json(geminiResult);
      } catch (err) {
        console.error("Gemini API error, falling back to live web mode:", err);
        if (!message) {
          return NextResponse.json(
            {
              error:
                err instanceof Error ? err.message : "Gemini request failed",
            },
            { status: 500 }
          );
        }
        const fallback = await runBuiltInLiveAssistant(
          message,
          languagePreference
        );
        return NextResponse.json({
          ...fallback,
          warning:
            "Gemini API call failed, responded using built-in Live Web Mode.",
        });
      }
    }

    const result = await runBuiltInLiveAssistant(message, languagePreference);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unexpected server error",
      },
      { status: 500 }
    );
  }
}
