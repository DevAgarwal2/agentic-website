import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { prisma } from '@/lib/prisma';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v1';
const PRIMARY_MODEL = 'google/gemini-2.0-flash-001';
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';
const TERTIARY_MODEL = 'arcee-ai/trinity-large-preview:free';

interface PageData {
  url: string;
  title: string;
  content: string;
  markdown: string;
  codeExamples: string[];
  headings: string[];
  listItems: string[];
  tableData: string[];
  apiEndpoints: string[];
  path: string;
  filename: string;
}

interface ScrapedData {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  mainContent: string;
  fullMarkdown: string;
  features: string[];
  links: { text: string; href: string }[];
  codeExamples: string[];
  installCommands: string[];
  listItems: string[];
  tableData: string[];
  apiEndpoints: string[];
  pages: PageData[];
  pagesScraped: string[];
  missingInfo: string[];
  domainId: string;
  brandName: string;
  displayName: string;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

function log(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// ─── FIRECRAWL SCRAPING (PRIMARY) ─────────────────────────────────────────────

async function firecrawlScrape(url: string): Promise<{ markdown: string; html: string; success: boolean }> {
  if (!FIRECRAWL_API_KEY) {
    log('No Firecrawl API key, skipping');
    return { markdown: '', html: '', success: false };
  }

  try {
    log(`Firecrawl scraping: ${url}`);
    const response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        onlyMainContent: false,
        waitFor: 3000,
        timeout: 15000
      }),
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      const errText = await response.text();
      log(`Firecrawl error: ${response.status} - ${errText}`);
      return { markdown: '', html: '', success: false };
    }

    const data = await response.json();
    const markdown = data.data?.markdown || '';
    const html = data.data?.html || '';
    log(`Firecrawl success: ${url} (${markdown.length} chars markdown, ${html.length} chars html)`);
    return { markdown, html, success: true };
  } catch (error) {
    log(`Firecrawl error: ${url} - ${error}`);
    return { markdown: '', html: '', success: false };
  }
}

