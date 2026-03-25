import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { serialize } from 'next-mdx-remote/serialize';

const EVENTS_DIR = path.join(process.cwd(), 'app', 'content', 'events');

const HAZARD_PREFIX: Record<string, string> = { drought: 'dr', flood: 'fl' };
const STAGE_TO_TAB: Record<string, string> = {
  'risk-knowledge': 'rk',
  'risk-monitoring': 'rm',
  'risk-decisions': 'rd',
};

export interface EventMdxMeta {
  id: string;
  name: string;
  hazard: string;
  tab: string;
  period: string;
  severity: string;
  events?: number;
  countries?: number;
  regions?: number;
}

/**
 * Build MDX filename from hazard, stage, and date/month key.
 *
 * Examples:
 *   ('drought', 'risk-knowledge', '2021-05')     → rk/dr-rk-2021-05.mdx
 *   ('flood', 'risk-monitoring', '2023-11-15')    → rm/fl-rm-2023-11-15.mdx
 *   ('flood', 'risk-decisions', '2026-03-01')     → rd/fl-rd-2026-03-01.mdx
 */
function buildMdxPath(hazard: string, stage: string, dateKey: string): string {
  const hp = HAZARD_PREFIX[hazard] ?? hazard.slice(0, 2);
  const tab = STAGE_TO_TAB[stage] ?? 'rk';
  return path.join(EVENTS_DIR, tab, `${hp}-${tab}-${dateKey}.mdx`);
}

/**
 * Load and serialize event MDX by hazard, stage, and date key.
 */
export async function loadEventMdx(hazard: string, stage: string, dateKey: string) {
  const filePath = buildMdxPath(hazard, stage, dateKey);

  // For daily mode URLs (YYYY-MM-DD), try exact match first
  if (fs.existsSync(filePath)) {
    return await serializeFile(filePath);
  }

  // Fallback: try month-level file (YYYY-MM) for monthly tabs
  if (dateKey.length === 10) {
    const monthKey = dateKey.slice(0, 7);
    const monthPath = buildMdxPath(hazard, stage, monthKey);
    if (fs.existsSync(monthPath)) {
      return await serializeFile(monthPath);
    }
  }

  return null;
}

async function serializeFile(filePath: string) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const mdxSource = await serialize(content, { parseFrontmatter: false });
  return { meta: data as EventMdxMeta, mdxSource };
}
