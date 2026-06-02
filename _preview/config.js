window.TENDER_PORTAL_CONFIG = {
  refreshMs: 60 * 1000,
  sources: {
    portfolio: ["/api/portfolio", "./data.json"],
    liveTenders: ["/api/live-tenders", "./data.json"],
    executiveReport: ["/api/executive-report"],
  },
};