async function firecrawlMap(url: string): Promise<string[]> {
  if (!FIRECRAWL_API_KEY) return [];

  try {
    log(`Firecrawl map: ${url}`);
    const response = await fetch(`${FIRECRAWL_BASE_URL}/map`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        limit: 100
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      log(`Firecrawl map error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const links: string[] = data.data?.links || data.links || [];
    log(`Firecrawl map found ${links.length} URLs`);
    return links;
  } catch (error) {
    log(`Firecrawl map error: ${error}`);
    return [];
  }
}

// ─── FALLBACK SCRAPERS ────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<{ html: string; success: boolean }> {
  try {
    log(`Fetching: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      log(`Failed: ${url} (status ${response.status})`);
      return { html: '', success: false };
    }

    const html = await response.text();
    log(`Success: ${url} (${html.length} bytes)`);
    return { html, success: true };
  } catch (error) {
    log(`Error: ${url} - ${error}`);
    return { html: '', success: false };
  }
}

// Smart fetch: Firecrawl first → plain fetch fallback
async function smartFetch(url: string): Promise<{ html: string; markdown: string; success: boolean }> {
  // Try Firecrawl first (best quality)
  const firecrawlResult = await firecrawlScrape(url);
  if (firecrawlResult.success && (firecrawlResult.markdown.length > 200 || firecrawlResult.html.length > 500)) {
    return { html: firecrawlResult.html, markdown: firecrawlResult.markdown, success: true };
  }

  // Fallback to plain fetch
  log('Firecrawl returned minimal/no content, trying plain fetch...');
  const fetchResult = await fetchPage(url);
  if (fetchResult.success) {
    return { html: fetchResult.html, markdown: '', success: true };
  }

  return { html: '', markdown: '', success: false };
}

// ─── URL DISCOVERY ────────────────────────────────────────────────────────────

const LANGUAGE_CODES = ['zh', 'zht', 'ko', 'de', 'es', 'fr', 'it', 'da', 'ja', 'ru', 'pt', 'nl', 'pl', 'tr', 'ar', 'hi', 'no', 'br', 'th', 'sv', 'fi', 'cs', 'hu', 'ro', 'id', 'vi', 'ms', 'tl', 'bn', 'ur', 'fa', 'he', 'el', 'uk', 'bg', 'hr', 'sr', 'sk', 'sl', 'lt', 'lv', 'et', 'is', 'ga', 'mt'];

const SKIP_PATHS = [
  'brand', 'discord', 'legal', 'privacy', 'terms', 'careers', 'press', 'about',
  'blog', 'news', 'press-kit', 'media', 'jobs', 'career', 'hiring', 'team',
  'contact', 'support', 'help', 'faq', 'status', 'security', 'trust', 'gdpr',
  'cookies', 'cookie-policy', 'accessibility', 'sitemap', 'login', 'signup',
  'register', 'signin', 'signout', 'logout', 'account', 'profile', 'settings'
];

// Common documentation/API paths to probe when no sitemap exists
const DISCOVERY_PATHS = [
  '/docs', '/documentation', '/api', '/api-reference', '/reference',
  '/guide', '/guides', '/getting-started', '/quickstart', '/quick-start',
  '/tutorial', '/tutorials', '/examples', '/sdk', '/sdks',
  '/changelog', '/releases', '/pricing', '/features', '/integrations',
  '/plugins', '/extensions', '/developer', '/developers', '/platform',
  '/overview', '/introduction', '/intro', '/concepts', '/learn',
  '/resources', '/tools', '/cli', '/rest-api', '/graphql',
  '/webhooks', '/authentication', '/auth', '/setup', '/install',
  '/configuration', '/config', '/usage', '/recipes', '/cookbook',
  '/migration', '/upgrade', '/api-docs', '/api/docs', '/swagger',
  '/openapi', '/endpoints', '/methods', '/libraries', '/packages'
];

function isLanguagePage(url: string): boolean {
  const urlObj = new URL(url);
  const path = urlObj.pathname.replace(/^\//, '').split('/')[0];
  return LANGUAGE_CODES.includes(path.toLowerCase());
}

function isIrrelevantPage(url: string): boolean {
  const urlObj = new URL(url);
  const path = urlObj.pathname.toLowerCase();
  return SKIP_PATHS.some(skip => path.includes('/' + skip) || path.startsWith(skip));
}

function getPagePathAndFilename(url: string): { path: string; filename: string } {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  const cleanPath = pathname.replace(/^\//, '').replace(/\/$/, '');

  if (!cleanPath || cleanPath === '') {
    return { path: '/', filename: 'index.md' };
  }

  const filename = cleanPath.replace(/\//g, '-').toLowerCase() + '.md';
  return { path: pathname, filename };
}

async function getSitemapUrls(baseUrl: string): Promise<string[]> {
  const sitemapLocations = [
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap/sitemap.xml',
    '/wp-sitemap.xml',
    '/sitemap-index.xml'
  ];

  for (const location of sitemapLocations) {
    try {
      log(`Checking sitemap: ${baseUrl}${location}`);
      const response = await fetch(`${baseUrl}${location}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;

      const xml = await response.text();
      const urls: string[] = [];

      const isSitemapIndex = xml.includes('<sitemapindex');

      if (isSitemapIndex) {
        log(`Found sitemap index at ${location}, fetching nested sitemaps...`);
        const sitemapMatches = xml.match(/<loc>(.*?)<\/loc>/g);
        if (sitemapMatches) {
          for (const match of sitemapMatches.slice(0, 5)) {
            const sitemapUrl = match.replace(/<\/?loc>/g, '');
            try {
              const nestedResponse = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5000) });
              if (nestedResponse.ok) {
                const nestedXml = await nestedResponse.text();
                const nestedUrlMatches = nestedXml.match(/<loc>(.*?)<\/loc>/g);
                if (nestedUrlMatches) {
                  nestedUrlMatches.forEach(nestedMatch => {
                    const url = nestedMatch.replace(/<\/?loc>/g, '');
                    if (url.startsWith(baseUrl) && !isLanguagePage(url) && !isIrrelevantPage(url)) {
                      urls.push(url);
                    }
                  });
                }
              }
            } catch {
              log(`Failed to fetch nested sitemap: ${sitemapUrl}`);
            }
          }
        }
      } else {
        const urlMatches = xml.match(/<loc>(.*?)<\/loc>/g);
        if (urlMatches) {
          urlMatches.forEach(match => {
            const url = match.replace(/<\/?loc>/g, '');
            if (url.startsWith(baseUrl) && !isLanguagePage(url) && !isIrrelevantPage(url)) {
              urls.push(url);
            }
          });
        }
      }

      log(`Found ${urls.length} URLs in sitemap at ${location}`);
      return urls.slice(0, 50);
    } catch (error) {
      log(`Sitemap error at ${location}: ${error}`);
    }
  }

  log('No sitemap found at any location');
  return [];
}

async function getRobotsTxtUrls(baseUrl: string): Promise<string[]> {
  try {
    log(`Checking robots.txt: ${baseUrl}/robots.txt`);
    const response = await fetch(`${baseUrl}/robots.txt`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return [];

    const text = await response.text();
    const urls: string[] = [];
    const sitemapMatches = text.match(/Sitemap:\s*(.+)/gi);
    if (sitemapMatches) {
      for (const match of sitemapMatches) {
        const sitemapUrl = match.replace(/Sitemap:\s*/i, '').trim();
        const sitemapUrls = await getSitemapUrls(sitemapUrl.replace(/sitemap\.xml$/, ''));
        urls.push(...sitemapUrls);
      }
    }
    return urls;
  } catch {
    return [];
  }
}

// Directory discovery: probe common paths when no sitemap/robots.txt found
async function discoverDirectories(baseUrl: string): Promise<string[]> {
  log(`No sitemap/robots.txt found. Probing ${DISCOVERY_PATHS.length} common paths...`);
  const discoveredUrls: string[] = [];

  // Batch HEAD requests (10 at a time) to check which paths exist
  const batchSize = 10;
  for (let i = 0; i < DISCOVERY_PATHS.length; i += batchSize) {
    const batch = DISCOVERY_PATHS.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (path) => {
        const url = `${baseUrl}${path}`;
        try {
          const response = await fetch(url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(3000),
            redirect: 'follow',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          if (response.ok) {
            return url;
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        discoveredUrls.push(result.value);
      }
    }
  }

  log(`Discovered ${discoveredUrls.length} valid paths from probing`);

  // Also try Firecrawl map to discover all URLs on the domain
  const mapUrls = await firecrawlMap(baseUrl);
  if (mapUrls.length > 0) {
    const filtered = mapUrls.filter(url => {
      try {
        return url.startsWith(baseUrl) && !isLanguagePage(url) && !isIrrelevantPage(url);
      } catch {
        return false;
      }
    });
    discoveredUrls.push(...filtered);
    log(`Added ${filtered.length} URLs from Firecrawl map`);
  }

  return [...new Set(discoveredUrls)].slice(0, 50);
}

function extractLinksFromPage(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $('a').each((_, el) => {
    let href = $(el).attr('href') || '';

    if (href.startsWith('#') || href.startsWith('javascript:') ||
      href.startsWith('mailto:') || href.startsWith('tel:')) return;

    if (/\.(pdf|zip|tar|gz|rar|exe|dmg|pkg|deb|rpm)$/i.test(href)) return;
    if (/\.(jpg|jpeg|png|gif|svg|webp|css|js|ico)$/i.test(href)) return;

    if (href.startsWith('/')) {
      href = `${baseUrl}${href}`;
    } else if (!href.startsWith('http')) {
      href = `${baseUrl}/${href}`;
    }

    if (href.startsWith(baseUrl)) {
      href = href.split('#')[0].replace(/\/$/, '');
      if (!isLanguagePage(href) && !isIrrelevantPage(href)) {
        links.push(href);
      }
    }
  });

  return [...new Set(links)];
}

// ─── ENHANCED CONTENT EXTRACTION ──────────────────────────────────────────────

function extractPageData(url: string, html: string, firecrawlMarkdown: string = ''): PageData {
  const $ = cheerio.load(html);
  const title = $('title').text().trim() || $('h1').first().text().trim() || 'Unknown';

  // Extract paragraphs
  const paragraphs: string[] = [];
  $('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 20 && text.length < 1000) {
      paragraphs.push(text);
    }
  });

  // Extract headings
  const headings: string[] = [];
  $('h1, h2, h3, h4').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 200) headings.push(text);
  });

  // Extract code examples
  const codeExamples: string[] = [];
  $('pre code, code[class*="language"], .code-block, [class*="code"], pre').each((_, el) => {
    const code = $(el).text().trim();
    if (code && code.length > 20 && code.length < 3000) {
      codeExamples.push(code);
    }
  });

  // Extract list items (features, steps, etc.)
  const listItems: string[] = [];
  $('li').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10 && text.length < 300) {
      listItems.push(text);
    }
  });

  // Extract table data
  const tableData: string[] = [];
  $('table').each((_, table) => {
    const rows: string[] = [];
    $(table).find('tr').each((_, tr) => {
      const cells: string[] = [];
      $(tr).find('th, td').each((_, cell) => {
        cells.push($(cell).text().trim());
      });
      if (cells.length > 0) {
        rows.push(cells.join(' | '));
      }
    });
    if (rows.length > 0) {
      tableData.push(rows.join('\n'));
    }
  });

  // Extract API endpoints (URL patterns like /api/..., method signatures)
  const apiEndpoints: string[] = [];
  const allText = $('body').text();
  const apiPatterns = allText.match(/(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[a-zA-Z0-9\/_\-{}:]+/gi);
  if (apiPatterns) {
    apiEndpoints.push(...[...new Set(apiPatterns)].slice(0, 20));
  }
  // Also look for endpoint-like paths in code blocks
  $('code').each((_, el) => {
    const text = $(el).text().trim();
    if (text.match(/^(GET|POST|PUT|PATCH|DELETE)\s/i) || text.match(/^\/api\//)) {
      apiEndpoints.push(text);
    }
  });

  // Extract content from semantic elements
  const semanticContent: string[] = [];
  $('article, section, main, [role="main"]').each((_, el) => {
    const text = $(el).text().trim().slice(0, 500);
    if (text && text.length > 50) {
      semanticContent.push(text);
    }
  });

  const { path, filename } = getPagePathAndFilename(url);

  // Build content: prefer Firecrawl markdown, fall back to extracted paragraphs
  const content = firecrawlMarkdown
    ? firecrawlMarkdown.slice(0, 5000)
    : [...paragraphs.slice(0, 15), ...semanticContent.slice(0, 5)].join('\n\n');

  return {
    url,
    title,
    content,
    markdown: firecrawlMarkdown || '',
    codeExamples: [...new Set(codeExamples)].slice(0, 5),
    headings: [...new Set(headings)].slice(0, 15),
    listItems: [...new Set(listItems)].slice(0, 30),
    tableData: tableData.slice(0, 5),
    apiEndpoints: [...new Set(apiEndpoints)].slice(0, 15),
    path,
    filename
  };
}

// ─── WEBSITE SCRAPING ─────────────────────────────────────────────────────────

function extractBrandName(hostname: string): string {
  let name = hostname.replace(/^www\./, '');
  const parts = name.split('.');
  if (parts.length >= 2) {
    name = parts[parts.length - 2];
  }
  return name;
}

function formatBrandName(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function generatePageMd(page: PageData): string {
  let md = `# ${page.title}\n\n`;
  md += `**URL:** ${page.url}\n\n`;

  // If we have Firecrawl markdown, use it directly (much richer)
  if (page.markdown && page.markdown.length > 100) {
    md += page.markdown;
    md += '\n\n';
  } else {
    md += `## Overview\nThis page contains information about ${page.title}.\n\n`;

    if (page.headings.length > 0) {
      md += `## Page Sections\n\n`;
      page.headings.forEach(heading => { md += `- ${heading}\n`; });
      md += '\n';
    }

    if (page.content && page.content.length > 0) {
      md += `## Key Content\n\n${page.content}\n\n`;
    }

    if (page.listItems.length > 0) {
      md += `## Key Points\n\n`;
      page.listItems.slice(0, 15).forEach(item => { md += `- ${item}\n`; });
      md += '\n';
    }

    if (page.tableData.length > 0) {
      md += `## Data Tables\n\n`;
      page.tableData.forEach((table, i) => {
        md += `### Table ${i + 1}\n\`\`\`\n${table}\n\`\`\`\n\n`;
      });
    }

    if (page.apiEndpoints.length > 0) {
      md += `## API Endpoints\n\n`;
      page.apiEndpoints.forEach(ep => { md += `- \`${ep}\`\n`; });
      md += '\n';
    }

    if (page.codeExamples.length > 0) {
      md += `## Code Examples\n\n`;
      page.codeExamples.forEach((code, i) => {
        md += `### Example ${i + 1}\n\n\`\`\`\n${code}\n\`\`\`\n\n`;
      });
    }
  }

  md += `---\n\n**Metadata**\n- Path: ${page.path}\n- Scraped: ${new Date().toISOString()}\n`;
  return md;
}

async function scrapeWebsite(url: string): Promise<ScrapedData> {
  log(`Starting scrape of: ${url}`);
  const baseUrl = new URL(url).origin;
  const hostname = new URL(url).hostname;
  const brandName = extractBrandName(hostname);
  const displayName = formatBrandName(brandName);
  const domainId = hostname.replace(/^www\./, '').replace(/\./g, '-');
  log(`Brand: ${displayName}, Domain ID: ${domainId}`);

  const crawledUrls = new Set<string>();
  const pagesToCrawl: string[] = [url];
  const pagesData: PageData[] = [];
  const pagesScraped: string[] = [];
  const missingInfo: string[] = [];
  const failedUrls: string[] = [];

  // ─── Step 1: Try sitemap & robots.txt first ─────────────────────────
  const sitemapUrls = await getSitemapUrls(baseUrl);
  if (sitemapUrls.length > 0) {
    pagesToCrawl.push(...sitemapUrls);
    log(`Added ${sitemapUrls.length} URLs from sitemap`);
  }

  const robotsUrls = await getRobotsTxtUrls(baseUrl);
  if (robotsUrls.length > 0) {
    pagesToCrawl.push(...robotsUrls);
    log(`Added ${robotsUrls.length} URLs from robots.txt`);
  }

  // ─── Step 2: If no sitemap/robots, discover directories ─────────────
  if (sitemapUrls.length === 0 && robotsUrls.length === 0) {
    const discoveredUrls = await discoverDirectories(baseUrl);
    if (discoveredUrls.length > 0) {
      pagesToCrawl.push(...discoveredUrls);
      log(`Added ${discoveredUrls.length} URLs from directory discovery`);
    }
  }

  // ─── Step 3: Scrape landing page with Firecrawl ─────────────────────
  const { html: landingHtml, markdown: landingMarkdown, success: landingSuccess } = await smartFetch(url);

  if (!landingSuccess) {
    throw new Error(`Failed to fetch landing page: ${url}`);
  }

  const $ = cheerio.load(landingHtml);
  const title = $('title').text().trim() || $('h1').first().text().trim() || 'Unknown';
  const metaDescription = $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    '';

  log(`Landing page title: ${title}`);

  const landingData = extractPageData(url, landingHtml, landingMarkdown);
  pagesData.push(landingData);
  pagesScraped.push(url);
  crawledUrls.add(url);

  // Extract links from landing page HTML
  const landingLinks = extractLinksFromPage(landingHtml, baseUrl);
  pagesToCrawl.push(...landingLinks);
  log(`Found ${landingLinks.length} internal links on landing page`);

  // ─── Step 4: Crawl sub-pages ────────────────────────────────────────
  const uniqueUrls = [...new Set(pagesToCrawl)].filter(u =>
    !crawledUrls.has(u) && !isLanguagePage(u) && !isIrrelevantPage(u)
  );
  const MAX_PAGES = 50;
  const urlsToCrawl = uniqueUrls.slice(0, MAX_PAGES);
  log(`Will crawl ${urlsToCrawl.length} pages (max ${MAX_PAGES})`);

  // Crawl sub-pages using smartFetch (Firecrawl → fetch fallback)
  for (const pageUrl of urlsToCrawl) {
    if (crawledUrls.has(pageUrl)) continue;
    if (isLanguagePage(pageUrl) || isIrrelevantPage(pageUrl)) continue;

    crawledUrls.add(pageUrl);

    const { html, markdown, success } = await smartFetch(pageUrl);
    if (success && (html || markdown)) {
      const pageData = extractPageData(pageUrl, html, markdown);
      pagesData.push(pageData);
      pagesScraped.push(pageUrl);

      // Discover more links from HTML
      if (html && pagesData.length < MAX_PAGES) {
        const moreLinks = extractLinksFromPage(html, baseUrl);
        for (const link of moreLinks) {
          if (!crawledUrls.has(link) && pagesToCrawl.length < MAX_PAGES &&
            !isLanguagePage(link) && !isIrrelevantPage(link)) {
            pagesToCrawl.push(link);
          }
        }
      }
    } else {
      failedUrls.push(pageUrl);
    }
  }

  log(`Scraped ${pagesScraped.length} pages total, ${failedUrls.length} failed`);

  if (failedUrls.length > 0) {
    const keyPages = ['pricing', 'docs', 'api', 'features', 'integrate'];
    const missingKeyPages = keyPages.filter(keyword =>
      failedUrls.some(url => url.toLowerCase().includes(keyword))
    );
    if (missingKeyPages.length > 0) {
      missingInfo.push(`Key pages not accessible: ${missingKeyPages.join(', ')}`);
    }
  }

  // ─── Step 5: Aggregate all data ─────────────────────────────────────
  const englishPages = pagesData.filter(page => !isLanguagePage(page.url));

  const allHeadings: string[] = [];
  const allContent: string[] = [];
  const allMarkdown: string[] = [];
  const allCodeExamples: string[] = [];
  const allFeatures: string[] = [];
  const allLinks: { text: string; href: string }[] = [];
  const allListItems: string[] = [];
  const allTableData: string[] = [];
  const allApiEndpoints: string[] = [];

  englishPages.forEach(page => {
    allHeadings.push(...page.headings);
    allContent.push(page.content);
    if (page.markdown) allMarkdown.push(page.markdown);
    allCodeExamples.push(...page.codeExamples);
    allListItems.push(...page.listItems);
    allTableData.push(...page.tableData);
    allApiEndpoints.push(...page.apiEndpoints);
  });

  $('[class*="feature"], [class*="benefit"], [class*="highlight"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 200) allFeatures.push(text);
  });

  $('a').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (text && text.length < 100 && (href.includes('docs') || href.includes('api') || href.includes('about') || href.includes('pricing'))) {
      const fullUrl = href.startsWith('/') ? `${baseUrl}${href}` : href;
      allLinks.push({ text, href: fullUrl });
    }
  });

  const installCommands: string[] = [];
  const allText = allContent.join(' ') + ' ' + allMarkdown.join(' ');

  const npmMatches = allText.match(/npm install[\w\s@\-\/\.]+/gi);
  const yarnMatches = allText.match(/yarn add[\w\s@\-\/\.]+/gi);
  const pnpmMatches = allText.match(/pnpm add[\w\s@\-\/\.]+/gi);
  const curlMatches1 = allText.match(/curl[\s\-]+fsSL[\s\w\.\-\/:\?\&\=\|]+/gi);
  const curlMatches2 = allText.match(/curl[\s\-]+[LOoSs]+[\s\w\.\-\/:\?\&\=\|]+/gi);
  const curlMatches3 = allText.match(/curl[\s]+https?:\/\/[^\s]+/gi);
  const curlMatches = [...(curlMatches1 || []), ...(curlMatches2 || []), ...(curlMatches3 || [])];
  const brewMatches = allText.match(/brew install[\w\s@\-\/\.]+/gi);
  const pipMatches = allText.match(/pip(3)? install[\w\s@\-\/\.]+/gi);
  const goGetMatches = allText.match(/go get[\w\s@\-\/\.]+/gi);
  const composerMatches = allText.match(/composer require[\w\s@\-\/\.]+/gi);
  const cargoMatches = allText.match(/cargo add[\w\s@\-\/\.]+/gi);

  if (npmMatches) installCommands.push(...npmMatches.slice(0, 3));
  if (yarnMatches) installCommands.push(...yarnMatches.slice(0, 3));
  if (pnpmMatches) installCommands.push(...pnpmMatches.slice(0, 3));
  if (curlMatches) installCommands.push(...curlMatches.slice(0, 3));
  if (brewMatches) installCommands.push(...brewMatches.slice(0, 3));
  if (pipMatches) installCommands.push(...pipMatches.slice(0, 3));
  if (goGetMatches) installCommands.push(...goGetMatches.slice(0, 2));
  if (composerMatches) installCommands.push(...composerMatches.slice(0, 2));
  if (cargoMatches) installCommands.push(...cargoMatches.slice(0, 2));

  log(`Extracted: ${allHeadings.length} headings, ${allCodeExamples.length} code examples, ${installCommands.length} install commands, ${allListItems.length} list items, ${allTableData.length} tables, ${allApiEndpoints.length} API endpoints`);

  return {
    url,
    title,
    metaDescription,
    headings: [...new Set(allHeadings)].slice(0, 30),
    mainContent: allContent.join('\n\n').slice(0, 8000),
    fullMarkdown: allMarkdown.join('\n\n---\n\n').slice(0, 15000),
    features: [...new Set(allFeatures)].slice(0, 15),
    links: allLinks.slice(0, 15),
    codeExamples: [...new Set(allCodeExamples)].slice(0, 10),
    installCommands: [...new Set(installCommands)].slice(0, 5),
    listItems: [...new Set(allListItems)].slice(0, 40),
    tableData: allTableData.slice(0, 8),
    apiEndpoints: [...new Set(allApiEndpoints)].slice(0, 20),
    pages: englishPages,
    pagesScraped: pagesScraped.filter(url => !isLanguagePage(url)),
    missingInfo,
    domainId,
    brandName,
    displayName
  };
}

// ─── LLM CALLS ────────────────────────────────────────────────────────────────

async function callOpenRouter(prompt: string, systemContent: string): Promise<OpenRouterResponse> {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL, TERTIARY_MODEL];

  for (let i = 0; i < models.length; i++) {
    try {
      log(`Trying model: ${models[i]}`);
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://website-to-skill.dev',
          'X-Title': 'Website to Skill Generator'
        },
        body: JSON.stringify({
          model: models[i],
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3
        })
      });

      if (response.status === 429) {
        log(`Rate limited on ${models[i]}, trying next...`);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        log(`Model ${models[i]} error: ${response.status} - ${errText}`);
        continue;
      }

      const result = await response.json();
      log(`Model ${models[i]} succeeded`);
      return result;
    } catch (error) {
      log(`Model ${models[i]} failed: ${error}`);
      if (i === models.length - 1) throw error;
    }
  }

  throw new Error('All models failed');
}

