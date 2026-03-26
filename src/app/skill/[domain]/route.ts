import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { domain: rawDomain } = await params;
  // Normalize domain: replace dots with dashes and remove www- prefix
  let domain = rawDomain.replace(/\./g, '-').replace(/^www-/, '');
  
  try {
    // Find website in database
    let website = await prisma.website.findUnique({
      where: { domain }
    });
    
    // If not found and domain has www-, try without it
    if (!website && domain.startsWith('www-')) {
      const domainWithoutWww = domain.replace(/^www-/, '');
      website = await prisma.website.findUnique({
        where: { domain: domainWithoutWww }
      });
      if (website) domain = domainWithoutWww;
    }
    
    if (!website) {
      return new NextResponse('# Skill Not Found\n\nThis website has not been registered with Agentic Website.', { 
        status: 404,
        headers: { 'Content-Type': 'text/markdown' }
      });
    }
    
    return new NextResponse(website.skillMd, {
      headers: {
        'Content-Type': 'text/markdown',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Skill error:', error);
    return new NextResponse('# Error\n\nFailed to load skill.md', { 
      status: 500,
      headers: { 'Content-Type': 'text/markdown' }
    });
  }
}
