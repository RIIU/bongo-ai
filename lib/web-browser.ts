import * as cheerio from "cheerio";

export interface VisitedSite {
  title: string;
  url: string;
  siteName: string;
  snippet: string;
  favicon: string;
  publishedAt?: string;
  status: "visited" | "rss" | "knowledge" | "weather";
}

export interface LiveNewsResult {
  headlines: Array<{
    title: string;
    source: string;
    url: string;
    publishedAt?: string;
    summary?: string;
  }>;
  visitedSites: VisitedSite[];
}

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7",
};

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
]);

function isSafePublicUrl(rawUrl: string): URL | null {
  try {
    const normalized = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host) || host.endsWith(".local")) {
      return null;
    }
    // Block private IPv4 ranges to avoid SSRF
    if (
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^127\./.test(host)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function visitWebsite(rawUrl: string): Promise<{
  ok: boolean;
  site?: VisitedSite;
  fullText?: string;
  headlines?: string[];
  error?: string;
}> {
  const parsed = isSafePublicUrl(rawUrl);
  if (!parsed) {
    return { ok: false, error: "Invalid or restricted URL." };
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: REQUEST_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("xml")) {
      return { ok: false, error: "Unsupported content type." };
    }

    const html = (await res.text()).slice(0, 350_000);
    const $ = cheerio.load(html);

    $(
      "script, style, noscript, iframe, svg, nav, footer, aside, form, [aria-hidden='true']"
    ).remove();

    const title =
      cleanText(
        $('meta[property="og:title"]').attr("content") ||
          $("title").text() ||
          $("h1").first().text()
      ) || parsed.hostname;

    const description = cleanText(
      $('meta[property="og:description"]').attr("content") ||
        $('meta[name="description"]').attr("content") ||
        ""
    );

    const siteName =
      cleanText($('meta[property="og:site_name"]').attr("content") || "") ||
      parsed.hostname.replace(/^www\./, "");

    const headlines: string[] = [];
    $("h1, h2, h3").each((_, el) => {
      const t = cleanText($(el).text());
      if (t.length >= 16 && t.length <= 160 && !headlines.includes(t)) {
        headlines.push(t);
      }
    });

    const paragraphs: string[] = [];
    const articleScope = $("article, main").length ? $("article, main") : $("body");
    articleScope.find("p").each((_, el) => {
      const p = cleanText($(el).text());
      if (p.length >= 40) {
        paragraphs.push(p);
      }
    });

    const joinedBody = paragraphs.slice(0, 12).join(" ");
    const fullText = (description ? `${description}. ${joinedBody}` : joinedBody).slice(
      0,
      2400
    );

    const snippet =
      description ||
      paragraphs[0]?.slice(0, 180) ||
      headlines.slice(0, 2).join(" • ") ||
      title;

    return {
      ok: true,
      fullText: fullText || headlines.slice(0, 8).join(". "),
      headlines: headlines.slice(0, 8),
      site: {
        title,
        url: res.url || parsed.toString(),
        siteName,
        snippet: snippet.slice(0, 200),
        favicon: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`,
        status: "visited",
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load site",
    };
  }
}

async function parseRssFeed(
  feedUrl: string,
  fallbackSource: string,
  limit = 5
): Promise<
  Array<{
    title: string;
    source: string;
    url: string;
    publishedAt?: string;
    summary?: string;
  }>
> {
  try {
    const res = await fetch(feedUrl, {
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const items: Array<{
      title: string;
      source: string;
      url: string;
      publishedAt?: string;
      summary?: string;
    }> = [];

    $("item, entry")
      .slice(0, limit)
      .each((_, el) => {
        const rawTitle = cleanText($(el).find("title").first().text());
        const link =
          cleanText($(el).find("link").first().text()) ||
          $(el).find("link").first().attr("href") ||
          "";
        const sourceNode = cleanText($(el).find("source").first().text());
        const pubDate = cleanText(
          $(el).find("pubDate, updated, published").first().text()
        );
        const rawDesc = $(el).find("description, summary").first().text();
        const descText = cleanText(cheerio.load(rawDesc).text()).slice(0, 180);

        // Google News appends " - Publisher" to titles
        let title = rawTitle;
        let source = sourceNode || fallbackSource;
        if (!sourceNode && rawTitle.includes(" - ")) {
          const parts = rawTitle.split(" - ");
          const last = parts.pop();
          if (last && last.length < 40) {
            source = last.trim();
            title = parts.join(" - ").trim();
          }
        }

        if (title && link) {
          items.push({
            title,
            source,
            url: link,
            publishedAt: pubDate || undefined,
            summary: descText || undefined,
          });
        }
      });

    return items;
  } catch {
    return [];
  }
}

export async function fetchLiveNews(
  topic?: string,
  lang: "bn" | "en" | "both" = "both"
): Promise<LiveNewsResult> {
  const cleanedTopic = topic?.trim();
  const feedJobs: Array<Promise<ReturnType<typeof parseRssFeed> extends Promise<infer T> ? T : never>> = [];

  if (cleanedTopic) {
    const q = encodeURIComponent(cleanedTopic);
    if (lang === "bn" || lang === "both") {
      feedJobs.push(
        parseRssFeed(
          `https://news.google.com/rss/search?q=${q}&hl=bn&gl=BD&ceid=BD:bn`,
          "Google News BD",
          5
        )
      );
    }
    if (lang === "en" || lang === "both") {
      feedJobs.push(
        parseRssFeed(
          `https://news.google.com/rss/search?q=${q}&hl=en-BD&gl=BD&ceid=BD:en`,
          "Google News",
          4
        )
      );
    }
  } else {
    feedJobs.push(
      parseRssFeed("https://feeds.bbci.co.uk/bengali/rss.xml", "BBC Bangla", 4),
      parseRssFeed(
        "https://news.google.com/rss?hl=bn&gl=BD&ceid=BD:bn",
        "Bangladesh News",
        5
      ),
      parseRssFeed(
        "https://www.thedailystar.net/frontpage/rss.xml",
        "The Daily Star",
        3
      )
    );
  }

  // Also directly visit a live portal homepage to get genuine live scraped headlines
  const directVisitPromise = visitWebsite(
    lang === "en" ? "https://www.thedailystar.net/" : "https://www.bbc.com/bengali"
  );

  const [feedResults, directSite] = await Promise.all([
    Promise.all(feedJobs),
    directVisitPromise,
  ]);

  const seenTitles = new Set<string>();
  const headlines: LiveNewsResult["headlines"] = [];

  for (const list of feedResults) {
    for (const item of list) {
      const key = item.title.toLowerCase().slice(0, 48);
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        headlines.push(item);
      }
    }
  }

  const visitedSites: VisitedSite[] = [];
  if (directSite.ok && directSite.site) {
    visitedSites.push(directSite.site);
  }

  for (const h of headlines.slice(0, 6)) {
    let host = "news.google.com";
    try {
      host = new URL(h.url).hostname;
    } catch {
      // ignore
    }
    const sourceDomainMap: Array<[RegExp, string]> = [
      [/bbc/i, "bbc.com"],
      [/prothom\s*alo/i, "prothomalo.com"],
      [/daily\s*star/i, "thedailystar.net"],
      [/bdnews24/i, "bdnews24.com"],
      [/jugantor/i, "jugantor.com"],
      [/ittefaq/i, "ittefaq.com.bd"],
      [/kalbela/i, "kalbela.com"],
      [/dhaka\s*post/i, "dhakapost.com"],
      [/somoy/i, "somoynews.tv"],
      [/jamuna/i, "jamuna.tv"],
      [/tbsnews|business\s*standard/i, "tbsnews.net"],
      [/reuters/i, "reuters.com"],
      [/techcrunch/i, "techcrunch.com"],
      [/verge/i, "theverge.com"],
    ];
    let faviconHost = host;
    if (host.includes("news.google.com")) {
      const matched = sourceDomainMap.find(([rx]) => rx.test(h.source));
      if (matched) faviconHost = matched[1];
    }
    visitedSites.push({
      title: h.title,
      url: h.url,
      siteName: h.source,
      snippet: h.summary || h.title,
      favicon: `https://www.google.com/s2/favicons?domain=${faviconHost}&sz=64`,
      publishedAt: h.publishedAt,
      status: "rss",
    });
  }

  return {
    headlines: headlines.slice(0, 8),
    visitedSites: visitedSites.slice(0, 6),
  };
}

