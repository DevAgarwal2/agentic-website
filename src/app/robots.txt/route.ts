import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_WIDGET_HOST || 'https://widget.agenticwebsite.io';
  
  const robotsTxt = `User-agent: *
Allow: /

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml

# Disallow API routes
Disallow: /api/

# Allow widget and skill endpoints
Allow: /widget/
Allow: /skill/
`;

  return new NextResponse(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}