// ─── PAGE FILTERING ───────────────────────────────────────────────────────────

async function filterImportantPages(pages: PageData[]): Promise<PageData[]> {
  if (pages.length <= 8) return pages;

  log(`Filtering ${pages.length} pages to most important 8...`);

  const pageInfo = pages.map(p => ({
    url: p.url,
    title: p.title,
    path: p.path,
    content_preview: p.content.slice(0, 200),
    headings: p.headings.slice(0, 5)
  }));

  const filterPrompt = `Analyze these pages and select the 8 most important ones for an AI agent to understand this service.

Consider:
- Which pages contain actionable information (API docs, setup guides, code examples)?
- Which explain core functionality and capabilities?
- Which have substantive technical content vs marketing fluff?
- Avoid duplicates

Pages:
${JSON.stringify(pageInfo, null, 2)}

Return ONLY a JSON array of exactly 8 URLs: ["url1", "url2", ...]`;

  try {
    const result = await callOpenRouter(
      filterPrompt,
      'Select the most important pages. Return only valid JSON array of URLs.'
    );

    const content = result.choices[0].message.content.trim();
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found');

    const selectedUrls = JSON.parse(jsonMatch[0]);
    log(`LLM selected ${selectedUrls.length} important pages`);

    const filtered: PageData[] = [];
    for (const url of selectedUrls) {
      const page = pages.find(p => p.url === url);
      if (page) filtered.push(page);
    }

    return filtered.length > 0 ? filtered : pages.slice(0, 8);
  } catch (error) {
    log(`Error filtering pages: ${error}. Using first 8.`);
    return pages.slice(0, 8);
  }
}