export async function fetchLiveWeather(city = "Dhaka"): Promise<{
  ok: boolean;
  city: string;
  temperatureC?: number;
  windKmh?: number;
  humidity?: number;
  condition?: string;
  site?: VisitedSite;
}> {
  const cityCoords: Record<string, { lat: number; lon: number; label: string }> = {
    dhaka: { lat: 23.8103, lon: 90.4125, label: "Dhaka" },
    chittagong: { lat: 22.3569, lon: 91.7832, label: "Chattogram" },
    chattogram: { lat: 22.3569, lon: 91.7832, label: "Chattogram" },
    sylhet: { lat: 24.8949, lon: 91.8687, label: "Sylhet" },
    rajshahi: { lat: 24.3745, lon: 88.6042, label: "Rajshahi" },
    khulna: { lat: 22.8456, lon: 89.5403, label: "Khulna" },
    kolkata: { lat: 22.5726, lon: 88.3639, label: "Kolkata" },
    london: { lat: 51.5072, lon: -0.1276, label: "London" },
    "new york": { lat: 40.7128, lon: -74.006, label: "New York" },
  };

  try {
    const key = city.toLowerCase().trim();
    let target = cityCoords[key];

    if (!target) {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          city
        )}&count=1&language=en&format=json`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (geoRes.ok) {
        const geo = await geoRes.json();
        if (geo?.results?.[0]) {
          target = {
            lat: geo.results[0].latitude,
            lon: geo.results[0].longitude,
            label: geo.results[0].name,
          };
        }
      }
    }

    if (!target) target = cityCoords.dhaka;

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${target.lat}&longitude=${target.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`;
    const res = await fetch(weatherUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, city: target.label };
    const data = await res.json();
    const cur = data.current;

    const code = Number(cur?.weather_code ?? 0);
    const condition =
      code === 0
        ? "Clear sky"
        : code <= 3
          ? "Partly cloudy"
          : code <= 48
            ? "Foggy"
            : code <= 67
              ? "Rainy"
              : code <= 82
                ? "Rain showers"
                : "Thunderstorm";

    return {
      ok: true,
      city: target.label,
      temperatureC: cur?.temperature_2m,
      windKmh: cur?.wind_speed_10m,
      humidity: cur?.relative_humidity_2m,
      condition,
      site: {
        title: `${target.label} Live Weather — ${cur?.temperature_2m}°C`,
        url: "https://open-meteo.com/",
        siteName: "Open-Meteo Live",
        snippet: `${condition}, Temperature ${cur?.temperature_2m}°C, Humidity ${cur?.relative_humidity_2m}%, Wind ${cur?.wind_speed_10m} km/h`,
        favicon: "https://www.google.com/s2/favicons?domain=open-meteo.com&sz=64",
        status: "weather",
      },
    };
  } catch {
    return { ok: false, city };
  }
}

