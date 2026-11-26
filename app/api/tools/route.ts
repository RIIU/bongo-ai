import { NextRequest, NextResponse } from "next/server";
import {
  fetchLiveNews,
  fetchLiveWeather,
  searchLiveWeb,
  searchWikipedia,
  visitWebsite,
  type VisitedSite,
} from "@/lib/web-browser";

interface IncomingCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const { functionCalls } = (await req.json()) as {
      functionCalls?: IncomingCall[];
    };

    if (!Array.isArray(functionCalls) || functionCalls.length === 0) {
      return NextResponse.json(
        { error: "functionCalls array is required" },
        { status: 400 }
      );
    }

    const visitedSites: VisitedSite[] = [];
    const functionResponses: Array<{
      id?: string;
      name: string;
      response: Record<string, unknown>;
    }> = [];

    for (const call of functionCalls) {
      const name = call.name || "";
      const args = call.args || {};

      if (name === "get_live_news") {
        const topic = typeof args.topic === "string" ? args.topic : undefined;
        const lang =
          args.language === "bn" ||
          args.language === "en" ||
          args.language === "both"
            ? args.language
            : "both";
        const news = await fetchLiveNews(topic, lang);
        visitedSites.push(...news.visitedSites);
        functionResponses.push({
          id: call.id,
          name,
          response: { headlines: news.headlines },
        });
      } else if (name === "visit_website") {
        const url = typeof args.url === "string" ? args.url : "";
        const visited = await visitWebsite(url);
        if (visited.ok && visited.site) {
          visitedSites.push(visited.site);
        }
        functionResponses.push({
          id: call.id,
          name,
          response: visited as unknown as Record<string, unknown>,
        });
      } else if (name === "get_live_weather") {
        const city = typeof args.city === "string" ? args.city : "Dhaka";
        const weather = await fetchLiveWeather(city);
        if (weather.ok && weather.site) {
          visitedSites.push(weather.site);
        }
        functionResponses.push({
          id: call.id,
          name,
          response: weather as unknown as Record<string, unknown>,
        });
      } else if (name === "search_wikipedia") {
        const query = typeof args.query === "string" ? args.query : "";
        const preferBangla = Boolean(args.preferBangla);
        const wiki = await searchWikipedia(query, preferBangla);
        if (wiki.ok && wiki.site) {
          visitedSites.push(wiki.site);
        }
        functionResponses.push({
          id: call.id,
          name,
          response: wiki as unknown as Record<string, unknown>,
        });
      } else if (name === "search_web") {
        const query = typeof args.query === "string" ? args.query : "";
        const preferBangla =
          typeof args.preferBangla === "boolean" ? args.preferBangla : true;
        const webRes = await searchLiveWeb(query, preferBangla);
        visitedSites.push(...webRes.visitedSites);
        functionResponses.push({
          id: call.id,
          name,
          response: { ok: webRes.ok, results: webRes.results },
        });
      } else {
        functionResponses.push({
          id: call.id,
          name,
          response: { error: `Unknown tool: ${name}` },
        });
      }
    }

    return NextResponse.json({
      functionResponses,
      visitedSites: visitedSites.slice(0, 6),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Tool execution failed",
      },
      { status: 500 }
    );
  }
}
