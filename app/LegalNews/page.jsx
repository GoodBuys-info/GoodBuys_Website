/** @format */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "../../styles/legal-news.css";
import { IssueCard, CourtFilingRow, Pagination, companySlug } from "./_shared.jsx";

// Index-page preview: at most this many entries (news + court filings,
// merged and sorted by date — `issues` is already sorted that way) show per
// company here. The rest live on that company's own detail page
// (/LegalNews/[company]), which is where real pagination belongs — a long
// scroll of many companies is the wrong place for per-card page controls.
const PREVIEW_LIMIT = 4;

// How many companies per page, in alphabetical order (the list is already
// sorted that way). A directory-style index, not an infinite scroll.
const COMPANIES_PAGE_SIZE = 20;

export default function LegalNews() {
	const [records, setRecords] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const [filterValue, setFilterValue] = useState("");
	const [page, setPage] = useState(1);

	useEffect(() => {
		const load = async () => {
			try {
				const res = await fetch("/data/legal-news.json");
				if (!res.ok) throw new Error("Failed to load legal-news.json");
				const data = await res.json();
				setRecords(Array.isArray(data) ? data : []);
			} catch (err) {
				console.error("[LegalNews] Error loading:", err);
				setError("Could not load legal news data. Try refreshing the page.");
			} finally {
				setIsLoading(false);
			}
		};

		load();
	}, []);

	const companies = useMemo(() => {
		const byCompany = new Map();
		for (const r of records) {
			if (!byCompany.has(r.company)) byCompany.set(r.company, []);
			byCompany.get(r.company).push(r);
		}
		for (const list of byCompany.values()) {
			list.sort((a, b) => {
				const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
				const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
				return tb - ta;
			});
		}
		return Array.from(byCompany.entries())
			.map(([company, issues]) => ({ company, issues }))
			.sort((a, b) => a.company.localeCompare(b.company));
	}, [records]);

	const filteredCompanies = useMemo(() => {
		const term = filterValue.trim().toLowerCase();
		if (!term) return companies;
		return companies.filter((c) => c.company.toLowerCase().includes(term));
	}, [companies, filterValue]);

	// Filtering (or the underlying data) changing out from under an existing
	// page number could otherwise strand the user on a now-empty page.
	useEffect(() => {
		setPage(1);
	}, [filterValue, records]);

	const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / COMPANIES_PAGE_SIZE));
	const pagedCompanies = filteredCompanies.slice((page - 1) * COMPANIES_PAGE_SIZE, page * COMPANIES_PAGE_SIZE);

	return (
		<main id="legal-news">
			<div className="legal-news-inner">
				<section className="legal-news-hero">
					<p className="legal-news-pill">Lawsuits &amp; Legal Issues</p>
					<h1 className="legal-news-title">
						Where the companies
						<br />
						you buy from stand legally.
					</h1>
					<p className="legal-news-lede">
						Lawsuits, complaints, investigations, settlements, and regulatory or labor-rights findings for companies in
						our registry — sourced from OECD Watch, the EEOC, Human Trafficking Search, NPR, Triple Pundit, Reuters, and
						federal court records via CourtListener.
					</p>
					<p className="legal-news-sourced">Refreshed monthly. Every record links back to its original source.</p>

					{!isLoading && companies.length > 0 && (
						<div className="legal-news-filter-shell">
							<span className="legal-news-filter-icon" aria-hidden="true">
								🔍
							</span>
							<input
								type="text"
								className="legal-news-filter"
								placeholder="Filter by company name"
								value={filterValue}
								onChange={(e) => setFilterValue(e.target.value)}
								aria-label="Filter by company name"
							/>
						</div>
					)}

					{error && <p className="legal-news-error">{error}</p>}
				</section>

				<section className="legal-news-feed-section">
					{isLoading ? (
						<div className="legal-news-feed legal-news-feed-skeleton">
							{Array.from({ length: 3 }).map((_, idx) => (
								<div key={idx} className="legal-news-card legal-news-card-skeleton">
									<div className="legal-news-skeleton-meta" />
									<div className="legal-news-skeleton-title" />
									<div className="legal-news-skeleton-line long" />
									<div className="legal-news-skeleton-line short" />
								</div>
							))}
						</div>
					) : filteredCompanies.length === 0 ? (
						<p className="legal-news-empty">
							{companies.length === 0
								? "No legal records yet. The fetcher runs monthly and records will appear here as companies in the registry are matched to lawsuits, complaints, or investigations from the approved sources."
								: "No companies match that filter."}
						</p>
					) : (
						<>
							<div className="legal-news-companies">
								{pagedCompanies.map((c) => (
									<CompanySection key={c.company} company={c.company} issues={c.issues} />
								))}
							</div>
							<Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
						</>
					)}
				</section>
			</div>
		</main>
	);
}

function CompanySection({ company, issues }) {
	const newsIssues = issues.filter((i) => i.sourceId !== "courtlistener");
	const preview = issues.slice(0, PREVIEW_LIMIT); // already sorted by date desc
	const hasMore = issues.length > PREVIEW_LIMIT;
	const href = `/LegalNews/${companySlug(company)}`;

	return (
		<article className="legal-news-company">
			<header className="legal-news-company-header">
				<Link href={href} className="legal-news-company-name-link">
					<h2 className="legal-news-company-name">{company}</h2>
				</Link>
				{newsIssues.length > 0 && (
					<p className="legal-news-company-count">
						{newsIssues.length === 1 ? "1 legal issue on record" : `${newsIssues.length} legal issues on record`}
					</p>
				)}
			</header>

			<div className="legal-news-preview-list">
				{preview.map((item, idx) =>
					item.sourceId === "courtlistener" ? (
						<CourtFilingRow key={item.sourceUrl || idx} filing={item} showLabel />
					) : (
						<IssueCard key={item.sourceUrl || idx} issue={item} />
					),
				)}
			</div>

			{hasMore && (
				<Link href={href} className="legal-news-court-viewall">
					View full legal history for {company} →
				</Link>
			)}
		</article>
	);
}