export async function searchWikipedia(
  query: string,
  preferBangla: boolean
): Promise<{
  ok: boolean;
  title?: string;
  extract?: string;
  site?: VisitedSite;
}> {
  const langs = preferBangla ? ["bn", "en"] : ["en", "bn"];
  for (const lang of langs) {
    try {
      const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        query
      )}&limit=1&namespace=0&format=json`;
      const sRes = await fetch(searchUrl, { signal: AbortSignal.timeout(4500) });
      if (!sRes.ok) continue;
      const sData = await sRes.json();
      const firstTitle = sData?.[1]?.[0];
      if (!firstTitle) continue;

      const sumRes = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          firstTitle
        )}`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (!sumRes.ok) continue;
      const sum = await sumRes.json();
      if (sum?.extract) {
        const pageUrl =
          sum?.content_urls?.desktop?.page ||
          `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(firstTitle)}`;
        return {
          ok: true,
          title: sum.title,
          extract: String(sum.extract).slice(0, 750),
          site: {
            title: `${sum.title} — Wikipedia`,
            url: pageUrl,
            siteName: `${lang.toUpperCase()} Wikipedia`,
            snippet: String(sum.extract).slice(0, 180),
            favicon: "https://www.google.com/s2/favicons?domain=wikipedia.org&sz=64",
            status: "knowledge",
          },
        };
      }
    } catch {
      continue;
    }
  }
  return { ok: false };
}

