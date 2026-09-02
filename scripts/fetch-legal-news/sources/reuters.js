/** @format */

// Reuters /sustainability/ — flagged as high-risk during planning: a plain
// fetch returned HTTP 401 even with browser-like headers when tested for
// this pipeline (Reuters runs aggressive bot protection). This is best-effort
// by design: any failure — non-200, empty body, markup that doesn't match —
// is logged and the source is skipped, exactly like the known Triple Pundit
// 403 handling in the ecolabel news fetcher (ARCHITECTURE.md §6.5). One
// degraded source must never fail the whole run.

import * as cheerio from "cheerio";
import { fetchHtml, delayFor } from "../../scrape-company-labels/http.js";

const URL_ = "https://www.reuters.com/sustainability/";
export const SOURCE_ID = "reuters";
export const SOURCE_NAME = "Reuters";

export async function fetchAll() {
	try {
		const host = new URL(URL_).host;
		await delayFor(host);

		const html = await fetchHtml(URL_);
		if (!html) {
			console.warn(`[${SOURCE_ID}] fetch failed (null response) — skipping, non-blocking`);
			return [];
		}

		const $ = cheerio.load(html);
		const articles = [];

		// Reuters' story-card markup shifts frequently; this targets the
		// common shape (an <a> whose text is the headline, wrapped in a
		// heading-ish element) rather than a specific class name, and drops
		// anything that doesn't look like a real headline link.
		$("a[href*='/sustainability/']").each((_, el) => {
			const $el = $(el);
			const title = $el.text().replace(/\s+/g, " ").trim();
			const href = $el.attr("href");
			if (!title || title.length < 20 || !href) return; // nav/footer links are short

			const url = href.startsWith("http") ? href : `https://www.reuters.com${href}`;
			articles.push({
				sourceId: SOURCE_ID,
				sourceName: SOURCE_NAME,
				url,
				title,
				summary: "",
				publishedAt: null,
			});
		});

		return articles;
	} catch (err) {
		console.warn(`[${SOURCE_ID}] FAIL — ${err.message || err} — skipping, non-blocking`);
		return [];
	}
}
