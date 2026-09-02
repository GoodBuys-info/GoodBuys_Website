/** @format */

// Atomic tmp + rename writes — same pattern as scripts/fetch-news/io.js and
// scripts/scrape-company-labels/io.js. Matters more here than for the news
// preview: legal-news.json is committed to git (see the GitHub Actions
// workflow), so a half-written file would land in a commit, not just a
// gitignored scratch file.

import fs from "fs/promises";
import path from "path";

import { PATHS } from "./config.js";

const { OUTPUT_PATH, HOST_STATS_PATH } = PATHS;

export async function writeLegalNews(records) {
	if (!Array.isArray(records)) {
		throw new Error(`[legal-io] writeLegalNews: expected array, got ${typeof records}`);
	}
	await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
	const tmp = OUTPUT_PATH + ".tmp";
	await fs.writeFile(tmp, JSON.stringify(records, null, 2), "utf8");
	await fs.rename(tmp, OUTPUT_PATH);
	console.log(`Legal news → ${OUTPUT_PATH}`);
}

export async function writeHostStats(hostStats) {
	if (!hostStats || typeof hostStats !== "object") return;
	await fs.mkdir(path.dirname(HOST_STATS_PATH), { recursive: true });
	const tmp = HOST_STATS_PATH + ".tmp";
	await fs.writeFile(tmp, JSON.stringify(hostStats, null, 2), "utf8");
	await fs.rename(tmp, HOST_STATS_PATH);
	console.log(`Host stats → ${HOST_STATS_PATH}`);
}
