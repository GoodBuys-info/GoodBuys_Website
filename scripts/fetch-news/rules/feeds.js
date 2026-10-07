/** @format */

// Feed registry. Each entry: { id, name, url }.
// id = stable slug used in output records and host-stats; must be unique.
// Add new feeds by appending; don't reorder (id is the stable key, not position).
// paged: true = WordPress-style feed that serves older items at <url>?paged=N
// (verified for Edie, Trellis, Grist). Used to backfill history; the other
// feeds only expose their latest window.

const FEEDS = [
	{ id: "edie", name: "Edie", url: "https://www.edie.net/feed/", paged: true },
	{ id: "triplepundit", name: "Triple Pundit", url: "https://www.triplepundit.com/feed/" },
	{ id: "trellis", name: "Trellis", url: "https://trellis.net/feed/", paged: true },
	{ id: "grist", name: "Grist", url: "https://grist.org/feed/", paged: true },
	{ id: "sustainablebrands", name: "Sustainable Brands", url: "https://sustainablebrands.com/rss/" },
];

export default FEEDS;
