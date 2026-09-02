/** @format */

// Triple Pundit — same known Cloudflare 403 issue documented in
// ARCHITECTURE.md §6.5 for the ecolabel news fetcher applies here (the
// site's search endpoint returned 403 even with UA rotation when tested for
// this pipeline). The RSS feed is unaffected, so use that and let the
// shared company matcher find registry hits, same as the other "fetch once"
// sources.

import { fetchFeed } from "../../fetch-news/fetch.js";
import { parseFeed } from "../../fetch-news/parse.js";

const FEED_URL = "https://www.triplepundit.com/feed/";
export const SOURCE_ID = "triplepundit";
export const SOURCE_NAME = "Triple Pundit";

export async function fetchAll() {
	const xml = await fetchFeed(FEED_URL);
	if (!xml) return [];

	const { articles, error } = parseFeed(xml, { outletId: SOURCE_ID, outletName: SOURCE_NAME });
	if (error) {
		console.warn(`[${SOURCE_ID}] parse error: ${error}`);
		return [];
	}

	return articles.map((a) => ({
		sourceId: SOURCE_ID,
		sourceName: SOURCE_NAME,
		url: a.url,
		title: a.title,
		summary: a.summary,
		publishedAt: a.publishedAt,
	}));
}
