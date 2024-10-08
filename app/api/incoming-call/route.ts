import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const host = request.headers.get('host');
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                        <Response>
                            <Say>Hi, you have called Bart's Automative Centre. How can we help?</Say>
                            <Connect>
                                <Stream url="wss://${host}/api/media-stream" />
                            </Connect>
                        </Response>`;

  return new NextResponse(twimlResponse, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

export { GET as POST };