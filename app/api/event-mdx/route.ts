import { NextRequest, NextResponse } from 'next/server';
import { loadEventMdx } from 'app/lib/load-event-mdx';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hazard = searchParams.get('hazard');
  const eventKey = searchParams.get('event');

  if (!hazard || !eventKey) {
    return NextResponse.json({ error: 'Missing hazard or event param' }, { status: 400 });
  }

  const result = await loadEventMdx(hazard, eventKey);

  if (!result) {
    return NextResponse.json({ error: 'Event MDX not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
