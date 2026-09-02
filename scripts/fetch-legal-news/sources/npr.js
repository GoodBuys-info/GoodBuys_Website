/** @format */

// NPR /sections/news/ — the search UI (npr.org/search) is client-rendered
// JS with nothing in the raw HTML, so this uses the section's RSS feed
// instead (confirmed working: "NPR Topics: News", the feed backing
// /sections/news/) and lets the shared company matcher find registry hits,
// same as OECD Watch/Triple Pundit/Reuters.

import { fetchFeed } from "../../fetch-news/fetch.js";
import { parseFeed } from "../../fetch-news/parse.js";

const FEED_URL = "https://feeds.npr.org/1001/rss.xml";
export const SOURCE_ID = "npr";
export const SOURCE_NAME = "NPR";

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