export async function searchLiveWeb(
  query: string,
  preferBangla = true
): Promise<{
  ok: boolean;
  results: Array<{ title: string; url: string; snippet: string; source: string }>;
  visitedSites: VisitedSite[];
}> {
  const cleaned = query.trim();
  if (!cleaned) {
    return { ok: false, results: [], visitedSites: [] };
  }

  const results: Array<{
    title: string;
    url: string;
    snippet: string;
    source: string;
  }> = [];
  const visitedSites: VisitedSite[] = [];

  const ddgPromise = (async () => {
    try {
      const res = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleaned)}`,
        {
          headers: REQUEST_HEADERS,
          signal: AbortSignal.timeout(5500),
        }
      );
      if (!res.ok) return [];
      const html = await res.text();
      const $ = cheerio.load(html);
      const found: typeof results = [];

      $(".result").each((_, el) => {
        if (found.length >= 4) return;
        const a = $(el).find("a.result__a").first();
        const title = cleanText(a.text());
        let href = a.attr("href") || "";
        if (href.includes("uddg=")) {
          try {
            const parsed = new URL(
              href.startsWith("http") ? href : `https:${href}`
            );
            const target = parsed.searchParams.get("uddg");
            if (target) href = decodeURIComponent(target);
          } catch {
            // keep raw
          }
        }
        const snippet = cleanText($(el).find(".result__snippet").text());
        if (title && href.startsWith("http")) {
          let source = "Web";
          try {
            source = new URL(href).hostname.replace(/^www\./, "");
          } catch {
            // ignore
          }
          found.push({ title, url: href, snippet: snippet || title, source });
        }
      });
      return found;
    } catch {
      return [];
    }
  })();

  const newsPromise = parseRssFeed(
    `https://news.google.com/rss/search?q=${encodeURIComponent(cleaned)}&hl=${
      preferBangla ? "bn" : "en-BD"
    }&gl=BD&ceid=BD:${preferBangla ? "bn" : "en"}`,
    "Google News",
    3
  );

  const [ddgItems, newsItems] = await Promise.all([ddgPromise, newsPromise]);

  for (const item of ddgItems) {
    results.push(item);
    let host = "google.com";
    try {
      host = new URL(item.url).hostname;
    } catch {
      // ignore
    }
    visitedSites.push({
      title: item.title,
      url: item.url,
      siteName: item.source,
      snippet: item.snippet,
      favicon: `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
      status: "visited",
    });
  }

  for (const n of newsItems) {
    if (results.length >= 6) break;
    results.push({
      title: n.title,
      url: n.url,
      snippet: n.summary || n.title,
      source: n.source,
    });
    visitedSites.push({
      title: n.title,
      url: n.url,
      siteName: n.source,
      snippet: n.summary || n.title,
      favicon: "https://www.google.com/s2/favicons?domain=news.google.com&sz=64",
      publishedAt: n.publishedAt,
      status: "rss",
    });
  }

  // Deep-visit the top DDG page if safe and available for richer context
  if (ddgItems[0]?.url) {
    const deep = await visitWebsite(ddgItems[0].url);
    if (deep.ok && deep.fullText) {
      results[0].snippet = deep.fullText.slice(0, 650);
    }
  }

  return {
    ok: results.length > 0,
    results,
    visitedSites: visitedSites.slice(0, 6),
  };
}
