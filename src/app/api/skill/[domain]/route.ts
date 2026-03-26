import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { domain: rawDomain } = await params;
  // Normalize domain: replace dots with dashes to match database storage
  const domain = rawDomain.replace(/\./g, '-');
  
  try {
    // Find website in database
    const website = await prisma.website.findUnique({
      where: { domain }
    });
    
    if (!website) {
      return new NextResponse('# Skill Not Found\\n\\nThis website has not been registered with Agentic Website.', { 
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
    return new NextResponse('# Error\\n\\nFailed to load skill.md', { 
      status: 500,
      headers: { 'Content-Type': 'text/markdown' }
    });
  }
}