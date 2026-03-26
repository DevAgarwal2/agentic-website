import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { prisma } from '@/lib/prisma';
import puppeteer from 'puppeteer';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const PRIMARY_MODEL = 'minimax/minimax-m2.5:free';
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';

interface PageData {
  url: string;
  title: string;
  content: string;
  codeExamples: string[];
  headings: string[];
  path: string;
  filename: string;
}

interface ScrapedData {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  mainContent: string;
  features: string[];
  links: { text: string; href: string }[];
  codeExamples: string[];
  installCommands: string[];
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

async function fetchPage(url: string): Promise<{ html: string; success: boolean }> {
  try {
    log(`Fetching: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(5000)
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

// Puppeteer fallback for JavaScript-heavy sites
async function fetchPageWithPuppeteer(url: string): Promise<{ html: string; success: boolean }> {
  let browser;
  try {
    log(`Fetching with Puppeteer: ${url}`);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
    
    // Wait a bit for any lazy-loaded content
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const html = await page.content();
    log(`Puppeteer success: ${url} (${html.length} bytes)`);
    
    await browser.close();
    return { html, success: true };
  } catch (error) {
    log(`Puppeteer error: ${url} - ${error}`);
    if (browser) await browser.close();
    return { html: '', success: false };
  }
}

// Smart fetch that tries cheerio first, then puppeteer
async function smartFetch(url: string): Promise<{ html: string; success: boolean }> {
  // Try cheerio first (fast)
  const cheerioResult = await fetchPage(url);
  if (cheerioResult.success && cheerioResult.html.length > 1000) {
    return cheerioResult;
  }
  
  // Fallback to puppeteer for JS-heavy sites
  log('Cheerio returned minimal content, trying Puppeteer...');
  const puppeteerResult = await fetchPageWithPuppeteer(url);
  if (puppeteerResult.success) {
    return puppeteerResult;
  }
  
  // Return cheerio result even if minimal
  return cheerioResult;
}

const LANGUAGE_CODES = ['zh', 'zht', 'ko', 'de', 'es', 'fr', 'it', 'da', 'ja', 'ru', 'pt', 'nl', 'pl', 'tr', 'ar', 'hi', 'no', 'br', 'th', 'sv', 'fi', 'cs', 'hu', 'ro', 'id', 'vi', 'ms', 'tl', 'bn', 'ur', 'fa', 'he', 'el', 'uk', 'bg', 'hr', 'sr', 'sk', 'sl', 'lt', 'lv', 'et', 'is', 'ga', 'mt'];

const SKIP_PATHS = [
  'brand', 'discord', 'legal', 'privacy', 'terms', 'careers', 'press', 'about',
  'blog', 'news', 'press-kit', 'media', 'jobs', 'career', 'hiring', 'team',
  'contact', 'support', 'help', 'faq', 'status', 'security', 'trust', 'gdpr',
  'cookies', 'cookie-policy', 'accessibility', 'sitemap'
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

function extractPageData(url: string, html: string): PageData {
  const $ = cheerio.load(html);
  const title = $('title').text().trim() || $('h1').first().text().trim() || 'Unknown';
  
  const paragraphs: string[] = [];
  $('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 20 && text.length < 500) {
      paragraphs.push(text);
    }
  });
  
  const headings: string[] = [];
  $('h1, h2, h3').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 200) headings.push(text);
  });
  
  const codeExamples: string[] = [];
  $('pre code, code[class*="language"], .code-block, [class*="code"]').each((_, el) => {
    const code = $(el).text().trim();
    if (code && code.length > 30 && code.length < 2000) {
      codeExamples.push(code);
    }
  });
  
  const { path, filename } = getPagePathAndFilename(url);
  
  return {
    url,
    title,
    content: paragraphs.slice(0, 10).join('\n\n'),
    codeExamples: codeExamples.slice(0, 3),
    headings: headings.slice(0, 10),
    path,
    filename
  };
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
      
      // Check if it's a sitemap index (contains other sitemaps)
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
        // Regular sitemap
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
      // Skip language and irrelevant pages during extraction
      if (!isLanguagePage(href) && !isIrrelevantPage(href)) {
        links.push(href);
      }
    }
  });
  
  return [...new Set(links)];
}

function generatePageMd(page: PageData): string {
  const hasCodeExamples = page.codeExamples.length > 0;
  const hasHeadings = page.headings.length > 0;
  const hasContent = page.content && page.content.length > 0;
  
  let md = `# ${page.title}\n\n`;
  
  md += `**URL:** ${page.url}\n\n`;
  
  md += `## Overview\n`;
  md += `This page contains information about ${page.title}.\n\n`;
  
  if (hasHeadings) {
    md += `## Page Sections\n\n`;
    page.headings.forEach(heading => {
      md += `- ${heading}\n`;
    });
    md += '\n';
  }
  
  if (hasContent) {
    md += `## Key Content\n\n`;
    md += page.content;
    md += '\n\n';
  }
  
  if (hasCodeExamples) {
    md += `## Code Examples\n\n`;
    page.codeExamples.forEach((code, i) => {
      md += `### Example ${i + 1}\n\n`;
      md += '```\n';
      md += code;
      md += '\n```\n\n';
    });
  }
  
  md += `---\n\n`;
  md += `**Metadata**\n`;
  md += `- Path: ${page.path}\n`;
  md += `- Scraped: ${new Date().toISOString()}\n`;
  
  return md;
}

function extractBrandName(hostname: string): string {
  // Remove www. prefix
  let name = hostname.replace(/^www\./, '');
  // Extract the main domain part (before TLD)
  const parts = name.split('.');
  if (parts.length >= 2) {
    // Return the second-to-last part (the actual brand name)
    // e.g., vibecon.com -> vibecon, mail.google.com -> google, acme-store.com -> acme-store
    name = parts[parts.length - 2];
  }
  return name;
}

function formatBrandName(name: string): string {
  // Convert acme-store to Acme Store, vibecon to Vibecon
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
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
    const failedUrls: string[] = []; // Track failed URLs separately
  
  const sitemapUrls = await getSitemapUrls(baseUrl);
  if (sitemapUrls.length > 0) {
    pagesToCrawl.push(...sitemapUrls);
    log(`Added ${sitemapUrls.length} URLs from sitemap`);
  }
  
  const robotsUrls = await getRobotsTxtUrls(baseUrl);
  if (robotsUrls.length > 0) {
    pagesToCrawl.push(...robotsUrls);
  }
  
  const { html: landingHtml, success: landingSuccess } = await smartFetch(url);
  
  if (!landingSuccess) {
    throw new Error(`Failed to fetch landing page: ${url}`);
  }
  
  const $ = cheerio.load(landingHtml);
  
  const title = $('title').text().trim() || $('h1').first().text().trim() || 'Unknown';
  const metaDescription = $('meta[name="description"]').attr('content') || 
                         $('meta[property="og:description"]').attr('content') || 
                         '';
  
  log(`Landing page title: ${title}`);
  
  const landingData = extractPageData(url, landingHtml);
  pagesData.push(landingData);
  pagesScraped.push(url);
  crawledUrls.add(url);
  
  const landingLinks = extractLinksFromPage(landingHtml, baseUrl);
  pagesToCrawl.push(...landingLinks);
  log(`Found ${landingLinks.length} internal links on landing page`);
  
  const uniqueUrls = [...new Set(pagesToCrawl)].filter(u => !crawledUrls.has(u) && !isLanguagePage(u) && !isIrrelevantPage(u));
  const MAX_PAGES = 50; // Generate up to 50 page files
  const urlsToCrawl = uniqueUrls.slice(0, MAX_PAGES);
  log(`Will crawl ${urlsToCrawl.length} pages (max ${MAX_PAGES}, language/irrelevant pages filtered)`);
  
  for (const pageUrl of urlsToCrawl) {
    if (crawledUrls.has(pageUrl)) continue;
    
    // Skip language pages
    if (isLanguagePage(pageUrl)) {
      log(`Skipping language page: ${pageUrl}`);
      continue;
    }
    
    // Skip irrelevant pages (brand, legal, etc.)
    if (isIrrelevantPage(pageUrl)) {
      log(`Skipping irrelevant page: ${pageUrl}`);
      continue;
    }
    
    crawledUrls.add(pageUrl);
    
    const { html, success } = await fetchPage(pageUrl);
    if (success && html) {
      const pageData = extractPageData(pageUrl, html);
      pagesData.push(pageData);
      pagesScraped.push(pageUrl);
      
      // Only discover more links if we haven't hit the limit
      if (pagesData.length < MAX_PAGES) {
        const moreLinks = extractLinksFromPage(html, baseUrl);
        for (const link of moreLinks) {
          if (!crawledUrls.has(link) && pagesToCrawl.length < MAX_PAGES && !isLanguagePage(link) && !isIrrelevantPage(link)) {
            pagesToCrawl.push(link);
          }
        }
      }
    } else {
      failedUrls.push(pageUrl);
    }
  }
  
  log(`Scraped ${pagesScraped.length} pages total, ${failedUrls.length} failed`);
  
  // Only add important missing info (not every 404)
  if (failedUrls.length > 0) {
    // Check if key pages are missing
    const keyPages = ['pricing', 'docs', 'api', 'features', 'integrate'];
    const missingKeyPages = keyPages.filter(keyword => 
      failedUrls.some(url => url.toLowerCase().includes(keyword))
    );
    
    if (missingKeyPages.length > 0) {
      missingInfo.push(`Key pages not accessible: ${missingKeyPages.join(', ')}`);
    }
  }
  
  // Filter to English pages only for data aggregation
  const englishPages = pagesData.filter(page => !isLanguagePage(page.url));
  
  const allHeadings: string[] = [];
  const allContent: string[] = [];
  const allCodeExamples: string[] = [];
  const allFeatures: string[] = [];
  const allLinks: { text: string; href: string }[] = [];
  
  englishPages.forEach(page => {
    allHeadings.push(...page.headings);
    allContent.push(page.content);
    allCodeExamples.push(...page.codeExamples);
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
  const allText = allContent.join(' ');
  
  // Detect npm/yarn/pnpm
  const npmMatches = allText.match(/npm install[\w\s@\-\/\.]+/gi);
  const yarnMatches = allText.match(/yarn add[\w\s@\-\/\.]+/gi);
  const pnpmMatches = allText.match(/pnpm add[\w\s@\-\/\.]+/gi);
  
  // Detect curl installs (common patterns)
  const curlMatches1 = allText.match(/curl[\s\-]+fsSL[\s\w\.\-\/:\?\&\=\|]+/gi);
  const curlMatches2 = allText.match(/curl[\s\-]+[LOoSs]+[\s\w\.\-\/:\?\&\=\|]+/gi);
  const curlMatches3 = allText.match(/curl[\s]+https?:\/\/[^\s]+/gi);
  const curlMatches = [...(curlMatches1 || []), ...(curlMatches2 || []), ...(curlMatches3 || [])];
  
  // Detect brew installs
  const brewMatches = allText.match(/brew install[\w\s@\-\/\.]+/gi);
  
  // Detect pip installs
  const pipMatches = allText.match(/pip(3)? install[\w\s@\-\/\.]+/gi);
  
  if (npmMatches) installCommands.push(...npmMatches.slice(0, 3));
  if (yarnMatches) installCommands.push(...yarnMatches.slice(0, 3));
  if (pnpmMatches) installCommands.push(...pnpmMatches.slice(0, 3));
  if (curlMatches) installCommands.push(...curlMatches.slice(0, 3));
  if (brewMatches) installCommands.push(...brewMatches.slice(0, 3));
  if (pipMatches) installCommands.push(...pipMatches.slice(0, 3));
  
  log(`Extracted ${allHeadings.length} headings, ${allCodeExamples.length} code examples, ${installCommands.length} install commands`);
  
  return {
    url,
    title,
    metaDescription,
    headings: [...new Set(allHeadings)].slice(0, 20),
    mainContent: allContent.join('\n\n').slice(0, 4000),
    features: [...new Set(allFeatures)].slice(0, 10),
    links: allLinks.slice(0, 10),
    codeExamples: [...new Set(allCodeExamples)].slice(0, 8),
    installCommands: [...new Set(installCommands)].slice(0, 3),
    pages: englishPages,
    pagesScraped: pagesScraped.filter(url => !isLanguagePage(url)),
    missingInfo,
    domainId,
    brandName,
    displayName
  };
}

async function callOpenRouter(prompt: string, systemContent: string): Promise<OpenRouterResponse> {
  // Try primary model first, fallback if rate limited
  try {
    log(`Trying primary model: ${PRIMARY_MODEL}`);
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://website-to-skill.dev',
        'X-Title': 'Website to Skill Generator'
      },
      body: JSON.stringify({
        model: PRIMARY_MODEL,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      })
    });
    
    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }
    
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }
    
    const result = await response.json();
    log('Primary model succeeded');
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === 'RATE_LIMIT') {
      log(`Primary model rate limited, trying fallback: ${FALLBACK_MODEL}`);
      
      const fallbackResponse = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://website-to-skill.dev',
          'X-Title': 'Website to Skill Generator'
        },
        body: JSON.stringify({
          model: FALLBACK_MODEL,
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3
        })
      });
      
      if (!fallbackResponse.ok) {
        throw new Error(`Fallback model error: ${fallbackResponse.status}`);
      }
      
      const result = await fallbackResponse.json();
      log('Fallback model succeeded');
      return result;
    }
    throw error;
  }
}

