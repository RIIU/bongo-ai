import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: NextRequest) {
  try {
    let customKey = "";
    try {
      const body = (await req.json()) as { geminiApiKey?: string };
      customKey = (body.geminiApiKey || "").trim();
    } catch {
      // empty body is fine
    }

    const apiKey = customKey || (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "No Gemini API key configured" },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    });

    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 5,
        expireTime: new Date(now + 25 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 10 * 60 * 1000).toISOString(),
      },
    });

    return NextResponse.json({
      token: token.name,
      model: "gemini-3.1-flash-live-preview",
      fallbackModels: [
        "gemini-2.5-flash-native-audio-preview-12-2025",
        "gemini-2.5-flash-native-audio-preview-09-2025",
      ],
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to create Gemini Live token",
      },
      { status: 500 }
    );
  }
}