async function combineWorkflowFiles(pageFiles: { filename: string; content: string }[]): Promise<{ filename: string; content: string }[]> {
  const workflowFiles = pageFiles.filter(p => p.filename.startsWith('workflows-'));
  if (workflowFiles.length <= 1) return pageFiles;

  log(`Combining ${workflowFiles.length} workflow files...`);

  const combinedContent = `# Workflows\n\n${workflowFiles.map(wf =>
    `## ${wf.filename.replace('workflows-', '').replace('.md', '')}\n\n${wf.content}`
  ).join('\n\n---\n\n')}`;

  const filtered = pageFiles.filter(p => !p.filename.startsWith('workflows-'));
  filtered.push({ filename: 'workflows.md', content: combinedContent });
  return filtered;
}

// ─── SKILL.MD GENERATION ──────────────────────────────────────────────────────

async function generateSkillMd(data: ScrapedData, baseUrl: string, mode: 'important' | 'all' = 'important'): Promise<{ mainSkill: string; pageFiles: { filename: string; content: string }[]; skillJson: object }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  log(`Generating markdown files for ${data.pages.length} pages (mode: ${mode})...`);

  let pagesToProcess: PageData[];
  if (mode === 'important') {
    pagesToProcess = await filterImportantPages(
      data.pages.filter(p => p.path !== '/' && !isLanguagePage(p.url) && !isIrrelevantPage(p.url))
    );
  } else {
    pagesToProcess = data.pages.filter(p => p.path !== '/' && !isLanguagePage(p.url) && !isIrrelevantPage(p.url)).slice(0, 50);
  }

  const pageFiles: { filename: string; content: string }[] = [];
  for (const page of pagesToProcess) {
    log(`Generating: ${page.filename}`);
    pageFiles.push({ filename: page.filename, content: generatePageMd(page) });
  }

  const combinedPageFiles = await combineWorkflowFiles(pageFiles);
  log(`Generated ${combinedPageFiles.length} page files`);

  // Build skill.json
  const skillJson = {
    name: data.domainId,
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    pages: ['skill.md', ...combinedPageFiles.map(p => p.filename)],
    homepage: data.url,
    stats: {
      pages_scraped: data.pagesScraped.length,
      page_files_generated: combinedPageFiles.length,
      confidence: data.pagesScraped.length > 10 ? 'high' : data.pagesScraped.length > 5 ? 'medium' : 'low'
    }
  };

  const hasCodeExamples = data.codeExamples.length > 0;
  const hasInstallCommands = data.installCommands.length > 0;
  const hasPageFiles = combinedPageFiles.length > 0;
  const hasListItems = data.listItems.length > 0;
  const hasTableData = data.tableData.length > 0;
  const hasApiEndpoints = data.apiEndpoints.length > 0;

  log('Generating main skill.md with enhanced prompt...');

  const pageUrlMap: Record<string, string> = {};
  combinedPageFiles.forEach(pf => {
    const page = pagesToProcess.find(p => p.filename === pf.filename);
    if (page) pageUrlMap[pf.filename] = page.url;
  });

  const HOSTED_URL = process.env.HOSTED_URL || 'https://agentic-websites.vercel.app/skill';

  const fileIndexTable = hasPageFiles ? `
