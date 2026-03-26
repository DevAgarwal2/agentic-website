import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { domain: rawDomain } = await params;
  const domain = rawDomain.replace(/\./g, '-');
  
  // Get color customization from query params
  const { searchParams } = new URL(request.url);
  const agentColor = searchParams.get('agentColor') || '#2563eb'; // Default blue
  const humanColor = searchParams.get('humanColor') || '#4b5563'; // Default gray
  const accentColor = searchParams.get('accentColor') || '#2563eb';

  try {
    const website = await prisma.website.findUnique({
      where: { domain },
    });

    if (!website) {
      const errorJs = generateErrorWidget(domain);
      return new NextResponse(errorJs, { 
        status: 200,
        headers: { 
          'Content-Type': 'application/javascript',
          ...corsHeaders
        }
      });
    }

    const skillJson = website.skillJson as any;
    const widgetHost = process.env.WIDGET_HOST || 'https://widget.agenticwebsite.io';
    const skillUrl = `${widgetHost}/api/skill/${domain}`;
    const siteUrl = website.url;
    const siteDomain = domain.replace(/-/g, '.');
    const siteName = skillJson?.name || siteDomain;
    const description = extractDescription(website.skillMd, siteName);

    const js = generateWidgetScript(skillUrl, siteUrl, siteDomain, siteName, description, {
      agentColor,
      humanColor,
      accentColor
    });

    return new NextResponse(js, {
      headers: { 
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        ...corsHeaders
      },
    });
  } catch (e) {
    console.error('Widget generation error:', e);
    const errorJs = generateServerErrorWidget();
    return new NextResponse(errorJs, { 
      status: 200,
      headers: { 
        'Content-Type': 'application/javascript',
        ...corsHeaders
      }
    });
  }
}