async function filterImportantPages(pages: PageData[]): Promise<PageData[]> {
  if (pages.length <= 8) return pages;
  
  log(`Filtering ${pages.length} pages to most important 8...`);
  
  // Prepare page info for LLM - just the facts, no bias
  const pageInfo = pages.map(p => ({
    url: p.url,
    title: p.title,
    path: p.path,
    content_preview: p.content.slice(0, 200),
    headings: p.headings.slice(0, 5)
  }));
  
  const filterPrompt = `You are an AI assistant analyzing website pages to determine which would be most valuable for another AI agent to understand and use the service.

Analyze these pages and select the 8 most important ones. Consider:
- Which pages contain actionable information for using the service?
- Which explain how things work?
- Which have the most substantive content vs marketing fluff?
- Avoid duplicate/similar content

Pages to analyze:
${JSON.stringify(pageInfo, null, 2)}

Return your response as a JSON array of exactly 8 URLs in order of importance:
["url1", "url2", "url3", "url4", "url5", "url6", "url7", "url8"]`;

  try {
    const result = await callOpenRouter(
      filterPrompt,
      'You analyze web pages and select the most important ones. Return only valid JSON array of URLs.'
    );
    
    const content = result.choices[0].message.content.trim();
    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }
    
    const selectedUrls = JSON.parse(jsonMatch[0]);
    log(`LLM selected ${selectedUrls.length} important pages`);
    
    // Filter pages to only include selected URLs, maintaining order
    const filtered: PageData[] = [];
    for (const url of selectedUrls) {
      const page = pages.find(p => p.url === url);
      if (page) {
        filtered.push(page);
      }
    }
    
    return filtered.length > 0 ? filtered : pages.slice(0, 8);
  } catch (error) {
    log(`Error filtering pages with LLM: ${error}. Using first 8 pages.`);
    return pages.slice(0, 8);
  }
}