## Files Available

| File | What It Covers | Website URL | Documentation |
|------|----------------|-------------|---------------|
| skill.md | This file — full overview | ${data.url} | ${HOSTED_URL}/${data.domainId}/skill.md |
${combinedPageFiles.map(p => {
    const websiteUrl = pageUrlMap[p.filename] || `${baseUrl}/${p.filename.replace('.md', '')}`;
    const fileSlug = p.filename.replace('.md', '');
    return `| ${p.filename} | Page documentation | ${websiteUrl} | ${HOSTED_URL}/${data.domainId}/${fileSlug} |`;
  }).join('\n')}

> **Agent:** Start here. Read this file first, then fetch specific pages as needed.
> Full file list: ${HOSTED_URL}/${data.domainId}/skill.json
` : '';

  // ─── BUILD THE ENHANCED PROMPT ──────────────────────────────────────

  // Build rich page summaries from all scraped pages
  const pageSummaries = pagesToProcess.slice(0, 10).map(p => {
    let summary = `### ${p.title} (${p.path})\n`;
    if (p.markdown && p.markdown.length > 100) {
      summary += p.markdown.slice(0, 800) + '\n';
    } else {
      summary += p.content.slice(0, 400) + '\n';
    }
    if (p.codeExamples.length > 0) {
      summary += `Code found: ${p.codeExamples.length} examples\n`;
      summary += `\`\`\`\n${p.codeExamples[0].slice(0, 300)}\n\`\`\`\n`;
    }
    if (p.apiEndpoints.length > 0) {
      summary += `Endpoints: ${p.apiEndpoints.join(', ')}\n`;
    }
    return summary;
  }).join('\n---\n');

  const mainPrompt = `Create a comprehensive, high-quality skill.md reference document for AI agents. This document should be the single source of truth an AI agent needs to fully understand and interact with this service.

═══════════════════════════════════════════════════
SCRAPED DATA FROM: ${data.url}
═══════════════════════════════════════════════════

BASIC INFO:
- URL: ${data.url}
- Title: ${data.title}  
- Meta Description: ${data.metaDescription || 'Not available'}
- Pages Successfully Scraped: ${data.pagesScraped.length}
- Total Content Extracted: ${data.mainContent.length + data.fullMarkdown.length} characters

HEADINGS FOUND (${data.headings.length}):
${data.headings.slice(0, 25).map(h => `  - ${h}`).join('\n') || '  None'}

FEATURES/CAPABILITIES EXTRACTED (${data.features.length}):
${data.features.slice(0, 12).map(f => `  - ${f}`).join('\n') || '  None'}

${hasListItems ? `KEY POINTS FROM PAGES (${data.listItems.length} items):
${data.listItems.slice(0, 25).map(item => `  - ${item}`).join('\n')}` : ''}

${hasTableData ? `STRUCTURED DATA (tables found):
${data.tableData.slice(0, 4).map((t, i) => `Table ${i + 1}:\n${t}`).join('\n\n')}` : ''}

${hasApiEndpoints ? `API ENDPOINTS DETECTED:
${data.apiEndpoints.slice(0, 15).map(ep => `  ${ep}`).join('\n')}` : ''}

${hasCodeExamples ? `CODE EXAMPLES (${data.codeExamples.length} found):
${data.codeExamples.slice(0, 5).map((code, i) => `Example ${i + 1}:\n\`\`\`\n${code.slice(0, 500)}\n\`\`\``).join('\n\n')}` : ''}

${hasInstallCommands ? `INSTALL COMMANDS:
${data.installCommands.map(cmd => `  ${cmd}`).join('\n')}` : ''}

LINKS TO IMPORTANT PAGES:
${data.links.slice(0, 12).map(l => `  - ${l.text}: ${l.href}`).join('\n') || '  None found'}

FULL CONTENT FROM KEY PAGES:
${data.fullMarkdown ? data.fullMarkdown.slice(0, 10000) : data.mainContent.slice(0, 6000)}

DETAILED PAGE-BY-PAGE BREAKDOWN:
${pageSummaries}

═══════════════════════════════════════════════════
OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════

1. Start with this EXACT frontmatter:
---
name: ${data.displayName}
version: "1.0.0"
description: ${data.metaDescription ? `"${data.metaDescription.replace(/"/g, "'")}"` : `"${data.title} - service at ${data.url}"`}
homepage: ${data.url}
generated: auto-scraped
confidence: ${data.mainContent.length > 2000 ? 'high' : data.mainContent.length > 500 ? 'medium' : 'low'}
metadata:
  tags: [${data.features.slice(0, 5).map(f => `"${f.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}"`).join(', ') || '"website", "service"'}]
  category: saas
