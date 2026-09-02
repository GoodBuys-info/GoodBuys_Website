/** @format */

// Local, open-weight extraction pass — used only for the three freeform-
// journalism sources (NPR, Triple Pundit, Reuters) whose prose doesn't
// follow the predictable phrasing that classifier.js's keyword rules can
// reliably catch. EEOC and OECD Watch stay fully deterministic; see
// classifier.js for why.
//
// Runs entirely offline via node-llama-cpp — no API key, no per-call cost —
// using a small quantized model (~2GB) sized for a CPU-only, non-interactive
// monthly batch job, not for latency. Deliberately sequential: CPU-bound
// inference gets no benefit from concurrency, and one call at a time keeps
// memory bounded and keeps a stuck call visible in the run log instead of
// silently piling up.

import path from "path";
import { getLlama, resolveModelFile, LlamaChatSession } from "node-llama-cpp";
import { ENV, PATHS } from "./config.js";

const SCHEMA = {
	type: "object",
	properties: {
		is_relevant: {
			type: "boolean",
			description:
				"true only if the article is substantively about a lawsuit, complaint, investigation, settlement, regulatory action, labor-rights violation, or human-trafficking issue involving the named company as a party — not merely mentioning the company in passing.",
		},
		summary: {
			type: "string",
			description: "One or two sentence factual summary of the legal issue, grounded only in the article text given. Empty string if is_relevant is false.",
		},
		status: {
			enum: ["Active", "Filed", "Settled", "Dismissed", "Closed", "Unknown"],
		},
	},
	required: ["is_relevant", "summary", "status"],
};

const SYSTEM_PROMPT =
	"You classify news articles for a company-accountability database. You are given one company name and one article. " +
	"Decide whether the article is substantively about a lawsuit, legal complaint, investigation, settlement, regulatory " +
	"action, labor-rights violation, or human-trafficking finding involving that company as a party — not a passing " +
	"mention, not an article about a different company that merely references this one. If relevant, write a concise, " +
	"factual one-or-two-sentence summary using only what the article states, and classify the case status. Respond only " +
	"with JSON matching the given schema.";

let state = { model: null, grammar: null, initPromise: null };

async function ensureLoaded() {
	if (state.model) return state;
	if (state.initPromise) return state.initPromise;

	state.initPromise = (async () => {
		console.log(`[legal-llm] Loading ${ENV.LLM_MODEL_URI} (first run downloads ~2GB; cached under ${PATHS.MODELS_DIR} after)...`);
		const llama = await getLlama();
		const modelPath = await resolveModelFile(ENV.LLM_MODEL_URI, PATHS.MODELS_DIR);
		const model = await llama.loadModel({ modelPath });
		const grammar = await llama.createGrammarForJsonSchema(SCHEMA);
		state = { model, grammar, initPromise: null };
		console.log(`[legal-llm] Model loaded: ${path.basename(modelPath)}`);
		return state;
	})();

	return state.initPromise;
}

/**
 * @param {{ company: string, title: string, summary: string }} article
 * @returns {Promise<{is_relevant: boolean, summary: string, status: string} | null>} null on failure — caller should skip the candidate, not crash the run.
 */
export async function extract(article) {
	const { model, grammar } = await ensureLoaded();

	const context = await model.createContext();
	try {
		const session = new LlamaChatSession({
			contextSequence: context.getSequence(),
			systemPrompt: SYSTEM_PROMPT,
		});

		const prompt = [
			`Company: ${article.company}`,
			`Article title: ${article.title}`,
			`Article text: ${(article.summary || "").slice(0, 1500)}`,
		].join("\n");

		const raw = await session.prompt(prompt, { grammar, maxTokens: 300 });
		return grammar.parse(raw);
	} catch (err) {
		console.warn(
			`[legal-llm] extraction failed for "${article.company}" / "${String(article.title).slice(0, 60)}": ${err.message || err}`,
		);
		return null;
	} finally {
		await context.dispose();
	}
}

export async function disposeLlm() {
	if (state.model) {
		await state.model.dispose();
		state = { model: null, grammar: null, initPromise: null };
	}
}
