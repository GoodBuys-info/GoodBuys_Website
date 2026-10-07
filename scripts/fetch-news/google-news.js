/** @format */

// Per-label Google News search. The five outlet RSS feeds only expose their
// latest ~10-25 items each, and ecolabels are named in roughly 0.5% of general
// sustainability articles, so waiting for a mention in those feeds yields 0-1
// matches. Searching each label by name asks the question the other way round.
//
// Each query is one RSS request: https://news.google.com/rss/search?q="<term>"
// when:<N>d. Results are real publisher headlines (the publisher is in
// <source>), but:
//   - the link is a news.google.com redirect, not the publisher URL
//   - there is no article text, only the headline
// so downstream matching runs on the headline alone, and the shared matcher is
// the relevance gate: an item that doesn't actually name a tracked label in its
// headline is dropped. Retailer product pages are filtered here, before that.

import { fetchFeed } from "./fetch.js";
import { parseFeed } from "./parse.js";
import { ENV } from "./config.js";
import { SEARCH_TERMS, SEARCH_SKIP } from "./rules/label-overrides.js";

export const OUTLET_ID = "google-news";
export const OUTLET_NAME = "Google News";

// Product/listing pages show up for certification names ("... Fair Trade
// Certified ... 8.8 Oz"). They are shopping pages, not news.
const SHOPPING_HOSTS =
	/(^|\.)(amazon\.[a-z.]+|walmart\.com|target\.com|ebay\.[a-z.]+|etsy\.com|wholefoodsmarket\.com|kroger\.com|instacart\.com|costco\.com|iherb\.com|vitacost\.com|thrivemarket\.com|sephora\.com|ulta\.com|chewy\.com|wayfair\.com)$/i;
const PRODUCT_TITLE = /\b\d+(\.\d+)?\s?(oz|ct|lb|lbs|count|fl oz)\b/i;

export function searchTermFor(label) {
	if (SEARCH_SKIP.has(label.id)) return null;
	if (SEARCH_TERMS[label.id]) return SEARCH_TERMS[label.id];
	return label.name.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function hostOf(url) {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

// Google occasionally sends a bare URL as the publisher name
// ("https://www.example.com/"); show the domain instead.
export function cleanPublisherName(name) {
	const n = String(name || "").trim();
	if (!/^https?:\/\//i.test(n)) return n;
	return hostOf(n).replace(/^www\./i, "") || n;
}

function normaliseTitle(title, sourceName) {
	let t = String(title || "").trim();
	// Google appends " - Publisher" to every headline.
	if (sourceName && t.endsWith(` - ${sourceName}`)) t = t.slice(0, -(sourceName.length + 3)).trim();
	return t;
}

export async function searchLabel(label) {
	const term = searchTermFor(label);
	if (!term) return [];

	const q = encodeURIComponent(`"${term}" when:${ENV.GOOGLE_DAYS}d`);
	const xml = await fetchFeed(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`);
	if (!xml) return [];

	const { articles, error } = parseFeed(xml, { outletId: OUTLET_ID, outletName: OUTLET_NAME });
	if (error) return [];

	const out = [];
	for (const a of articles) {
		const rawSourceName = a.sourceName || null;
		const sourceName = rawSourceName ? cleanPublisherName(rawSourceName) : null;
		// Strip the suffix as Google wrote it (raw name), not the cleaned one.
		const title = normaliseTitle(a.title, rawSourceName);
		if (!title || !a.url) continue;
		if (SHOPPING_HOSTS.test(hostOf(a.sourceUrl))) continue;
		if (PRODUCT_TITLE.test(title)) continue;

		out.push({
			outletId: OUTLET_ID,
			// Cards show the real publisher; the page header credits "Google News".
			outletName: sourceName || OUTLET_NAME,
			aggregator: OUTLET_NAME,
			url: a.url,
			urlSlug: null,
			title,
			// Google's description is just the headline again; there is no body text.
			summary: "",
			publishedAt: a.publishedAt,
			categories: [],
			guid: a.guid,
			searchedLabel: label.id,
		});
	}
	return out;
}