---

${fileIndexTable}

2. Then write these sections (ONLY include sections where you have real data):

# ${data.displayName}

## Overview
A thorough 3-5 sentence description of what this service does, who it's for, and the core value proposition. Be specific about capabilities based on the scraped data. Do NOT be vague or generic.

## Core Capabilities
A detailed list of what this service can actually DO. Each item should be a specific, actionable capability, not marketing fluff. Group related capabilities if there are many.

## Authentication & Setup
How to get started: API keys, OAuth, tokens, environment setup, SDK installation. Include actual code snippets if found in the data. If install commands were found, include them here.

## API Reference
Document any API endpoints, methods, parameters, and response formats found. Use tables for clarity:
| Method | Endpoint | Description |
|--------|----------|-------------|

## Code Examples & Usage
Include ALL code examples found, properly formatted with language tags. Add context about what each example does.

## SDKs & Libraries
Language support, package names, install commands for different package managers.

## Common Workflows
Step-by-step guides for common tasks. Number the steps. Include code where relevant.

## Pricing & Plans
Pricing tiers, free tier limits, rate limits, quotas — whatever was found.

## Integration Guide
How to integrate with other tools, webhooks, event systems, third-party connections.

## Rate Limits & Constraints
Any throttling, quotas, file size limits, request limits documented.

