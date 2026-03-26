import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rate limiting store (in production, use Redis)
const rateLimit = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT = 5; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in ms

export function middleware(request: NextRequest) {
  // Only apply to API routes
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Add security headers
  const response = NextResponse.next();
  
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://openrouter.ai;"
  );

  // Rate limiting for generate endpoint
  if (request.nextUrl.pathname === '/api/generate' && request.method === 'POST') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || 'anonymous';
    const now = Date.now();
    
    const record = rateLimit.get(ip);
    
    if (record) {
      if (now > record.resetTime) {
        // Reset window
        rateLimit.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
      } else if (record.count >= RATE_LIMIT) {
        // Rate limit exceeded
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      } else {
        // Increment count
        record.count++;
      }
    } else {
      // First request
      rateLimit.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
