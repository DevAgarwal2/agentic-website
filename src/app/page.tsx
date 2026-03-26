'use client';

import { useState, useEffect } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Globe, Code2, Zap, CheckCircle, Copy, Check,
  Menu, X, ChevronRight, Bot, User, ArrowRight,
  Shield, BarChart3, Terminal, Loader2,
} from 'lucide-react';

interface PageFile { filename: string; content: string; }
interface ScrapedStats {
  duration_ms: number; pages_scraped: number;
  page_files_generated: number; missing_info: string[];
}
interface ResultData {
  url: string; skill_md: string; page_files: PageFile[];
  skill_json: any; stats: ScrapedStats;
}

const PRESET_COLORS = [
  { name: 'Stone', agent: '#1c1917', human: '#a8a29e', accent: '#1c1917' },
  { name: 'Blue', agent: '#1e40af', human: '#93c5fd', accent: '#1e40af' },
  { name: 'Orange', agent: '#c2410c', human: '#fdba74', accent: '#c2410c' },
  { name: 'Green', agent: '#166534', human: '#86efac', accent: '#166534' },
];

const FEATURES = [
  { icon: Zap, title: 'Instant setup', desc: 'Paste a URL, get a widget. No servers, no config.' },
  { icon: Bot, title: 'Agent-compatible', desc: 'Structured skill.md that every AI agent can read.' },
  { icon: Globe, title: 'Works everywhere', desc: 'SaaS, e-commerce, docs, marketing — any site.' },
  { icon: Shield, title: 'Private by design', desc: 'Only public content is scraped. Backend untouched.' },
  { icon: BarChart3, title: 'Scrape analytics', desc: 'See exactly what pages were scanned.' },
  { icon: Code2, title: 'One script tag', desc: 'One line of HTML and you\'re live.' },
];

