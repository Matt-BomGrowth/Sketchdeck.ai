/**
 * SketchDeck.ai business context used to tailor demo data, ICP segments,
 * creative copy and AI narratives.
 *
 * SketchDeck.ai sells LIFT — AI-powered structural steel takeoff and
 * estimating software. Buyers are estimators and owners at steel fabricators,
 * metal building manufacturers, miscellaneous-metals shops and general
 * contractors across the USA and Canada.
 */

export const SKETCHDECK = {
  company: "SketchDeck.ai",
  product: "LIFT",
  tagline: "AI-powered steel takeoffs from drawings to BOM in minutes.",
  website: "https://www.sketchdeck.ai",
  demoUrl: "https://www.sketchdeck.ai/demo",
  currency: "USD",
  timezone: "America/Edmonton",
  /** Typical annual contract value range used to size demo pipeline. */
  acvRange: { min: 18_000, max: 120_000 },
  industries: [
    "Structural Steel Fabrication",
    "Metal Building Manufacturing",
    "Miscellaneous Metals",
    "General Contracting",
    "Steel Detailing & Engineering",
  ],
  companySizes: ["10–50 employees", "51–200 employees", "201–500 employees", "500+ employees"],
  jobTitles: [
    "Chief Estimator",
    "Estimating Manager",
    "VP of Estimating",
    "Owner / President",
    "Preconstruction Director",
    "Project Manager",
    "Steel Detailer",
  ],
  seniorities: ["Owner / C-level", "VP", "Director", "Manager", "Individual contributor"],
  geographies: ["Texas", "Midwest", "Southeast", "Northeast", "West Coast", "Alberta", "Ontario"],
  competitors: ["Tekla", "SDS/2", "Procore", "Autodesk", "PlanGrid", "Bluebeam", "STACK"],
  /** Funnel stage vocabulary as it appears in SketchDeck's CRM. */
  pipelineStages: {
    lead: "Demo request / form submit",
    mql: "Fits ICP (fabricator or estimator, USA/CA)",
    sql: "Demo booked & held",
    opportunity: "Trial started on a live bid",
    pipeline: "Proposal value (seats × ACV)",
    revenue: "Closed won",
  },
} as const;
