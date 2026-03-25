import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { serialize } from 'next-mdx-remote/serialize';

const EVENTS_DIR = path.join(process.cwd(), 'app', 'content', 'events');

export interface EventMdxMeta {
  id: string;
  name: string;
  country: string;
  iso: string;
  hazard: string;
  severity: string;
  period: string;
  year?: number;
  month?: number;
}

/**
 * Load and serialize a single event MDX file by disaster type and event key.
 * Returns the serialized MDX source + frontmatter metadata.
 */
export async function loadEventMdx(hazard: string, eventKey: string) {
  // Convert event key to safe filename (same logic as generate_event_mdx.py)
  const safeKey = eventKey.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const filePath = path.join(EVENTS_DIR, hazard, `${safeKey}.mdx`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const mdxSource = await serialize(content, { parseFrontmatter: false });

  return {
    meta: data as EventMdxMeta,
    mdxSource,
  };
}

/**
 * List all available event keys for a hazard type.
 */
export function listEventKeys(hazard: string): string[] {
  const dir = path.join(EVENTS_DIR, hazard);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => f.replace(/\.mdx$/, '').replace(/_/g, '-'))
    // Restore original format: 2021-9546-ETH
    .sort();
}