const LOADING_STEPS = [
  { label: 'Connecting to site…', duration: 2000 },
  { label: 'Crawling pages…', duration: 4000 },
  { label: 'Analyzing content…', duration: 3000 },
  { label: 'Building skill.md…', duration: 2000 },
  { label: 'Generating widget…', duration: 1500 },
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'important' | 'all'>('important');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);
  const [agentColor, setAgentColor] = useState('#1c1917');
  const [humanColor, setHumanColor] = useState('#a8a29e');
  const [accentColor, setAccentColor] = useState('#1c1917');
  const [mobileOpen, setMobileOpen] = useState(false);

  // Animate loading steps
  useEffect(() => {
    if (!loading) { setLoadingStep(0); return; }
    let stepIdx = 0;
    const advance = () => {
      if (stepIdx < LOADING_STEPS.length - 1) {
        stepIdx++;
        setLoadingStep(stepIdx);
        setTimeout(advance, LOADING_STEPS[stepIdx].duration);
      }
    };
    setTimeout(advance, LOADING_STEPS[0].duration);
  }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true); setError(null); setResult(null); setStep(1); setLoadingStep(0);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');
      setResult(data.data);
      setDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const getDomain = () => {
    if (!result) return 'your-site.com';
    try { return new URL(result.url).hostname.replace(/^www\./, ''); }
    catch { return 'your-site.com'; }
  };
  const getSkillDomain = () => getDomain().replace(/\./g, '-');
  const widgetHost = process.env.NEXT_PUBLIC_WIDGET_HOST || 'https://agentic-websites.vercel.app';

  const getScriptTag = () =>
    `<script src="${widgetHost}/widget/${getSkillDomain()}?agentColor=${encodeURIComponent(agentColor)}&humanColor=${encodeURIComponent(humanColor)}&accentColor=${encodeURIComponent(accentColor)}"></script>`;

  const copyScript = () => {
    navigator.clipboard.writeText(getScriptTag());
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const copyCurl = () => {
    navigator.clipboard.writeText(`curl ${widgetHost}/skill/${getSkillDomain()}/skill.md`);
    setCurlCopied(true); setTimeout(() => setCurlCopied(false), 2000);
  };
  const applyPreset = (p: typeof PRESET_COLORS[0]) => {
    setAgentColor(p.agent); setHumanColor(p.human); setAccentColor(p.accent);
  };

  return (
    <div className="min-h-screen bg-background">

      {/* ─── NAV ─────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between">
            <a href="/" className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground">
                <span className="text-[11px] font-bold text-background">A</span>
              </div>
              <span className="text-sm font-semibold tracking-tight">Agentic Website</span>
            </a>

            <nav className="hidden md:flex items-center gap-1">
              <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
                <a href="#how-it-works">How it works</a>
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
                <a href="#features">Features</a>
              </Button>
              <div className="ml-3">
                <Button size="sm" asChild>
                  <a href="#get-started">Try it <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></a>
                </Button>
              </div>
            </nav>

            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t bg-background px-4 py-3 flex flex-col gap-1">
            <Button variant="ghost" size="sm" className="justify-start" asChild>
              <a href="#how-it-works" onClick={() => setMobileOpen(false)}>How it works</a>
            </Button>
            <Button variant="ghost" size="sm" className="justify-start" asChild>
              <a href="#features" onClick={() => setMobileOpen(false)}>Features</a>
            </Button>
            <Separator className="my-2" />
            <Button size="sm" asChild>
              <a href="#get-started" onClick={() => setMobileOpen(false)}>Try it</a>
            </Button>
          </div>
        )}
      </header>

      <main>

        {/* ─── HERO ──────────────────────────────────── */}
        <section id="get-started" className="relative overflow-hidden">
          <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-20 sm:py-28 lg:py-32">

            <div className="max-w-2xl mx-auto text-center mb-12">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-5">
                Make your website
                <br />
                <span className="text-muted-foreground">agent-ready.</span>
              </h1>
              <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-lg mx-auto">
                Paste your URL. We generate a skill.md and a widget so any AI agent
                can understand and interact with your site.
              </p>
            </div>

            {/* Form */}
            <div className="max-w-xl mx-auto mb-10">
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://your-website.com"
                    disabled={loading}
                    className="h-11 flex-1 font-mono text-sm bg-white border-stone-300 shadow-sm placeholder:text-stone-400"
                  />
                  <Button type="submit" disabled={loading || !url} className="h-11 shrink-0 px-6 shadow-sm">
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Generating…
                      </span>
                    ) : (
                      <>Generate <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></>
                    )}
                  </Button>
                </div>

                {/* Mode toggle */}
                <div className="flex items-center justify-center gap-3">
                  <span className="text-xs text-muted-foreground">Scan:</span>
                  <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5">
                    {(['important', 'all'] as const).map(m => (
                      <button
                        key={m} type="button" onClick={() => setMode(m)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${mode === m
                          ? 'bg-white text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        {m === 'important' ? 'Smart — 8 pages' : 'All — up to 50'}
                      </button>
                    ))}
                  </div>
                </div>
              </form>

              {/* Loading progress */}
              {loading && (
                <div className="mt-4 rounded-xl border bg-white p-4 shadow-sm animate-fade-in-up">
                  <div className="space-y-2.5">
                    {LOADING_STEPS.map((s, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-5 h-5 flex items-center justify-center shrink-0">
                          {i < loadingStep ? (
                            <CheckCircle className="h-4 w-4 text-stone-600" />
                          ) : i === loadingStep ? (
                            <Loader2 className="h-4 w-4 text-foreground animate-spin" />
                          ) : (
                            <div className="h-2 w-2 rounded-full bg-stone-200" />
                          )}
                        </div>
                        <span className={`text-sm ${i <= loadingStep ? 'text-foreground' : 'text-stone-300'
                          }`}>
                          {s.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                  <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </div>

            {/* Widget Preview */}
            <div className="max-w-2xl mx-auto">
              <div className="rounded-2xl border bg-white overflow-hidden shadow-lg shadow-stone-200/50">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-stone-50/80">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-stone-300" />
                    <div className="w-2.5 h-2.5 rounded-full bg-stone-300" />
                    <div className="w-2.5 h-2.5 rounded-full bg-stone-300" />
                  </div>
                  <div className="flex-1 ml-2">
                    <div className="h-6 max-w-[180px] rounded-md bg-white border flex items-center px-2.5 gap-1.5">
                      <Globe className="h-2.5 w-2.5 text-stone-400" />
                      <span className="font-mono text-[10px] text-stone-400">your-site.com</span>
                    </div>
                  </div>
                </div>

                {/* Two cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">

                  {/* Agent card */}
                  <div className="rounded-xl border-2 border-foreground bg-white flex flex-col overflow-hidden">
                    <div className="bg-foreground px-4 py-3 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-sm font-semibold text-white">I&apos;m an Agent</span>
                    </div>
                    <div className="p-4 flex flex-col gap-3 flex-1">
                      <div className="rounded-lg bg-stone-50 border p-3">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1">
                          Capability
                        </p>
                        <code className="text-[11px] font-mono text-foreground break-all leading-relaxed">
                          curl {widgetHost}/skill/<wbr />your-site/skill.md
                        </code>
                      </div>
                      <div className="space-y-2">
                        {['Read skill.md', 'Follow the guide', 'Help users'].map((s, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <div className="w-5 h-5 rounded-full bg-foreground flex items-center justify-center text-background text-[10px] font-bold shrink-0">
                              {i + 1}
                            </div>
                            <span className="text-xs text-muted-foreground">{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="px-4 pb-4">
                      <button className="w-full py-2.5 rounded-lg text-xs font-semibold text-white bg-foreground hover:opacity-90 transition-opacity">
                        Read skill.md →
                      </button>
                    </div>
                  </div>

                  {/* Human card */}
                  <div className="rounded-xl border bg-white flex flex-col overflow-hidden">
                    <div className="bg-stone-50 px-4 py-3 flex items-center gap-2.5 border-b">
                      <div className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-semibold">I&apos;m a Human</span>
                    </div>
                    <div className="p-4 flex flex-col gap-3 flex-1">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Send your AI assistant here. It&apos;ll read skill.md and help you
                        set up AI compatibility for your site.
                      </p>
                      <div className="space-y-2">
                        {['Send this to your agent', 'They read & integrate', 'You get help instantly'].map((s, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <div className="w-5 h-5 rounded-full bg-stone-200 flex items-center justify-center text-muted-foreground text-[10px] font-bold shrink-0">
                              {i + 1}
                            </div>
                            <span className="text-xs text-muted-foreground">{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="px-4 pb-4">
                      <button className="w-full py-2.5 rounded-lg border-2 border-foreground text-xs font-semibold text-foreground hover:bg-foreground hover:text-background transition-all">
                        Copy link →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3">
                ↑ This is exactly how the widget appears on your site.
              </p>
            </div>

          </div>
        </section>

        {/* ─── HOW IT WORKS ──────────────────────────── */}
        <section id="how-it-works" className="border-y bg-white">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-20 sm:py-24">
            <div className="mb-12">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e8590c] mb-3">How it works</p>
              <h2 className="text-3xl font-bold tracking-tight">Three steps, sixty seconds.</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
              {[
                { n: '01', icon: Globe, t: 'Enter your URL', d: 'Paste any public website URL. We crawl and analyze your pages automatically.' },
                { n: '02', icon: Terminal, t: 'Generate skill.md', d: 'We build a machine-readable doc describing your product, features, and API for agents.' },
                { n: '03', icon: Code2, t: 'Add one script tag', d: 'Copy one line of HTML. AI agents can now discover and interact with your site.' },
              ].map(({ n, t, d, icon: Icon }, i) => (
                <div key={n} className={`p-8 ${i < 2 ? 'md:border-r' : ''}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <span className="text-xs font-mono text-stone-400">{n}</span>
                  </div>
                  <h3 className="text-base font-semibold mb-2">{t}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FEATURES ──────────────────────────────── */}
        <section id="features" className="border-b">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-20 sm:py-24">
            <div className="mb-12">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e8590c] mb-3">Features</p>
              <h2 className="text-3xl font-bold tracking-tight">Everything you need.</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden border">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="bg-white p-6 hover:bg-stone-50/80 transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center mb-4 group-hover:bg-stone-200 transition-colors">
                    <Icon className="h-4 w-4 text-foreground" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1.5">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA ───────────────────────────────────── */}
        <section className="bg-foreground">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-16">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
              <div>
                <h2 className="text-2xl font-bold text-background mb-1.5">Ready to go agent-ready?</h2>
                <p className="text-background/40 text-sm">Takes sixty seconds. Free.</p>
              </div>
              <Button variant="secondary" className="shrink-0" asChild>
                <a href="#get-started">Try it now <ArrowRight className="ml-1.5 h-4 w-4" /></a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ─── FOOTER ──────────────────────────────────── */}
      <footer className="border-t bg-stone-50/50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground">
                <span className="text-[10px] font-bold text-background">A</span>
              </div>
              <span className="text-sm font-medium">Agentic Website</span>
            </div>
            <p className="text-xs text-muted-foreground">© 2025 Agentic Website</p>
          </div>
        </div>
      </footer>

      {/* ─── DIALOG ──────────────────────────────────── */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
          <Dialog.Popup className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-xl border shadow-2xl overflow-hidden">
              {result && (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b bg-stone-50 flex-shrink-0">
                    <div className="flex items-center gap-3">
                      <Dialog.Title className="text-sm font-semibold">
                        {step === 1 && '✓ Widget ready'}
                        {step === 2 && 'Customize colors'}
                        {step === 3 && 'Install widget'}
                      </Dialog.Title>
                      <div className="flex gap-1">
                        {[1, 2, 3].map(s => (
                          <div key={s} className={`h-1 rounded-full transition-all duration-300 ${step === s ? 'w-6 bg-foreground' : step > s ? 'w-3 bg-foreground/40' : 'w-3 bg-stone-200'
                            }`} />
                        ))}
                      </div>
                    </div>
                    <Dialog.Close className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <X className="h-4 w-4" />
                    </Dialog.Close>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-5">

                    {/* S1: preview */}
                    {step === 1 && (
                      <>
                        {/* Success banner */}
                        <div className="rounded-xl border bg-stone-50 p-4">
                          <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center">
                              <Check className="h-4 w-4 text-background" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">Widget generated successfully</p>
                              <p className="text-xs text-muted-foreground">for {getDomain()}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border px-2.5 py-1 text-xs font-medium text-foreground">
                              <Globe className="h-3 w-3 text-muted-foreground" />
                              {result.stats.pages_scraped} pages
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border px-2.5 py-1 text-xs font-medium text-foreground">
                              <Zap className="h-3 w-3 text-muted-foreground" />
                              {result.stats.duration_ms}ms
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border px-2.5 py-1 text-xs font-medium text-foreground">
                              <Code2 className="h-3 w-3 text-muted-foreground" />
                              {result.stats.page_files_generated} files
                            </span>
                          </div>
                        </div>

                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Widget preview</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Agent card */}
                          <div className="rounded-2xl overflow-hidden shadow-md border" style={{ borderColor: agentColor }}>
                            <div className="px-5 py-4 flex items-center gap-3" style={{ backgroundColor: agentColor }}>
                              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                                <Bot className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <span className="text-sm font-bold text-white block">I&apos;m an Agent</span>
                                <span className="text-[11px] text-white/60">AI assistant</span>
                              </div>
                            </div>
                            <div className="bg-white p-4 space-y-3">
                              <div className="rounded-xl bg-stone-50 border p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Add this capability</p>
                                <code className="text-[11px] font-mono text-foreground break-all leading-relaxed block">
                                  curl {widgetHost}/skill/{getSkillDomain()}/skill.md
                                </code>
                              </div>
                              <div className="space-y-2">
                                {['Read skill.md', 'Follow the guide', 'Help users'].map((s, i) => (
                                  <div key={i} className="flex items-center gap-2.5">
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: agentColor }}>
                                      {i + 1}
                                    </div>
                                    <span className="text-xs text-muted-foreground">{s}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="bg-white px-4 pb-4">
                              <button
                                onClick={copyCurl}
                                className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                                style={{ backgroundColor: agentColor }}
                              >
                                {curlCopied ? <><Check className="h-4 w-4" /> Copied!</> : <>Copy curl command <ArrowRight className="h-3.5 w-3.5" /></>}
                              </button>
                            </div>
                          </div>

                          {/* Human card */}
                          <div className="rounded-2xl overflow-hidden shadow-md border">
                            <div className="px-5 py-4 flex items-center gap-3 bg-stone-100 border-b">
                              <div className="w-9 h-9 rounded-xl bg-white border flex items-center justify-center">
                                <User className="h-5 w-5 text-muted-foreground" />
                              </div>
                              <div>
                                <span className="text-sm font-bold text-foreground block">I&apos;m a Human</span>
                                <span className="text-[11px] text-muted-foreground">Site visitor</span>
                              </div>
                            </div>
                            <div className="bg-white p-4 space-y-3">
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                Send your AI assistant to{' '}
                                <span className="font-medium text-foreground">{getDomain()}</span>.
                                It&apos;ll read skill.md and help you with this service.
                              </p>
                              <div className="space-y-2">
                                {['Send this to your agent', 'They read & integrate', 'You get help instantly'].map((s, i) => (
                                  <div key={i} className="flex items-center gap-2.5">
                                    <div className="w-5 h-5 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-[10px] font-bold shrink-0">
                                      {i + 1}
                                    </div>
                                    <span className="text-xs text-muted-foreground">{s}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="bg-white px-4 pb-4">
                              <button className="w-full py-3 rounded-xl border-2 border-foreground text-sm font-semibold text-foreground hover:bg-foreground hover:text-background transition-all">
                                Copy link →
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end pt-1">
                          <Button size="sm" onClick={() => setStep(2)}>
                            Customize colors <ChevronRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}

                    {/* S2: colors */}
                    {step === 2 && (
                      <>
                        <p className="text-sm text-muted-foreground">Pick a preset or customize to match your brand.</p>

                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2.5">Presets</p>
                          <div className="flex flex-wrap gap-2">
                            {PRESET_COLORS.map(p => (
                              <button
                                key={p.name} onClick={() => applyPreset(p)}
                                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-stone-50 transition-colors"
                              >
                                <span className="flex gap-1">
                                  <span className="w-3.5 h-3.5 rounded-full border" style={{ background: p.agent }} />
                                  <span className="w-3.5 h-3.5 rounded-full border" style={{ background: p.human }} />
                                </span>
                                {p.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {[
                            { label: 'Agent card', val: agentColor, set: setAgentColor },
                            { label: 'Human badge', val: humanColor, set: setHumanColor },
                            { label: 'Button', val: accentColor, set: setAccentColor },
                          ].map(({ label, val, set }) => (
                            <div key={label}>
                              <label className="text-xs font-medium text-muted-foreground block mb-2">{label}</label>
                              <div className="flex items-center gap-2">
                                <input type="color" value={val} onChange={e => set(e.target.value)}
                                  className="h-8 w-8 rounded border cursor-pointer p-0.5 bg-white" />
                                <Input type="text" value={val} onChange={e => set(e.target.value)}
                                  className="flex-1 font-mono text-xs h-8 min-w-0" />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between">
                          <Button variant="outline" size="sm" onClick={() => setStep(1)}>Back</Button>
                          <Button size="sm" onClick={() => setStep(3)}>
                            Get install code <ChevronRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}

                    {/* S3: install */}
                    {step === 3 && (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Add this before <code className="font-mono text-xs bg-stone-100 px-1.5 py-0.5 rounded">&lt;/body&gt;</code> in your HTML.
                        </p>

                        <div className="rounded-xl border overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-stone-50">
                            <div className="flex items-center gap-2">
                              <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">HTML</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={copyScript} className="h-7 text-xs">
                              {copied
                                ? <><Check className="h-3 w-3 mr-1" />Copied</>
                                : <><Copy className="h-3 w-3 mr-1" />Copy</>}
                            </Button>
                          </div>
                          <div className="p-4 bg-white">
                            <code className="text-xs font-mono text-foreground break-all leading-relaxed">
                              {getScriptTag()}
                            </code>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {[
                            { n: '1', t: 'Copy the code', d: 'Grab your personalized script tag.' },
                            { n: '2', t: 'Paste into your page', d: 'Before </body> — any CMS, framework, or plain HTML.' },
                            { n: '3', t: "You're live", d: 'AI agents can now read your skill.md and interact with your site.' },
                          ].map(({ n, t, d }) => (
                            <div key={n} className="flex gap-3 items-start">
                              <div className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                {n}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{t}</p>
                                <p className="text-xs text-muted-foreground">{d}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between">
                          <Button variant="outline" size="sm" onClick={() => setStep(2)}>Back</Button>
                          <Button size="sm" onClick={() => setDialogOpen(false)}>
                            <Check className="mr-1.5 h-3.5 w-3.5" /> Done
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
