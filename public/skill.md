---
name: Agentic Website
version: "1.0.0"
description: "Transform any website into an AI-agent-ready service. Generate skill.md files that help AI agents understand, navigate, and interact with your site."
homepage: https://agentic-websites.vercel.app
generated: auto-scraped
confidence: high
metadata:
  tags: ["ai-agents", "skill.md", "agent-ready", "website-automation", "llm-tools"]
  category: developer-tools
---

## Files Available

| File | What It Covers | Website URL | Documentation |
|------|----------------|-------------|---------------|
| skill.md | This file — full overview | https://agentic-websites.vercel.app | https://agentic-websites.vercel.app/skill/agentic-websites-vercel-app/skill.md |

> **Agent:** Start here. Read this file first.
> Full file list: https://agentic-websites.vercel.app/skill/agentic-websites-vercel-app/skill.json

# Agentic Website - Make Any Site Agent-Ready

## Overview
Agentic Website transforms any website into an AI-agent-compatible service. By automatically analyzing site structure, content, and features, it generates comprehensive skill.md documentation that enables AI agents to understand, navigate, and interact with your business. Integration requires just a single script tag with zero configuration.

## What This Service Does

- **Website Analysis**: Automatically scrapes and analyzes any website to understand its structure, features, and capabilities
- **Skill Generation**: Creates skill.md files formatted for AI agent consumption
- **Widget Generation**: Provides embeddable widgets that sites can add with one script tag
- **API Access**: Offers clean REST API endpoints for programmatic access
- **Clean URLs**: Accessible via simple URLs like `/skill/domain/skill.md` and `/widget/domain`

## Key Features

- **Automatic Scraping**: Uses cheerio and puppeteer to handle both static and JavaScript-heavy sites
- **AI-Powered Analysis**: Leverages multiple LLM models (stepfun, nvidia nemotron, arcee-ai) to generate comprehensive documentation
- **Multi-Page Support**: Scrapes up to 50 pages and generates individual documentation files
- **Smart Filtering**: Automatically filters out language variants, legal pages, and irrelevant content
- **Widget System**: Generates customizable embeddable widgets for agent/human users
- **Database Storage**: Persists generated skills for fast retrieval
- **Rate Limiting**: Built-in security with request throttling

## How It Works

1. **Enter your URL** - Paste your website URL into the input field
2. **Automatic analysis** - The service scrapes your site and analyzes content using AI
3. **Generate skill.md** - Comprehensive documentation is created for AI agent consumption
4. **Add one line** - Copy the provided script tag to your site
5. **Done** - AI agents can now understand and interact with your service

## API Endpoints

### Generate Skill
```
POST /api/generate
Content-Type: application/json

{
  "url": "https://example.com",
  "mode": "important" // or "all" for up to 50 pages
}
```

### Access Skill
```
GET /skill/{domain}/skill.md
```

### Access Widget
```
GET /widget/{domain}
```

### Skill JSON
```
GET /skill/{domain}/skill.json
```

## Resources

- **Homepage**: https://agentic-websites.vercel.app
- **GitHub**: https://github.com/DevAgarwal2/agentic-website
- **Live Demo**: https://agentic-websites.vercel.app

## Technical Stack

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL with Prisma ORM
- **AI Models**: OpenRouter (stepfun, nvidia, arcee-ai)
- **Scraping**: cheerio + puppeteer
- **Deployment**: Vercel

## Integration Example

To make your site agent-ready, add this script tag:

```html
<script src="https://agentic-websites.vercel.app/widget/your-domain"></script>
```

This embeds dual cards showing:
- **Agent Card**: Instructions for AI agents on how to read your skill.md
- **Human Card**: Instructions for users on how to get AI help with your site

Last updated: 2026-03-26
