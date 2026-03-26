import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string; filename: string }> }
) {
  const { domain: rawDomain, filename } = await params;
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
      return new NextResponse('# Page Not Found\n\nThis website has not been registered with Agentic Website.', { 
        status: 404,
        headers: { 'Content-Type': 'text/markdown' }
      });
    }
    
    // Look for the page file in pageFiles array
    const pageFiles = website.pageFiles as Array<{ filename: string; content: string }> | null;
    
    if (!pageFiles || !Array.isArray(pageFiles)) {
      return new NextResponse('# Page Not Found\n\nNo page files available for this website.', { 
        status: 404,
        headers: { 'Content-Type': 'text/markdown' }
      });
    }
    
    const pageFile = pageFiles.find(p => p.filename === filename);
    
    if (!pageFile) {
      return new NextResponse(`# Page Not Found\n\nFile "${filename}" not found. Available files: ${pageFiles.map(p => p.filename).join(', ')}`, { 
        status: 404,
        headers: { 'Content-Type': 'text/markdown' }
      });
    }
    
    return new NextResponse(pageFile.content, {
      headers: {
        'Content-Type': 'text/markdown',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Page file error:', error);
    return new NextResponse('# Error\n\nFailed to load page file', { 
      status: 500,
      headers: { 'Content-Type': 'text/markdown' }
    });
  }
}
