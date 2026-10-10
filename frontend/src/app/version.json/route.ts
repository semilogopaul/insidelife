import { connection } from 'next/server';

/**
 * The build this server runs (`NEXT_PUBLIC_BUILD_ID`, set at image build). An installed game opened from its saved copy
 * compares it with its own and refreshes itself when they differ (`common/pwa/update-check.ts`). Never cached.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev' }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