## Error Handling
Error codes, error formats, retry strategies if found.

## Resources & Links
Homepage, docs, community, support channels, changelog — with actual URLs.

CRITICAL RULES:
- ONLY include sections where you have REAL data from the scrape. OMIT sections entirely if no data exists.
- NEVER write "Not found", "No data available", "Unknown", or any placeholder text.
- NEVER include empty sections or sections that just say "Visit the website for more info".
- Extract and INFER information from code examples (e.g., if a code example shows \`Authorization: Bearer\`, document Bearer token auth).
- Use tables extensively for structured info (endpoints, params, pricing, features).
- Include actual URLs from the scraped links.
- Code examples must have proper language tags (\`\`\`python, \`\`\`javascript, \`\`\`bash, etc.).
- Be comprehensive but factual. Write like technical documentation, not marketing copy.
- The output should be LONG and DETAILED — aim for at least 500 lines of useful content.
- End with: Last updated: ${new Date().toISOString().split('T')[0]}`;

  const systemPrompt = `You are an expert technical writer creating SKILL.md reference files for AI coding agents.

Your output will be used by AI agents (like GitHub Copilot, Cursor, Claude) to understand how to interact with web services. The quality of your documentation directly impacts how well these agents can help developers.

WRITING PRINCIPLES:
1. BE COMPREHENSIVE: Include every piece of useful information from the input. Don't summarize when you can include details.
2. BE STRUCTURED: Use markdown headers, tables, code blocks, and lists extensively. AI agents parse structure.
3. BE ACTIONABLE: Every section should help an agent DO something — authenticate, make API calls, handle errors, etc.
4. BE ACCURATE: Only write what the data supports. Infer logically from code examples (e.g., auth headers imply auth method), but never fabricate.
5. BE SPECIFIC: Include actual URLs, actual endpoint paths, actual parameter names, actual code. No placeholders.

FORMATTING:
- Use H2 (##) for major sections, H3 (###) for subsections
- Use fenced code blocks with language identifiers
- Use tables for any structured/comparative data
- Use bullet lists for features and capabilities
- Use numbered lists for sequential steps/workflows
- Bold important terms and parameter names
- Never use emojis

LENGTH: Produce detailed, comprehensive documentation. A good skill.md is typically 300-800 lines. Short outputs are a failure.`;

  const result = await callOpenRouter(mainPrompt, systemPrompt);
  const mainSkill = result.choices[0].message.content;

  log('Main skill.md generated successfully');

  return { mainSkill, pageFiles: combinedPageFiles, skillJson };
}

