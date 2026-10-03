export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: 'infinity-employee-system',
      version: '0.1.0',
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
