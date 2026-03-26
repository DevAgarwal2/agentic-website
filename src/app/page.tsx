'use client';

import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

interface PageFile {
  filename: string;
  content: string;
}

interface ScrapedStats {
  duration_ms: number;
  title: string;
  pages_scraped: number;
  page_files_generated: number;
  headings_count: number;
  features_count: number;
  code_examples_count: number;
  install_commands_count: number;
  missing_info: string[];
}

interface ResultData {
  url: string;
  skill_md: string;
  page_files: PageFile[];
  skill_json: any;
  stats: ScrapedStats;
}

const PRESET_COLORS = [
  { name: 'Blue', agent: '#2563eb', human: '#6b7280', accent: '#2563eb' },
  { name: 'Orange', agent: '#ea580c', human: '#737373', accent: '#ea580c' },
  { name: 'Purple', agent: '#7c3aed', human: '#6b7280', accent: '#7c3aed' },
  { name: 'Green', agent: '#059669', human: '#525252', accent: '#059669' },
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'important' | 'all'>('important');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [postGenStep, setPostGenStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const [agentColor, setAgentColor] = useState('#2563eb');
  const [humanColor, setHumanColor] = useState('#6b7280');
  const [accentColor, setAccentColor] = useState('#2563eb');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPostGenStep(1);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate');
      setResult(data.data);
      setDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getDomain = () => {
    if (!result) return 'agenticwebsite.io';
    try {
      return new URL(result.url).hostname.replace(/^www\./, '');
    } catch {
      return 'agenticwebsite.io';
    }
  };

  const getSkillDomain = () => getDomain().replace(/\./g, '-');

  const getScriptTag = () => {
    const domain = getSkillDomain();
    const host = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
      ? 'http://localhost:3000' : 'https://widget.agenticwebsite.io';
    return `<script src="${host}/widget/${domain}?agentColor=${encodeURIComponent(agentColor)}&humanColor=${encodeURIComponent(humanColor)}&accentColor=${encodeURIComponent(accentColor)}"></script>`;
  };

  const copyScript = () => {
    navigator.clipboard.writeText(getScriptTag());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const applyPreset = (preset: typeof PRESET_COLORS[0]) => {
    setAgentColor(preset.agent);
    setHumanColor(preset.human);
    setAccentColor(preset.accent);
  };

  const widgetHost = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' : 'https://widget.agenticwebsite.io';

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900 text-white font-bold text-lg">
                A
              </div>
              <span className="text-xl font-bold text-gray-900">Agentic Website</span>
            </div>
            <div className="flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900">Features</a>
              <a href="#how-it-works" className="text-sm font-medium text-gray-600 hover:text-gray-900">How it works</a>
              <a href="https://github.com" target="_blank" rel="noopener" className="text-sm font-medium text-gray-600 hover:text-gray-900">GitHub</a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center py-16 lg:py-24">
            {/* Left Column - Content */}
            <div className="max-w-xl">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.1] mb-6">
                Make your website
                <span className="block text-blue-600">agent-ready</span>
              </h1>
              <p className="text-lg sm:text-xl text-gray-600 mb-8 leading-relaxed">
                Transform any website into an AI-agent-compatible service. One script tag, zero configuration. Agents can now understand your business and help your customers.
              </p>
              
              {/* URL Input Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://your-website.com"
                      disabled={loading}
                      className="block w-full h-12 px-4 text-base text-gray-900 placeholder-gray-400 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !url}
                    className="h-12 px-8 text-base font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {loading ? 'Generating...' : 'Generate Widget'}
                  </button>
                </div>
                
                {error && (
                  <div className="rounded-md bg-red-50 p-3">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
                
                {/* Mode Selector */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                    <button
                      type="button"
                      onClick={() => setMode('important')}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                        mode === 'important' 
                          ? 'bg-white text-gray-900 shadow-sm' 
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Smart (8 pages)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('all')}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                        mode === 'all' 
                          ? 'bg-white text-gray-900 shadow-sm' 
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      All pages (50 max)
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Right Column - Preview */}
            <div className="relative">
              <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 lg:p-8">
                {/* Window Controls */}
                <div className="flex items-center justify-between mb-6">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Widget Preview</span>
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  </div>
                </div>

                {/* Preview Cards Container */}
                <div className="space-y-4">
                  {/* Agent Card */}
                  <div className="bg-white rounded-xl border-2 border-blue-500 shadow-sm overflow-hidden">
                    <div className="p-5">
                      {/* Card Header */}
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">🤖</span>
                        <h3 className="text-lg font-bold text-gray-900">I'm an Agent</h3>
                      </div>
                      
                      {/* Curl Command Box */}
                      <div className="bg-blue-50 rounded-lg p-4 mb-4 border-l-4 border-blue-500">
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">Add This Capability: Read this file</p>
                        <code className="block text-xs font-mono text-gray-800 bg-white rounded px-3 py-2 break-all">
                          curl {widgetHost}/skill/agentic-website/skill.md
                        </code>
                      </div>
                      
                      {/* Description */}
                      <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                        Add Agentic Website to your capabilities. Read skill.md for complete integration instructions.
                      </p>
                      
                      {/* Steps */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                          <span className="text-sm text-gray-700">Read skill.md</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2</div>
                          <span className="text-sm text-gray-700">Follow the integration guide</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">3</div>
                          <span className="text-sm text-gray-700">Start helping users</span>
                        </div>
                      </div>
                      
                      {/* CTA Button */}
                      <button className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                        Read skill.md Now →
                      </button>
                    </div>
                  </div>

                  {/* Human Card */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-5">
                      {/* Card Header */}
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">👤</span>
                        <h3 className="text-lg font-bold text-gray-900">I'm a Human</h3>
                      </div>
                      
                      {/* Description */}
                      <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                        Send your AI agent to Agentic Website so they can read the skill.md and help you with this service.
                      </p>
                      
                      {/* Steps */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-500 text-white flex items-center justify-center text-xs font-bold">1</div>
                          <span className="text-sm text-gray-700">Send this to your agent</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-500 text-white flex items-center justify-center text-xs font-bold">2</div>
                          <span className="text-sm text-gray-700">They read skill.md & integrate</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-500 text-white flex items-center justify-center text-xs font-bold">3</div>
                          <span className="text-sm text-gray-700">Start getting help</span>
                        </div>
                      </div>
                      
                      {/* CTA Button */}
                      <button className="w-full py-2.5 border-2 border-gray-900 text-gray-900 rounded-lg text-sm font-semibold hover:bg-gray-900 hover:text-white transition-colors">
                        Copy Link →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section id="features" className="py-20 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">How it works</h2>
            <p className="text-lg text-gray-600">Three simple steps to make your website accessible to AI agents</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center text-2xl font-bold text-white mx-auto mb-6">
                1
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Enter your URL</h3>
              <p className="text-gray-600 leading-relaxed">
                Paste your website URL. We automatically analyze your site structure, content, and features.
              </p>
            </div>
            
            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center text-2xl font-bold text-white mx-auto mb-6">
                2
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Generate skill.md</h3>
              <p className="text-gray-600 leading-relaxed">
                Our AI analyzes your site and creates comprehensive documentation that agents can understand.
              </p>
            </div>
            
            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center text-2xl font-bold text-white mx-auto mb-6">
                3
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Add one line</h3>
              <p className="text-gray-600 leading-relaxed">
                Copy the script tag to your site. Done. AI agents can now understand and interact with your service.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white font-bold">
                A
              </div>
              <span className="text-lg font-bold text-gray-900">Agentic Website</span>
            </div>
            <p className="text-sm text-gray-500">© 2025 Agentic Website. Make any site agent-ready.</p>
          </div>
        </div>
      </footer>

      {/* Dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Popup className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:inset-8 lg:inset-12">
            {result && (
              <>
                {/* Dialog Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gray-50">
                  <div className="flex items-center gap-4">
                    <Dialog.Title className="text-lg font-bold text-gray-900">
                      {postGenStep === 1 && 'Widget Generated!'}
                      {postGenStep === 2 && 'Customize Colors'}
                      {postGenStep === 3 && 'Install Widget'}
                    </Dialog.Title>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={`h-2 rounded-full transition-all ${
                            postGenStep === step ? 'bg-gray-900 w-6' : postGenStep > step ? 'bg-green-500 w-2' : 'bg-gray-300 w-2'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <Dialog.Close className="rounded-lg bg-white border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Close
                  </Dialog.Close>
                </div>

                {/* Dialog Content */}
                <div className="flex-1 overflow-auto p-6 lg:p-8">
                  {/* Step 1: Preview */}
                  {postGenStep === 1 && (
                    <div className="max-w-4xl mx-auto">
                      <div className="text-center mb-8">
                        <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-800 mb-4">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Successfully analyzed {result.stats.pages_scraped} pages in {result.stats.duration_ms}ms
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Your widget is ready</h3>
                        <p className="text-gray-600">Preview your widget below, then customize colors and install</p>
                      </div>

                      {/* Preview Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* Agent Card */}
                        <div className="bg-white rounded-xl border-2 shadow-sm overflow-hidden" style={{ borderColor: agentColor }}>
                          <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                              <span className="text-2xl">🤖</span>
                              <h4 className="text-lg font-bold text-gray-900">I'm an Agent</h4>
                            </div>
                            
                            <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: `${agentColor}10`, borderLeft: `4px solid ${agentColor}` }}>
                              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: agentColor }}>Add This Capability</p>
                              <code className="block text-xs font-mono text-gray-800 bg-white rounded px-3 py-2 break-all border" style={{ borderColor: `${agentColor}30` }}>
                                curl {widgetHost}/skill/{getSkillDomain()}/skill.md
                              </code>
                            </div>
                            
                            <p className="text-sm text-gray-600 mb-4">Add {getDomain()} to your capabilities. Read skill.md for integration instructions.</p>
                            
                            <button className="w-full py-2.5 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity" style={{ backgroundColor: accentColor }}>
                              Read skill.md Now →
                            </button>
                          </div>
                        </div>

                        {/* Human Card */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                          <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                              <span className="text-2xl">👤</span>
                              <h4 className="text-lg font-bold text-gray-900">I'm a Human</h4>
                            </div>
                            
                            <p className="text-sm text-gray-600 mb-4">Send your AI agent to {getDomain()} so they can read the skill.md and help you.</p>
                            
                            <button className="w-full py-2.5 border-2 border-gray-900 text-gray-900 rounded-lg text-sm font-semibold hover:bg-gray-900 hover:text-white transition-colors">
                              Copy Link →
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-center">
                        <button
                          onClick={() => setPostGenStep(2)}
                          className="px-8 py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
                        >
                          Next: Customize Colors →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Customize */}
                  {postGenStep === 2 && (
                    <div className="max-w-4xl mx-auto">
                      <div className="mb-8">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Choose your colors</h3>
                        <p className="text-gray-600">Select a preset or customize individual colors</p>
                      </div>

                      {/* Color Presets */}
                      <div className="mb-8">
                        <h4 className="text-sm font-semibold text-gray-700 mb-4">Quick Presets</h4>
                        <div className="flex flex-wrap gap-3">
                          {PRESET_COLORS.map((preset) => (
                            <button
                              key={preset.name}
                              onClick={() => applyPreset(preset)}
                              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors"
                            >
                              <div className="flex -space-x-1">
                                <div className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: preset.agent }} />
                                <div className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: preset.human }} />
                              </div>
                              <span className="text-sm font-semibold text-gray-700">{preset.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Colors */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Agent Card Color</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={agentColor}
                              onChange={(e) => setAgentColor(e.target.value)}
                              className="h-10 w-10 rounded-lg border border-gray-200 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={agentColor}
                              onChange={(e) => setAgentColor(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Human Steps Color</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={humanColor}
                              onChange={(e) => setHumanColor(e.target.value)}
                              className="h-10 w-10 rounded-lg border border-gray-200 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={humanColor}
                              onChange={(e) => setHumanColor(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Button Accent</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={accentColor}
                              onChange={(e) => setAccentColor(e.target.value)}
                              className="h-10 w-10 rounded-lg border border-gray-200 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={accentColor}
                              onChange={(e) => setAccentColor(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between">
                        <button
                          onClick={() => setPostGenStep(1)}
                          className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                        >
                          ← Back
                        </button>
                        <button
                          onClick={() => setPostGenStep(3)}
                          className="px-8 py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
                        >
                          Next: Get Code →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Install */}
                  {postGenStep === 3 && (
                    <div className="max-w-3xl mx-auto">
                      <div className="mb-8">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Install your widget</h3>
                        <p className="text-gray-600">Copy this script tag and paste it into your website's HTML</p>
                      </div>

                      {/* Script Tag */}
                      <div className="rounded-xl border border-gray-200 bg-gray-900 p-6 mb-8">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Script Tag</span>
                          <button
                            onClick={copyScript}
                            className="text-xs text-gray-400 hover:text-white transition-colors"
                          >
                            {copied ? '✓ Copied!' : 'Copy'}
                          </button>
                        </div>
                        <code className="block text-sm font-mono text-gray-300 break-all">
                          {getScriptTag()}
                        </code>
                      </div>

                      {/* Installation Steps */}
                      <div className="space-y-4 mb-8">
                        <div className="flex gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-sm">1</div>
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-1">Copy the script tag</h4>
                            <p className="text-sm text-gray-600">Click the copy button above to copy your unique widget code</p>
                          </div>
                        </div>

                        <div className="flex gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-sm">2</div>
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-1">Paste into your website</h4>
                            <p className="text-sm text-gray-600">Add it to your HTML, preferably just before the closing &lt;/body&gt; tag</p>
                          </div>
                        </div>

                        <div className="flex gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-sm">3</div>
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-1">Done!</h4>
                            <p className="text-sm text-gray-600">The widget will automatically appear. Agents can now read your skill.md</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between">
                        <button
                          onClick={() => setPostGenStep(2)}
                          className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                        >
                          ← Back
                        </button>
                        <button
                          onClick={() => setDialogOpen(false)}
                          className="px-8 py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