// ─── API ROUTE HANDLER ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  log('=== NEW REQUEST ===');

  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
    }

    const body = await request.json();
    const { url, mode } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (typeof url !== 'string') {
      return NextResponse.json({ error: 'URL must be a string' }, { status: 400 });
    }

    if (url.length > 2048) {
      return NextResponse.json({ error: 'URL too long (max 2048 characters)' }, { status: 400 });
    }

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return NextResponse.json({ error: 'URL must use http or https protocol' }, { status: 400 });
    }

    const generationMode: 'important' | 'all' = mode === 'all' ? 'all' : 'important';
    log(`Processing URL: ${url} (mode: ${generationMode})`);

    const scrapedData = await scrapeWebsite(url);
    const baseUrl = new URL(url).origin;
    const { mainSkill, pageFiles, skillJson } = await generateSkillMd(scrapedData, baseUrl, generationMode);

    const duration = Date.now() - startTime;
    log(`Completed in ${duration}ms`);
    log(`Generated: 1 main skill.md + ${pageFiles.length} page files + skill.json`);

    // Store in database
    try {
      await prisma.website.upsert({
        where: { domain: scrapedData.domainId },
        update: {
          url,
          skillMd: mainSkill,
          skillJson: skillJson as any,
          pageFiles: pageFiles as any,
          stats: {
            duration_ms: duration,
            title: scrapedData.title,
            pages_scraped: scrapedData.pagesScraped.length,
            page_files_generated: pageFiles.length,
            headings_count: scrapedData.headings.length,
            features_count: scrapedData.features.length,
            code_examples_count: scrapedData.codeExamples.length,
            install_commands_count: scrapedData.installCommands.length,
            api_endpoints_count: scrapedData.apiEndpoints.length,
            list_items_count: scrapedData.listItems.length,
            missing_info: scrapedData.missingInfo
          }
        },
        create: {
          domain: scrapedData.domainId,
          url,
          skillMd: mainSkill,
          skillJson: skillJson as any,
          pageFiles: pageFiles as any,
          stats: {
            duration_ms: duration,
            title: scrapedData.title,
            pages_scraped: scrapedData.pagesScraped.length,
            page_files_generated: pageFiles.length,
            headings_count: scrapedData.headings.length,
            features_count: scrapedData.features.length,
            code_examples_count: scrapedData.codeExamples.length,
            install_commands_count: scrapedData.installCommands.length,
            api_endpoints_count: scrapedData.apiEndpoints.length,
            list_items_count: scrapedData.listItems.length,
            missing_info: scrapedData.missingInfo
          }
        }
      });
      log(`Stored in database: ${scrapedData.displayName}`);
    } catch (dbError) {
      log(`Database error: ${dbError}`);
    }

    return NextResponse.json({
      success: true,
      data: {
        url,
        skill_md: mainSkill,
        page_files: pageFiles,
        skill_json: skillJson,
        stats: {
          duration_ms: duration,
          title: scrapedData.title,
          pages_scraped: scrapedData.pagesScraped.length,
          page_files_generated: pageFiles.length,
          headings_count: scrapedData.headings.length,
          features_count: scrapedData.features.length,
          code_examples_count: scrapedData.codeExamples.length,
          install_commands_count: scrapedData.installCommands.length,
          api_endpoints_count: scrapedData.apiEndpoints.length,
          list_items_count: scrapedData.listItems.length,
          missing_info: scrapedData.missingInfo
        }
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    log(`Error after ${duration}ms: ${error}`);
    return NextResponse.json({
      error: 'Failed to generate skill.md',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}