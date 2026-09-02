/** @format */

// EEOC newsroom search — one of the two sources that supports a real
// per-company query (`GET /newsroom/search?keywords=<company>`), confirmed
// by testing: querying "Amazon" narrows the unfiltered 7,552-result listing
// down to 4. No RSS feed on this endpoint, so this scrapes the rendered
// listing with cheerio.
//
// Markup (confirmed against a live fetch, 2026): each result is
// <article class="press_release"> containing:
//   h2 a                              -> title + relative URL (/newsroom/...)
//   .field--name-body                 -> summary text
//   .field--name-field-published-date -> "August 12, 2026"

import * as cheerio from "cheerio";
import { fetchHtml, delayFor } from "../../scrape-company-labels/http.js";

const BASE = "https://www.eeoc.gov";
export const SOURCE_ID = "eeoc";
export const SOURCE_NAME = "EEOC Newsroom";

export async function fetchForCompany(company) {
	const url = `${BASE}/newsroom/search?keywords=${encodeURIComponent(company)}`;
	const host = new URL(url).host;
	await delayFor(host);

	const html = await fetchHtml(url);
	if (!html) return [];

	const $ = cheerio.load(html);
	const articles = [];

	$("article.press_release").each((_, el) => {
		const $el = $(el);
		const titleEl = $el.find("h2 a").first();
		const title = titleEl.text().trim();
		const href = titleEl.attr("href");
		if (!title || !href) return;

		const summary = $el.find(".field--name-body").first().text().replace(/\s+/g, " ").trim();
		const dateText = $el.find(".field--name-field-published-date").first().text().trim();

		articles.push({
			sourceId: SOURCE_ID,
			sourceName: SOURCE_NAME,
			url: href.startsWith("http") ? href : `${BASE}${href}`,
			title,
			summary,
			publishedAt: parseEeocDate(dateText),
			matchedCompany: company,
		});
	});

	return articles;
}

function parseEeocDate(text) {
	if (!text) return null;
	const t = Date.parse(text);
	return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
