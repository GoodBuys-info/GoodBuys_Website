/** @format */
"use client";

import { useEffect, useMemo, useState } from "react";
import "../../styles/legal-news.css";

const STATUS_LABELS = {
	Active: "Active",
	Filed: "Filed",
	Settled: "Settled",
	Dismissed: "Dismissed",
	Closed: "Closed",
	Unknown: "Unknown",
};

export default function LegalNews() {
	const [records, setRecords] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const [filterValue, setFilterValue] = useState("");

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
						<div className="legal-news-companies">
							{filteredCompanies.map((c) => (
								<CompanySection key={c.company} company={c.company} issues={c.issues} />
							))}
						</div>
					)}
				</section>
			</div>
		</main>
	);
}

function CompanySection({ company, issues }) {
	const newsIssues = issues.filter((i) => i.sourceId !== "courtlistener");
	const courtFilings = issues.filter((i) => i.sourceId === "courtlistener");

	return (
		<article className="legal-news-company">
			<header className="legal-news-company-header">
				<h2 className="legal-news-company-name">{company}</h2>
				{newsIssues.length > 0 && (
					<p className="legal-news-company-count">
						{newsIssues.length === 1 ? "1 legal issue on record" : `${newsIssues.length} legal issues on record`}
					</p>
				)}
			</header>

			{newsIssues.length > 0 && (
				<div className="legal-news-issues">
					{newsIssues.map((issue, idx) => (
						<IssueCard key={issue.sourceUrl || idx} issue={issue} />
					))}
				</div>
			)}

			{courtFilings.length > 0 && <CourtFilingsSection filings={courtFilings} />}
		</article>
	);
}

function CourtFilingsSection({ filings }) {
	// totalMatchingCount is the same on every filing for this company —
	// it's the raw CourtListener result count before the allowlist filter,
	// so "view all" links to the complete unfiltered set, not just the
	// relevant subset we chose to show.
	const totalMatching = filings[0]?.totalMatchingCount;
	const viewAllUrl = filings[0]?.viewAllUrl;

	return (
		<div className="legal-news-court-section">
			<div className="legal-news-court-heading">
				<span className="legal-news-court-title">Federal court filings</span>
				<span className="legal-news-court-count">
					{filings.length} of {totalMatching ?? filings.length} shown
				</span>
			</div>

			<div className="legal-news-court-rows">
				{filings.map((filing, idx) => (
					<CourtFilingRow key={filing.sourceUrl || idx} filing={filing} />
				))}
			</div>

			{viewAllUrl && (
				<a href={viewAllUrl} target="_blank" rel="noopener noreferrer" className="legal-news-court-viewall">
					View all {totalMatching} filings on CourtListener ↗
				</a>
			)}
		</div>
	);
}

function CourtFilingRow({ filing }) {
	const { title, status, court, suitNatureLabel, publishedAt, sourceUrl } = filing;
	const dateText = formatDate(publishedAt);
	const statusLabel = STATUS_LABELS[status] || "Active";
	const statusClass = `legal-news-status legal-news-status-${statusLabel.toLowerCase()}`;
	const metaParts = [suitNatureLabel, court, dateText].filter(Boolean);

	return (
		<div className="legal-news-court-row">
			<div className="legal-news-court-row-top">
				<span className="legal-news-court-case">{title}</span>
				<span className={statusClass}>{statusLabel}</span>
			</div>
			<div className="legal-news-court-row-bottom">
				<span className="legal-news-court-meta">{metaParts.join(" · ")}</span>
				{sourceUrl && (
					<a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="legal-news-issue-link">
						View docket ↗
					</a>
				)}
			</div>
		</div>
	);
}

function IssueCard({ issue }) {
	const { summary, status, sourceName, sourceUrl, publishedAt } = issue;
	const dateText = formatDate(publishedAt);
	const statusLabel = STATUS_LABELS[status] || "Unknown";
	const statusClass = `legal-news-status legal-news-status-${statusLabel.toLowerCase()}`;

	return (
		<div className="legal-news-issue-card">
			<div className="legal-news-issue-top">
				<span className={statusClass}>{statusLabel}</span>
			</div>

			{summary && <p className="legal-news-issue-summary">{summary}</p>}

			<div className="legal-news-issue-footer">
				<span className="legal-news-issue-source">
					{sourceName}
					{dateText && <span className="legal-news-issue-date"> • {dateText}</span>}
				</span>

				{sourceUrl && (
					<a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="legal-news-issue-link">
						Read Source ↗
					</a>
				)}
			</div>
		</div>
	);
}

function formatDate(iso) {
	if (!iso) return "";
	const d = new Date(iso);
	if (!Number.isFinite(d.getTime())) return "";
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