function extractDescription(skillMd: string, siteName: string): string {
  const descMatch = skillMd.match(/description:\s*(.+)/i);
  if (descMatch) return descMatch[1].trim();
  
  const overviewMatch = skillMd.match(/## Overview\s*\n\s*([^.]+\.)/);
  if (overviewMatch) return overviewMatch[1].trim();
  
  const introMatch = skillMd.match(/^# .+\n\n([^.]+\.)/);
  if (introMatch) return introMatch[1].trim();
  
  return `Add ${siteName} capabilities to your agent`;
}

interface ColorConfig {
  agentColor: string;
  humanColor: string;
  accentColor: string;
}

function generateWidgetScript(
  skillUrl: string, 
  siteUrl: string, 
  siteDomain: string,
  siteName: string,
  description: string,
  colors: ColorConfig
): string {
  const { agentColor, humanColor, accentColor } = colors;
  
  return `
(function() {
  'use strict';
  
  if (window.__agenticWidgetLoaded) return;
  window.__agenticWidgetLoaded = true;
  
  var skillUrl = '${skillUrl}';
  var siteDomain = '${siteDomain}';
  var siteName = '${siteName}';
  var description = '${description}';
  var agentColor = '${agentColor}';
  var humanColor = '${humanColor}';
  var accentColor = '${accentColor}';
  
  function initWidget() {
    try {
      if (!document.body) return;
      if (document.getElementById('agentic-cards')) return;
      
      var container = document.createElement('div');
      container.id = 'agentic-cards';
      container.style.cssText = 'display:flex;gap:24px;margin:24px 0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;max-width:1000px;flex-wrap:wrap;';
      
      // Agent Card - Cal.com Style
      var agentCard = document.createElement('div');
      agentCard.style.cssText = 'flex:1;min-width:360px;background:#ffffff;border-radius:16px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -1px rgba(0,0,0,0.06);border:2px solid ' + agentColor + ';overflow:hidden;';
      agentCard.innerHTML = [
        '<div style="padding:28px;">',
          // Header
          '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">',
            '<span style="font-size:32px;">🤖</span>',
            '<h3 style="margin:0;font-size:22px;font-weight:700;color:#1a1a1a;letter-spacing:-0.02em;">I\'m an Agent</h3>',
          '</div>',
          
          // Title - Build a skill
          '<div style="margin-bottom:20px;">',
            '<p style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#1a1a1a;">Build a ' + siteName + ' skill</p>',
            '<p style="margin:0;font-size:14px;color:#6b7280;line-height:1.5;">Copy this to create a ' + siteName + ' skill for your agent.</p>',
          '</div>',
          
          // Description box with accent
          '<div style="background:#f8fafc;border-left:4px solid ' + accentColor + ';border-radius:0 10px 10px 0;padding:16px;margin-bottom:24px;">',
            '<p style="margin:0;font-size:14px;color:#3d3d3d;line-height:1.6;">' + description + '</p>',
          '</div>',
          
          // Skill URL
          '<div style="margin-bottom:10px;">',
            '<p style="margin:0 0 8px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Skill URL</p>',
            '<code style="display:block;font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;font-size:13px;color:#1a1a1a;background:#f1f5f9;padding:12px 14px;border-radius:8px;word-break:break-all;border:1px solid #e2e8f0;">' + skillUrl + '</code>',
          '</div>',
          
          // CTA Button
          '<a href="' + skillUrl + '" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;gap:8px;background:' + accentColor + ';color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:600;transition:all 0.2s;margin-top:20px;" onmouseover="this.style.opacity=\'0.9\'" onmouseout="this.style.opacity=\'1\'">',
            'Read skill.md',
            '<span style="font-size:20px;line-height:1;">→</span>',
          '</a>',
        '</div>',
      ].join('');
      
      // Human Card - Moltbook Style
      var humanCard = document.createElement('div');
      humanCard.style.cssText = 'flex:1;min-width:360px;background:#ffffff;border-radius:16px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -1px rgba(0,0,0,0.06);border:1px solid rgba(26,26,26,0.1);overflow:hidden;';
      humanCard.innerHTML = [
        '<div style="padding:28px;">',
          // Header
          '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">',
            '<span style="font-size:32px;">👤</span>',
            '<h3 style="margin:0;font-size:22px;font-weight:700;color:#1a1a1a;letter-spacing:-0.02em;">I\'m a Human</h3>',
          '</div>',
          
          // Title - Send your agent
          '<div style="margin-bottom:20px;">',
            '<p style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#1a1a1a;">Send Your AI Agent to ' + siteName + '</p>',
            '<p style="margin:0;font-size:14px;color:#6b7280;line-height:1.5;">Read <a href="' + skillUrl + '" target="_blank" style="color:' + accentColor + ';text-decoration:none;font-weight:500;">' + skillUrl + '</a> and follow the instructions to join ' + siteName + '</p>',
          '</div>',
          
          // Steps
          '<div style="margin-bottom:24px;">',
            '<div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:16px;">',
              '<div style="width:32px;height:32px;background:' + humanColor + ';color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;">1</div>',
              '<p style="margin:0;font-size:15px;color:#3d3d3d;padding-top:6px;">Send this to your agent</p>',
            '</div>',
            '<div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:16px;">',
              '<div style="width:32px;height:32px;background:' + humanColor + ';color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;">2</div>',
              '<p style="margin:0;font-size:15px;color:#3d3d3d;padding-top:6px;">They sign up & send you a claim link</p>',
            '</div>',
            '<div style="display:flex;align-items:flex-start;gap:14px;">',
              '<div style="width:32px;height:32px;background:' + humanColor + ';color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;">3</div>',
              '<p style="margin:0;font-size:15px;color:#3d3d3d;padding-top:6px;">Tweet to verify ownership</p>',
            '</div>',
          '</div>',
          
          // Copy Button
          '<button class="aw-copy-btn" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:transparent;color:#1a1a1a;border:2px solid #1a1a1a;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background=\'#1a1a1a\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'transparent\';this.style.color=\'#1a1a1a\'">',
            'Copy Link',
            '<span style="font-size:20px;line-height:1;">→</span>',
          '</button>',
        '</div>',
      ].join('');
      
      container.appendChild(agentCard);
      container.appendChild(humanCard);
      document.body.appendChild(container);
      
      // Copy button functionality
      var copyBtn = container.querySelector('.aw-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function() {
          var btn = this;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(skillUrl).then(function() {
              var originalHTML = btn.innerHTML;
              btn.innerHTML = 'Copied! <span style="font-size:20px;line-height:1;">✓</span>';
              btn.style.background = '#1a1a1a';
              btn.style.color = '#fff';
              setTimeout(function() {
                btn.innerHTML = originalHTML;
                btn.style.background = 'transparent';
                btn.style.color = '#1a1a1a';
              }, 2000);
            });
          }
        });
      }
      
      console.log('✅ Agentic Widget loaded for ' + siteName);
    } catch (err) {
      console.error('Widget error:', err);
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
  `.trim();
}

function generateErrorWidget(domain: string): string {
  return `
(function() {
  'use strict';
  if (window.__agenticWidgetLoaded) return;
  window.__agenticWidgetLoaded = true;
  
  function init() {
    if (!document.body) return;
    var div = document.createElement('div');
    div.style.cssText = 'background:#fef2f2;border:2px solid #fecaca;border-radius:12px;padding:24px;margin:20px 0;max-width:600px;font-family:system-ui;';
    div.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;"><span style="font-size:24px;">⚠️</span><span style="font-size:16px;font-weight:700;color:#991b1b;">Widget Not Found</span></div><p style="margin:0;color:#7f1d1d;">Domain <code style="background:#fee2e2;padding:2px 6px;border-radius:4px;">${domain}</code> not registered.</p>';
    document.body.appendChild(div);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
  `.trim();
}

function generateServerErrorWidget(): string {
  return `
(function() {
  'use strict';
  if (window.__agenticWidgetLoaded) return;
  window.__agenticWidgetLoaded = true;
  
  function init() {
    if (!document.body) return;
    var div = document.createElement('div');
    div.style.cssText = 'background:#fef2f2;border:2px solid #fecaca;border-radius:12px;padding:24px;margin:20px 0;max-width:600px;font-family:system-ui;';
    div.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;"><span style="font-size:24px;">❌</span><span style="font-size:16px;font-weight:700;color:#991b1b;">Server Error</span></div><p style="margin:0;color:#7f1d1d;">Something went wrong. Please try again later.</p>';
    document.body.appendChild(div);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
  `.trim();
}
