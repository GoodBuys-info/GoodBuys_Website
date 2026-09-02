/** @format */

// Legal-news pipeline: Company → per-source retrieval → company match →
// legal-relevance gate → status classification (deterministic or LLM,
// per source) → dedupe → write. Mirrors the shape of
// scripts/fetch-news/run.js and scripts/scrape-company-labels/run.js —
// fetch/parse/match/write with atomic writes and a host-stats sidecar —
// but keyed to the company registry rather than the label registry, and
// hybrid on extraction (see classifier.js / llm.js for why).
//
// Meant to run monthly (see .github/workflows/legal-news.yml), not on every
// deploy: EEOC + Human Trafficking Search alone are ~2 requests per company
// (410 for the current 205-company registry), and the LLM pass is CPU-bound
// local inference — both too slow to redo on every push.

import fs from "fs/promises";
import pLimit from "p-limit";

import { ENV, PATHS } from "./config.js";
import { initMatcher, matchArticle } from "./matcher.js";
import { isLegallyRelevant, classifyStatus, mapOecdStatus } from "./classifier.js";
import { dedupe } from "./dedupe.js";
import { writeLegalNews, writeHostStats } from "./io.js";
import { extract as llmExtract, disposeLlm } from "./llm.js";
import { getHostStatsSnapshot } from "../scrape-company-labels/http.js";

import * as eeoc from "./sources/eeoc.js";
import * as humanTraffickingSearch from "./sources/humantraffickingsearch.js";
import * as oecdWatch from "./sources/oecdwatch.js";
import * as npr from "./sources/npr.js";
import * as triplepundit from "./sources/triplepundit.js";
import * as reuters from "./sources/reuters.js";
import * as courtlistener from "./sources/courtlistener.js";

// EEOC and OECD Watch publish formal, structured filings — keyword rules
// classify their status reliably. The rest is freeform journalism, where
// "the case was dismissed" doesn't show up in a fixed shape; those go
// through the LLM pass in llm.js instead.
const DETERMINISTIC_SOURCE_IDS = new Set([eeoc.SOURCE_ID, oecdWatch.SOURCE_ID]);

