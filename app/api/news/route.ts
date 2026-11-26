import { NextRequest, NextResponse } from "next/server";
import { fetchLiveNews, visitWebsite } from "@/lib/web-browser";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const topic = searchParams.get("topic") || undefined;
  const langParam = searchParams.get("lang");
  const lang =
    langParam === "bn" || langParam === "en" || langParam === "both"
      ? langParam
      : "both";
  const url = searchParams.get("url");

  if (url) {
    const visited = await visitWebsite(url);
    return NextResponse.json(visited);
  }

  const news = await fetchLiveNews(topic, lang);
  return NextResponse.json(news);
}
