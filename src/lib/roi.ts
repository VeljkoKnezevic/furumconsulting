// Internal funnel and pricing assumptions for the homepage ROI calculator.
//
// Server-side only. This module must never be imported from a client-side
// <script>, or every number below ships in the browser bundle. It is used from
// page frontmatter (build time) and from the /api/roi endpoint (request time).
//
// Pricing model: base fee + a share of average first-year client revenue per show.
const EMAILS_PER_DAY = 1000;
const SENDING_DAYS = 22;
const REPLY_RATE = 0.015;
const POSITIVE_RATE = 0.1;
const BOOK_RATE = 0.4;
const SHOW_RATE = 0.8;
const BASE_FEE = 500;
const REV_SHARE_PER_SHOW = 0.02;

// Slider bounds, shared with the markup so the two can't drift apart.
export const REVENUE_MIN = 5000;
export const REVENUE_MAX = 150000;
export const REVENUE_STEP = 1000;
export const REVENUE_DEFAULT = 30000;

export const CLOSE_MIN = 5;
export const CLOSE_MAX = 50;
export const CLOSE_STEP = 1;
export const CLOSE_DEFAULT = 20;

export interface RoiResult {
  /** New clients per month, one decimal place. */
  clients: string;
  /** New client revenue per month, formatted in USD. */
  revenue: string;
  /** Return on investment, e.g. "9x". */
  roi: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const formatUsd = (value: number) =>
  `$${Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/**
 * Project monthly outcomes from the two inputs a visitor controls. Inputs are
 * clamped to the slider range so hand-crafted requests can't produce nonsense.
 */
export function calculateRoi(avgRevenue: number, closePercent: number): RoiResult {
  const revenuePerClient = clamp(avgRevenue, REVENUE_MIN, REVENUE_MAX);
  const closeRate = clamp(closePercent, CLOSE_MIN, CLOSE_MAX) / 100;

  const emails = EMAILS_PER_DAY * SENDING_DAYS;
  const replies = emails * REPLY_RATE;
  const leads = replies * POSITIVE_RATE;
  const calls = leads * BOOK_RATE;
  const shows = calls * SHOW_RATE;
  const clients = shows * closeRate;
  const revenue = clients * revenuePerClient;
  const cost = BASE_FEE + REV_SHARE_PER_SHOW * revenuePerClient * shows;

  return {
    clients: clients.toFixed(1),
    revenue: formatUsd(revenue),
    roi: `${Math.round(revenue / cost)}x`,
  };
}