async function main() {
	console.log("=======================================");
	console.log("     GoodBuys Legal News Fetcher       ");
	console.log("=======================================");

	const companies = JSON.parse(await fs.readFile(PATHS.COMPANIES_PATH, "utf8"));
	const names = (Array.isArray(companies) ? companies : []).map((c) => c.company).filter(Boolean);
	if (!names.length) {
		console.error("[run] ERROR: company-labels.json is empty or unreadable");
		return;
	}
	// The matcher always sees the FULL registry — fetch-once sources
	// (OECD Watch, NPR, ...) must be checked against every company regardless
	// of any test-only search-scope limit, and the override-drift guard needs
	// the complete name set to validate against.
	initMatcher({ companies: names });

	let searchCompanies = names;
	if (ENV.TEST_COMPANIES) {
		const wanted = new Set(ENV.TEST_COMPANIES.map((n) => n.toLowerCase()));
		searchCompanies = names.filter((n) => wanted.has(n.toLowerCase()));
		const missing = ENV.TEST_COMPANIES.filter((n) => !names.some((r) => r.toLowerCase() === n.toLowerCase()));
		if (missing.length) console.warn(`[run] LEGAL_TEST_COMPANIES: not found in registry, skipping: ${missing.join(", ")}`);
		console.log(`[run] LEGAL_TEST_COMPANIES set — targeted search against: ${searchCompanies.join(", ") || "(none matched)"}`);
	} else if (ENV.COMPANY_LIMIT) {
		searchCompanies = names.slice(0, ENV.COMPANY_LIMIT);
		console.log(`[run] LEGAL_COMPANY_LIMIT set — targeted search against ${searchCompanies.length} companies only`);
	}
	console.log(`Companies: ${names.length}   Search concurrency: ${ENV.SEARCH_CONCURRENCY}`);
	console.log("");

	// --- 1. Targeted-search sources: one request per company, per source ---
	const limit = pLimit(ENV.SEARCH_CONCURRENCY);
	const targetedTasks = [];
	const courtlistenerTasks = [];
	for (const company of searchCompanies) {
		targetedTasks.push(limit(() => safeFetchForCompany(eeoc, company)));
		targetedTasks.push(limit(() => safeFetchForCompany(humanTraffickingSearch, company)));
		// CourtListener is handled separately from here on — party_name is
		// already a precise structured filter (unlike EEOC/HTS's fuzzy search),
		// so its results skip the company-matcher/relevance-gate/classification
		// pipeline entirely and go straight into the final record set. See
		// sources/courtlistener.js for the full rationale.
		courtlistenerTasks.push(limit(() => safeFetchCourtlistener(company)));
	}
	console.log(`Querying EEOC + Human Trafficking Search for ${names.length} companies (${targetedTasks.length} requests)...`);
	const targetedResults = (await Promise.all(targetedTasks)).flat();
	console.log(`  -> ${targetedResults.length} raw results`);

	console.log(`Querying CourtListener for ${searchCompanies.length} companies...`);
	const courtlistenerByCompany = await Promise.all(courtlistenerTasks);
	const courtlistenerRecords = courtlistenerByCompany.flatMap((r) => r.records);
	const courtlistenerTotalRaw = courtlistenerByCompany.reduce((sum, r) => sum + r.totalCount, 0);
	console.log(`  -> ${courtlistenerTotalRaw} total filings found, ${courtlistenerRecords.length} kept after allowlist + cap`);

	// --- 2. Fetch-once sources ---
	console.log("Fetching OECD Watch, NPR, Triple Pundit, Reuters...");
	const [oecdArticles, nprArticles, tpArticles, reutersArticles] = await Promise.all([
		safeFetchAll(oecdWatch),
		safeFetchAll(npr),
		safeFetchAll(triplepundit),
		safeFetchAll(reuters),
	]);
	const fetchOnceArticles = [...oecdArticles, ...nprArticles, ...tpArticles, ...reutersArticles];
	console.log(`  -> ${fetchOnceArticles.length} raw articles`);
	console.log("");

	// --- 3. Company matching ---
	// Targeted-search results already carry the company they were queried
	// for, but the search engines behind both sources are fuzzy relevance
	// search, not literal substring match (confirmed during build: an HTS
	// query for "Nestlé" surfaced an unrelated Starbucks article) — so every
	// candidate, regardless of source, is re-verified against the shared
	// matcher and requires a TITLE-tier hit. Title-only is deliberate: an
	// EEOC/HTS body-only match (e.g. "Amazon" appearing only because the
	// respondent is an Amazon delivery contractor) is exactly the false-
	// attribution shape observed during build — the company must be the
	// article's actual subject, not an incidental mention.
	const candidates = [];

	for (const article of targetedResults) {
		const hits = matchArticle(article);
		const titleHit = hits.find((h) => h.company === article.matchedCompany && h.where === "title");
		if (!titleHit) continue;
		candidates.push({ ...article, company: article.matchedCompany });
	}

	for (const article of fetchOnceArticles) {
		const hits = matchArticle(article);
		const titleCompanies = new Set(hits.filter((h) => h.where === "title").map((h) => h.company));
		for (const company of titleCompanies) {
			candidates.push({ ...article, company });
		}
	}

	console.log(`Company-matched candidates: ${candidates.length}`);

	// --- 4. Legal-relevance gate ---
	const relevant = candidates.filter(isLegallyRelevant);
	console.log(`Legally relevant (keyword gate): ${relevant.length}`);
	console.log("");

	// --- 5. Status classification: deterministic vs LLM ---
	const deterministic = relevant.filter((a) => DETERMINISTIC_SOURCE_IDS.has(a.sourceId));
	const needsLlm = relevant.filter((a) => !DETERMINISTIC_SOURCE_IDS.has(a.sourceId));

	const records = [];

	for (const a of deterministic) {
		const status = a.sourceId === oecdWatch.SOURCE_ID ? mapOecdStatus(a.oecdStatus) : classifyStatus(a);
		records.push(toRecord(a, a.summary, status));
	}

	const capped = needsLlm.slice(0, ENV.LLM_MAX_CANDIDATES);
	if (needsLlm.length > capped.length) {
		console.warn(
			`[run] LLM candidate cap reached: ${needsLlm.length} candidates, processing first ${capped.length} (LEGAL_LLM_MAX_CANDIDATES=${ENV.LLM_MAX_CANDIDATES})`,
		);
	}

	if (ENV.SKIP_LLM) {
		console.log(`[run] LEGAL_SKIP_LLM set — keeping ${capped.length} LLM-track candidates with status=Unknown, no model load.`);
		for (const a of capped) records.push(toRecord(a, a.summary, "Unknown"));
	} else if (capped.length) {
		console.log(`Running local LLM extraction on ${capped.length} candidates (sequential, CPU-bound)...`);
		let i = 0;
		for (const a of capped) {
			i++;
			const result = await llmExtract({ company: a.company, title: a.title, summary: a.summary });
			if (i % 10 === 0 || i === capped.length) console.log(`  [llm] ${i}/${capped.length}`);
			if (!result || !result.is_relevant) continue;
			records.push(toRecord(a, result.summary || a.summary, result.status));
		}
		await disposeLlm();
	}

	records.push(...courtlistenerRecords);

	console.log("");
	console.log(`Records before dedupe: ${records.length}`);
	const deduped = dedupe(records);
	console.log(`Records after dedupe: ${deduped.length}`);

	// --- 6. Write ---
	if (ENV.DRY_RUN) {
		console.log("[DRY_RUN] Skipping legal-news.json + host-stats writes.");
	} else {
		await tryWrite("legal-news.json", () => writeLegalNews(deduped));
		await tryWrite("legal-news.host-stats.json", () => writeHostStats(getHostStatsSnapshot()));
	}

	console.log("");
	console.log("Done.");
}

function toRecord(article, summary, status) {
	return {
		company: article.company,
		title: article.title,
		summary: excerpt(summary),
		status,
		sourceId: article.sourceId,
		sourceName: article.sourceName,
		sourceUrl: article.url,
		publishedAt: article.publishedAt,
		fetchedAt: new Date().toISOString(),
	};
}

function excerpt(text, max = 400) {
	const t = String(text || "").trim();
	if (t.length <= max) return t;
	return t.slice(0, max).trim() + "…";
}

async function safeFetchForCompany(source, company) {
	try {
		return await source.fetchForCompany(company);
	} catch (err) {
		console.warn(`[${source.SOURCE_ID}] FAIL for "${company}" — ${err.message || err}`);
		return [];
	}
}

async function safeFetchCourtlistener(company) {
	try {
		return await courtlistener.fetchForCompany(company);
	} catch (err) {
		console.warn(`[${courtlistener.SOURCE_ID}] FAIL for "${company}" — ${err.message || err}`);
		return { records: [], totalCount: 0 };
	}
}

async function safeFetchAll(source) {
	try {
		return await source.fetchAll();
	} catch (err) {
		console.warn(`[${source.SOURCE_ID}] FAIL — ${err.message || err}`);
		return [];
	}
}

async function tryWrite(label, fn) {
	try {
		await fn();
	} catch (err) {
		console.error(`[legal-news] FAIL write ${label}: ${err.message || err}`);
	}
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