async function combineWorkflowFiles(pageFiles: { filename: string; content: string }[]): Promise<{ filename: string; content: string }[]> {
  const workflowFiles = pageFiles.filter(p => p.filename.startsWith('workflows-'));
  if (workflowFiles.length <= 1) return pageFiles;
  
  log(`Combining ${workflowFiles.length} workflow files into one...`);
  
  // Combine all workflow content
  const combinedContent = `# Workflows

This document contains all available workflows for this service.

${workflowFiles.map(wf => `## ${wf.filename.replace('workflows-', '').replace('.md', '')}\n\n${wf.content}`).join('\n\n---\n\n')}`;
  
  // Remove individual workflow files and add combined one
  const filtered = pageFiles.filter(p => !p.filename.startsWith('workflows-'));
  filtered.push({
    filename: 'workflows.md',
    content: combinedContent
  });
  
  log('Combined workflow files into workflows.md');
  return filtered;
}

async function generateSkillMd(data: ScrapedData, baseUrl: string, mode: 'important' | 'all' = 'important'): Promise<{ mainSkill: string; pageFiles: { filename: string; content: string }[]; skillJson: object }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }
  
  log(`Generating markdown files for ${data.pages.length} pages (English only, mode: ${mode})...`);
  
  // Filter pages based on mode
  let pagesToProcess: PageData[];
  if (mode === 'important') {
    // Filter to only most important 8 pages using LLM
    pagesToProcess = await filterImportantPages(
      data.pages.filter(p => p.path !== '/' && !isLanguagePage(p.url) && !isIrrelevantPage(p.url))
    );
  } else {
    // Use all pages (up to 50)
    pagesToProcess = data.pages.filter(p => p.path !== '/' && !isLanguagePage(p.url) && !isIrrelevantPage(p.url)).slice(0, 50);
    log(`Using all ${pagesToProcess.length} pages (no LLM filtering)`);
  }
  
  const pageFiles: { filename: string; content: string }[] = [];
  
  for (const page of pagesToProcess) {
    log(`Generating: ${page.filename}`);
    const pageContent = generatePageMd(page);
    pageFiles.push({
      filename: page.filename,
      content: pageContent
    });
  }
  
  // Combine workflow subdirectory files
  const combinedPageFiles = await combineWorkflowFiles(pageFiles);
  
  log(`Generated ${combinedPageFiles.length} page files (from ${pagesToProcess.length} ${mode === 'important' ? 'important' : 'total'} pages)`);
  
  // Generate skill.json
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
  
  log('Generating main skill.md...');
  
  // Map page files to their original URLs for reference
  const pageUrlMap: Record<string, string> = {};
  combinedPageFiles.forEach(pf => {
    const page = pagesToProcess.find(p => p.filename === pf.filename);
    if (page) {
      pageUrlMap[pf.filename] = page.url;
    }
  });
  
  // TODO: Replace with your actual hosting URL
  const HOSTED_URL = process.env.HOSTED_URL || 'https://yourproduct.com/s';
  
  // Build file index table with hosted documentation URLs
  const fileIndexTable = hasPageFiles ? `
## Files Available

| File | What It Covers | Website URL | Documentation |
|------|----------------|-------------|---------------|
| skill.md | This file — full overview | ${data.url} | ${HOSTED_URL}/${data.domainId}/skill.md |
${combinedPageFiles.map(p => {
    const websiteUrl = pageUrlMap[p.filename] || `${baseUrl}/${p.filename.replace('.md', '')}`;
    return `| ${p.filename} | Page documentation | ${websiteUrl} | ${HOSTED_URL}/${data.domainId}/${p.filename} |`;
  }).join('\n')}

> **Agent:** Start here. Read this file first, then fetch specific pages as needed.
> Full file list: ${HOSTED_URL}/${data.domainId}/skill.json
` : '';

  const mainPrompt = `Create a skill.md file for AI agents based ONLY on the following input data.

INPUT DATA:
URL: ${data.url}
Title: ${data.title}
Meta Description: ${data.metaDescription}
Headings Found: ${data.headings.slice(0, 20).join(', ') || 'None'}
Main Content Preview: ${data.mainContent.slice(0, 1500)}
Features Extracted: ${data.features.slice(0, 10).join(', ') || 'None'}
Links Found: ${data.links.slice(0, 15).map(l => `${l.text}(${l.href})`).join(', ') || 'None'}
Pages Scraped: ${data.pagesScraped.join(', ')}
Total Content Length: ${data.mainContent.length} characters

${hasCodeExamples ? `Code Examples Found (${data.codeExamples.length}):\n${data.codeExamples.slice(0, 2).map((code, i) => `Example ${i + 1}:\n\`\`\`\n${code.slice(0, 300)}\n\`\`\``).join('\n\n')}` : 'No code examples found.'}

${hasInstallCommands ? `Install Commands Found:\n${data.installCommands.join('\n')}` : 'No install commands found.'}

${hasPageFiles ? `Additional Pages Documented:\n${combinedPageFiles.slice(0, 5).map(p => `- ${p.filename}: ${p.content.slice(0, 200)}...`).join('\n')}` : 'No additional pages documented.'}

MANDATORY OUTPUT RULES:
1. Start with this exact frontmatter:
---
name: ${data.displayName}
version: "1.0.0"
description: ${data.metaDescription ? `"${data.metaDescription}"` : `"${data.title} - service at ${data.url}"`}
homepage: ${data.url}
generated: auto-scraped
confidence: ${data.mainContent.length > 2000 ? 'high' : data.mainContent.length > 500 ? 'medium' : 'low'}
metadata:
  tags: [${data.features.slice(0, 5).map(f => `"${f.toLowerCase().replace(/[^a-z0-9]/g, '-')}"`).join(', ') || '"website", "service"'}]
  category: saas
---

${fileIndexTable}

2. Then include ONLY these sections (omit any with no data):

# ${data.title}

## Overview
Write 2-3 sentences describing what ${data.title} does based on the meta description and main content above. Focus on the value proposition. Example: "${data.title} provides ${data.features[0] || 'services'} for ${data.metaDescription ? 'users' : 'customers'}."

${data.headings.length > 0 ? `## Key Features
${data.headings.slice(0, 10).map(h => `- ${h}`).join('\n')}` : ''}

${data.features.length > 0 ? `## What You Can Do
${data.features.slice(0, 8).map(f => `- ${f}`).join('\n')}` : ''}

${hasCodeExamples ? `## Code Example
\`\`\`
${data.codeExamples[0].slice(0, 400)}
\`\`\`` : ''}

