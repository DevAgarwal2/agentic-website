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
      return NextResponse.json(
        { error: 'Skill not found', message: 'This website has not been registered' },
        { status: 404 }
      );
    }
    
    const skillJson = website.skillJson as any;
    
    return NextResponse.json(skillJson, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Skill JSON error:', error);
    return NextResponse.json(
      { error: 'Server error', message: 'Failed to load skill.json' },
      { status: 500 }
    );
  }
}
