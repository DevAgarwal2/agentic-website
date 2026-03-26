import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_WIDGET_HOST || 'https://widget.agenticwebsite.io';
  
  // Get all registered domains
  const websites = await prisma.website.findMany({
    select: { domain: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' }
  });

  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
`;

  // Add skill pages
  websites.forEach(site => {
    sitemap += `  <url>
    <loc>${baseUrl}/skill/${site.domain}</loc>
    <lastmod>${site.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
  });

  sitemap += '</urlset>';

  return new NextResponse(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