${hasInstallCommands ? `## Quick Setup
\`\`\`bash
${data.installCommands.join('\n')}
\`\`\`` : ''}

${data.links.length > 0 ? `## Important Links

| Page | URL |
|------|-----|
${data.links.filter(l => l.href && l.href.startsWith('http')).slice(0, 8).map(l => `| ${l.text || 'Page'} | ${l.href} |`).join('\n')}` : ''}

## Resources
- Homepage: ${data.url}
${data.pagesScraped.length > 1 ? data.pagesScraped.slice(1, 4).map(p => `- ${new URL(p).pathname || 'Page'}: ${p}`).join('\n') : ''}

Last updated: ${new Date().toISOString().split('T')[0]}`;

  // Try primary model first, fallback if rate limited
  let result;
  try {
    log(`Trying primary model: ${PRIMARY_MODEL}`);
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://website-to-skill.dev',
        'X-Title': 'Website to Skill Generator'
      },
      body: JSON.stringify({
        model: PRIMARY_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a technical documentation expert specializing in skill.md files for AI agents.

Your job is to create clear, actionable documentation that helps AI agents:
1. Understand what a service does
2. Know when to use it
3. Execute specific actions
4. Avoid common pitfalls

STYLE GUIDE:
- Use tables for structured data (actions, pricing, resources)
- Include step-by-step workflows
- Be specific about URLs and endpoints
- Never use marketing language or hype
- Never use emojis
- Always use factual, direct language
- Include "When to Use" and "Do Not Use" sections
- Document constraints and limitations honestly`
          },
          {
            role: 'user',
            content: mainPrompt
          }
        ],
        temperature: 0.3
      })
    });
    
    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }
    
    result = await response.json();
    log('Primary model succeeded');
  } catch (error) {
    if (error instanceof Error && error.message === 'RATE_LIMIT') {
      log(`Primary model rate limited, trying fallback: ${FALLBACK_MODEL}`);
      
      const fallbackResponse = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://website-to-skill.dev',
          'X-Title': 'Website to Skill Generator'
        },
        body: JSON.stringify({
          model: FALLBACK_MODEL,
          messages: [
            {
              role: 'system',
            content: `You are a technical documentation expert creating skill.md files for AI agents.

ABSOLUTE RULES - NEVER BREAK THESE:
1. ONLY write about information that EXISTS in the input data
2. NEVER say "Not found", "Unknown", "Insufficient", "No data", "Missing"
3. NEVER use negative language like "Do NOT", "Cannot", "Unable", "Failed"
4. NEVER include sections like "Do Not Use When", "Constraints", "Limitations"
5. NEVER write phrases like "No X documented" or "No information about Y"
6. ONLY include sections where you have actual content from the input
7. If you don't have data for a section, OMIT IT ENTIRELY - don't write "Not found"
8. Focus on CAPABILITIES and ACTIONS, not what's missing

EXAMPLES OF WHAT NOT TO WRITE:
❌ "No pricing information found"
❌ "No actions documented"
❌ "No use cases documented"
❌ "Do NOT use when..."
❌ "Not found. Insufficient data..."
❌ "No detailed information about features..."

EXAMPLES OF GOOD CONTENT:
✅ "Visit the homepage at [URL]"
✅ "Key features include: [list from data]"
✅ "Available pages: [table from links]"
✅ "This service provides [description from meta]"

OUTPUT STYLE:
- Use tables for structured data
- Include step-by-step workflows
- Be specific about URLs
- Never use marketing language
- Never use emojis
- Always use factual, positive language`
            },
            {
              role: 'user',
              content: mainPrompt
            }
          ],
          temperature: 0.3
        })
      });
      
      if (!fallbackResponse.ok) {
        const error = await fallbackResponse.text();
        throw new Error(`Fallback model error: ${fallbackResponse.status} - ${error}`);
      }
      
      result = await fallbackResponse.json();
      log('Fallback model succeeded');
    } else {
      throw error;
    }
  }
  
  const mainSkill = result.choices[0].message.content;
  
  log('Main skill.md generated successfully');
  
  return { mainSkill, pageFiles: combinedPageFiles, skillJson };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  log('=== NEW REQUEST ===');
  
  try {
    // Check body size
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
    }
    
    const body = await request.json();
    const { url, mode } = body;
    
    // Input validation
    if (!url) {
      log('Error: URL not provided');
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    
    if (typeof url !== 'string') {
      log('Error: URL must be a string');
      return NextResponse.json({ error: 'URL must be a string' }, { status: 400 });
    }
    
    if (url.length > 2048) {
      log('Error: URL too long');
      return NextResponse.json({ error: 'URL too long (max 2048 characters)' }, { status: 400 });
    }
    
    // Validate URL format
    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      log('Error: Invalid URL format');
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }
    
    // Validate protocol
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      log('Error: Invalid protocol');
      return NextResponse.json({ error: 'URL must use http or https protocol' }, { status: 400 });
    }
    
    // Validate mode
    const generationMode: 'important' | 'all' = mode === 'all' ? 'all' : 'important';
    
    log(`Processing URL: ${url} (mode: ${generationMode})`);
    
    const scrapedData = await scrapeWebsite(url);
    const baseUrl = new URL(url).origin;
    const { mainSkill, pageFiles, skillJson } = await generateSkillMd(scrapedData, baseUrl, generationMode);
    
    const duration = Date.now() - startTime;
    log(`Completed in ${duration}ms`);
    log(`Generated: 1 main skill.md + ${pageFiles.length} page files (from ${scrapedData.pages.length} total scraped) + skill.json`);
    
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
            missing_info: scrapedData.missingInfo
          }
        }
      });
      log(`Stored in database: ${scrapedData.displayName}`);
    } catch (dbError) {
      log(`Database error: ${dbError}`);
      // Continue even if DB fails
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