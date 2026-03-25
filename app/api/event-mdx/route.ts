import { NextRequest, NextResponse } from 'next/server';
import { loadEventMdx } from 'app/lib/load-event-mdx';

/**
 * GET /api/event-mdx?hazard=drought&stage=risk-knowledge&period=2021-05
 * GET /api/event-mdx?hazard=flood&stage=risk-monitoring&period=2023-11-15
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hazard = searchParams.get('hazard');
  const stage = searchParams.get('stage') ?? 'risk-knowledge';
  const period = searchParams.get('period');

  if (!hazard || !period) {
    return NextResponse.json({ error: 'Missing hazard or period param' }, { status: 400 });
  }

  const result = await loadEventMdx(hazard, stage, period);

  if (!result) {
    return NextResponse.json({ error: 'Event MDX not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
