import { useLocation, useNavigate } from 'react-router-dom';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Github, FileCode, Server, ListTree, Package, LayoutTemplate, 
  GitFork, GitCommitHorizontal, Calendar, Disc, AlertCircle,
  Activity, Network, ChevronDown, ChevronUp, Play, FolderOpen, Layers, Star
} from 'lucide-react';
import { CopyButton } from '../components/CopyButton';
import { FolderTree } from '../components/FolderTree';
import { LanguageChart } from '../components/LanguageChart';
import { LoadingState } from '../components/LoadingState';
import { MarkdownViewer } from '../components/MarkdownViewer';
import Chat from '../components/Chat';
import TabBar from '../components/TabBar';
import ImportantFiles from '../components/ImportantFiles';
import LandingAnalyzer from '../components/LandingAnalyzer';
import { useTabStore } from '../store/useTabStore';
import Logo from '../components/Logo';
import { theme as T } from '../lib/theme';
import { ArchitectureGraph } from '../components/ArchitectureGraph';
import { ShareModal } from '../components/ShareModal';
import { Share2 } from 'lucide-react';

import { fetchRepoDataWithRetry, normalizeError } from '../lib/api';

/* ═══════════════ COLLAPSIBLE ═══════════════ */
function CollapsibleSection({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="flex flex-col h-full">
      <div className={`relative overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[5000px]' : 'max-h-80'}`}>
        {children}
        {!isOpen && (
          <div
            className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
            style={{ background: `linear-gradient(to top, ${T.card}, transparent)` }}
          />
        )}
      </div>
      <div className="mt-4 flex justify-center">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 text-xs px-4 py-1.5 rounded-lg transition-colors duration-200"
          style={{
            color: T.muted,
            border: `1px solid ${T.border}`,
            background: isOpen ? 'rgba(255,255,255,0.03)' : 'transparent',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = isOpen ? 'rgba(255,255,255,0.03)' : 'transparent'; }}
        >
          {isOpen ? (
            <><ChevronUp className="w-4 h-4" /> Show Less</>
          ) : (
            <><ChevronDown className="w-4 h-4" /> Show More</>
          )}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════ STAT CARD ═══════════════ */
function StatCard({ icon: Icon, value, label, color }: {
  icon: any; value: string; label: string; color: string;
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col justify-center items-center text-center transition-all duration-200 hover:-translate-y-0.5 group"
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        boxShadow: `0 4px 12px ${T.shadow}`,
      }}
    >
      <Icon className="w-5 h-5 mb-2 transition-transform group-hover:scale-110" style={{ color }} />
      <p className="text-2xl font-bold" style={{ color: T.text }}>{value}</p>
      <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.muted }}>{label}</p>
    </div>
  );
}

/* ═══════════════ SECTION CARD ═══════════════ */
function SectionCard({ icon: Icon, title, iconColor, accentBar, children, copyText }: {
  icon: any; title: string; iconColor: string; accentBar?: string; children: React.ReactNode; copyText?: string;
}) {
  return (
    <div
      className="rounded-xl flex flex-col transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        boxShadow: `0 4px 16px ${T.shadow}`,
      }}
    >
      {accentBar && <div className="h-1" style={{ background: accentBar }} />}
      <div className="p-6 flex items-center justify-between group">
        <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: T.text }}>
          <Icon className="w-5 h-5" style={{ color: iconColor }} />
          {title}
        </h2>
        {copyText && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={copyText} />
          </div>
        )}
      </div>
      <div className="px-6 pb-6 flex-1">
        {children}
      </div>
    </div>
  );
}

/* ═══════════════ REPO CONTENT (single tab view) ═══════════════ */
export function RepoContent({ data, isSharedView = false }: { data: any, isSharedView?: boolean }) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const formattedDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(data.metadata.lastUpdated));

  return (
    <>
      {/* ═══════════ HEADER ═══════════ */}
      <div
        className="w-full px-6 py-4 flex items-center justify-between"
        style={{
          background: 'rgba(10,26,47,0.6)',
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-1 rounded-lg shrink-0"
            style={{ background: T.bgSec, border: `1px solid ${T.border}` }}
          >
            {data.metadata.avatarUrl ? (
              <img src={data.metadata.avatarUrl} alt={data.metadata.owner} className="w-8 h-8 rounded-md object-cover" />
            ) : (
              <Github className="w-8 h-8 p-1" style={{ color: T.muted }} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
               <h1 className="font-bold text-xl tracking-tight" style={{ color: T.text }}>
                 {data.metadata.owner} <span style={{ color: T.muted }}>/</span> {data.metadata.name}
               </h1>
            </div>
            {data.metadata.description && (
              <p className="text-sm mt-0.5 max-w-[600px] truncate" style={{ color: T.muted }}>{data.metadata.description}</p>
            )}
            <p className="text-xs hidden sm:block mt-1" style={{ color: T.muted }}>Last updated {formattedDate}</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3 text-sm font-medium">
          {[
            { icon: Star, value: data.metadata.stars.toLocaleString(), color: '#FBBF24' },
            { icon: GitFork, value: data.metadata.forks.toLocaleString(), color: '#60A5FA' },
            { icon: Disc, value: `${data.metadata.openIssues} Issues`, color: '#34D399' },
          ].map(({ icon: Ic, value, color }) => (
            <div
              key={value}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ background: T.bgSec, border: `1px solid ${T.border}`, color: T.text }}
            >
              <Ic className="w-4 h-4" style={{ color }} />
              <span>{value}</span>
            </div>
          ))}
          <a
            href={data.metadata.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors duration-200"
            style={{ color: T.muted, border: `1px solid ${T.border}` }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Github className="w-4 h-4" />
            View on GitHub
          </a>
          {!isSharedView && (
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors duration-200"
              style={{ background: T.accent, color: '#0A0A0A', border: `1px solid ${T.accent}` }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
            >
              <Share2 className="w-4 h-4" />
              Share Analysis
            </button>
          )}
        </div>
      </div>
      
      <ShareModal 
        isOpen={isShareModalOpen} 
        onClose={() => setIsShareModalOpen(false)} 
        repoOwner={data.metadata.owner} 
        repoName={data.metadata.name} 
      />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ═══════════ STATS ═══════════ */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon={Star} value={data.metadata.stars.toLocaleString()} label="Stars" color="#FBBF24" />
          <StatCard icon={GitFork} value={data.metadata.forks.toLocaleString()} label="Forks" color="#60A5FA" />
          <StatCard icon={Disc} value={data.metadata.openIssues.toLocaleString()} label="Issues" color="#34D399" />
          <StatCard icon={GitCommitHorizontal} value={data.metadata.defaultBranch} label="Primary Branch" color="#A78BFA" />
          <StatCard icon={Calendar} value={formattedDate} label="Updated" color="#FB923C" />
        </div>
        
        {/* ═══════════ ROW 1: Summary & Architecture ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard
            icon={LayoutTemplate}
            title="Project Summary"
            iconColor={T.accent}
            accentBar={`linear-gradient(to right, ${T.accent}, #3B82F6)`}
            copyText={data.summary}
          >
            <MarkdownViewer content={data.summary} />
          </SectionCard>

          <SectionCard icon={Server} title="System Architecture" iconColor="#60A5FA" copyText={data.architecture}>
            <MarkdownViewer content={data.architecture} />
          </SectionCard>
        </div>

        {/* ═══════════ ROW 1.5: Architecture Diagram ═══════════ */}
        <SectionCard
          icon={Network}
          title="Architecture Diagram"
          iconColor="#818CF8"
          accentBar={`linear-gradient(to right, #818CF8, #6366F1)`}
        >
          <ArchitectureGraph data={data} />
        </SectionCard>

        {/* ═══════════ ENTRY POINTS & CORE MODULES ═══════════ */}
        {(data.primaryEntry || (data.coreModules && data.coreModules.length > 0)) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard
              icon={Play}
              title="Entry Point & Architecture"
              iconColor="#34D399"
              accentBar="linear-gradient(to right, #34D399, #10B981)"
            >
              <div className="space-y-4">
                {data.primaryEntry && (
                  <div
                    className="p-4 rounded-xl flex items-center gap-3"
                    style={{ background: T.bgSec, border: `1px solid ${T.border}` }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(52,211,153,0.1)' }}
                    >
                      <Play className="w-5 h-5" style={{ color: '#34D399' }} />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.muted }}>Primary Entry Point</p>
                      <a
                        href={`${data.metadata.url}/blob/${data.metadata.defaultBranch}/${data.primaryEntry}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-mono hover:underline"
                        style={{ color: '#34D399' }}
                      >
                        {data.primaryEntry}
                      </a>
                    </div>
                  </div>
                )}

                {data.entryPoints && data.entryPoints.length > 1 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: T.muted }}>Other Entry Points</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.entryPoints.slice(1).map((ep: string) => (
                        <a
                          key={ep}
                          href={`${data.metadata.url}/blob/${data.metadata.defaultBranch}/${ep}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-md text-xs font-mono transition-colors duration-150"
                          style={{ background: T.bgSec, border: `1px solid ${T.border}`, color: T.text }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(52,211,153,0.4)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; }}
                        >
                          {ep}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard icon={Layers} title="Core Modules" iconColor="#818CF8">
              {data.coreModules && data.coreModules.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {data.coreModules.map((mod: any) => (
                    <div
                      key={mod.directory}
                      className="p-3 rounded-xl flex items-center gap-3 transition-all duration-200 hover:-translate-y-0.5"
                      style={{ background: T.bgSec, border: `1px solid ${T.border}` }}
                    >
                      <FolderOpen className="w-4 h-4 shrink-0" style={{ color: '#A78BFA' }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono truncate" style={{ color: T.text }}>{mod.directory}</p>
                        <p className="text-xs" style={{ color: T.muted }}>{mod.label} · {mod.fileCount} files</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: T.muted }}>No distinct core modules detected.</p>
              )}
            </SectionCard>
          </div>
        )}

        {/* ═══════════ ROW 2: Languages & Complexity ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard icon={FileCode} title="Language Distribution" iconColor="#F472B6">
            <LanguageChart languages={data.languages} totalFilesScanned={data.complexity.numFiles} />
          </SectionCard>

          <SectionCard icon={Activity} title="Complexity Analysis" iconColor="#818CF8">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Difficulty', value: data.complexity.score, badge: true },
                { label: 'Read Time', value: data.complexity.estimatedTime },
                { label: 'Files Scanned', value: data.complexity.numFiles },
                { label: 'Nested Depth', value: `${data.complexity.folderDepth} levels` },
              ].map(({ label, value, badge }) => (
                <div
                  key={label}
                  className="p-4 rounded-xl flex items-center justify-between"
                  style={{ background: T.bgSec, border: `1px solid ${T.border}` }}
                >
                  <span className="text-sm" style={{ color: T.muted }}>{label}</span>
                  {badge ? (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      value === 'High' ? 'bg-red-500/15 text-red-400' :
                      value === 'Medium' ? 'bg-orange-500/15 text-orange-400' :
                      'bg-green-500/15 text-green-400'
                    }`}>{value}</span>
                  ) : (
                    <span className="font-mono text-sm" style={{ color: T.text }}>{value}</span>
                  )}
                </div>
              ))}
              <div
                className="col-span-2 p-4 rounded-xl flex items-center justify-between"
                style={{ background: T.bgSec, border: `1px solid ${T.border}` }}
              >
                <span className="text-sm" style={{ color: T.muted }}>Approximated Code Lines</span>
                <span className="font-mono text-sm" style={{ color: T.text }}>{data.complexity.approxLOC.toLocaleString()} LOC</span>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ═══════════ ROW 3: File Tree & Tech Stack ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard
            icon={ListTree}
            title="Interactive File Tree"
            iconColor="#FBBF24"
            accentBar="linear-gradient(to right, #FBBF24, #F59E0B)"
            copyText={data.folderExplanation}
          >
            <div className="space-y-4">
              <FolderTree treeData={data.tree} repoUrl={data.metadata.url} owner={data.metadata.owner} repo={data.metadata.name} />
              <div className="pt-4" style={{ borderTop: `1px solid ${T.border}` }}>
                <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide" style={{ color: T.muted }}>AI Structure Context</h4>
                <MarkdownViewer content={data.folderExplanation} />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Network} title="Tech Stack" iconColor="#2DD4BF" copyText={data.techStack}>
            <CollapsibleSection>
              <MarkdownViewer content={data.techStack} />
            </CollapsibleSection>
          </SectionCard>
        </div>

        {/* ═══════════ KEY FILES (improved) ═══════════ */}
        <SectionCard
          icon={Star}
          title="Important Files Detected"
          iconColor={T.accent}
          accentBar={`linear-gradient(to right, ${T.accent}, #6366F1)`}
        >
          <ImportantFiles
            keyFiles={data.keyFiles || []}
            repoUrl={data.metadata.url}
            defaultBranch={data.metadata.defaultBranch}
          />
        </SectionCard>

        {/* ═══════════ GROUPED DEPENDENCIES ═══════════ */}
        {data.depGroups && (
          <SectionCard
            icon={Package}
            title="Dependencies Overview"
            iconColor="#FB923C"
            accentBar="linear-gradient(to right, #FB923C, #F59E0B)"
          >
            <div className="space-y-5">
              {([
                { key: 'frameworks', label: 'Frameworks', color: '#60A5FA', emoji: '🏗️' },
                { key: 'coreLibraries', label: 'Core Libraries', color: '#34D399', emoji: '📚' },
                { key: 'buildTools', label: 'Build Tools', color: '#FBBF24', emoji: '⚙️' },
                { key: 'devTools', label: 'Dev Tools', color: '#A78BFA', emoji: '🔧' },
                { key: 'other', label: 'Other', color: T.muted, emoji: '📦' },
              ] as const).map(({ key, label, color, emoji }) => {
                const deps = (data.depGroups as any)[key] as string[];
                if (!deps || deps.length === 0) return null;
                return (
                  <div key={key}>
                    <p className="text-xs uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5" style={{ color }}>
                      <span>{emoji}</span> {label}
                      <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: `${color}15`, color }}>{deps.length}</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {deps.map((dep: string) => (
                        <span
                          key={dep}
                          className="px-2.5 py-1 rounded-md text-xs font-mono"
                          style={{ background: T.bgSec, border: `1px solid ${T.border}`, color: T.text }}
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* ═══════════ ROW 4: AI Dependencies Detail & Run Instructions ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard icon={Package} title="Dependency Analysis" iconColor="#FB923C" copyText={data.dependenciesExplanation || 'No context'}>
            <CollapsibleSection>
              <MarkdownViewer content={data.dependenciesExplanation || 'No dependency information generated.'} />
            </CollapsibleSection>
          </SectionCard>

          <SectionCard
            icon={Server}
            title="How To Run The Project"
            iconColor="#34D399"
            accentBar="linear-gradient(to right, #34D399, #22C55E)"
            copyText={data.runInstructions}
          >
            <CollapsibleSection>
              <MarkdownViewer content={data.runInstructions || 'Instructions not available.'} />
            </CollapsibleSection>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

/* ═══════════════ ERROR VIEW ═══════════════ */
export function ErrorView({ error, onRetry, isRateLimit = false }: { error: string; onRetry: () => void; isRateLimit?: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4" style={{ background: T.bg }}>
      <div className="relative mb-6" style={{ padding: 20, background: isRateLimit ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: '50%' }}>
         <AlertCircle className="w-16 h-16 absolute top-0 -right-2 animate-bounce" style={{ color: isRateLimit ? '#FBBF24' : '#EF4444' }} />
         <Github className="w-16 h-16" style={{ color: T.muted }} />
      </div>

      {isRateLimit ? (
        <>
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: T.text }}>
            ⚠ AI Analysis Temporarily Busy
          </h2>
          <p
            className="mt-3 max-w-xl text-center text-lg leading-relaxed p-4 rounded-xl"
            style={{ color: T.muted, background: T.bgSec, border: `1px solid ${T.border}` }}
          >
            AI analysis is temporarily busy. Please try again in a few seconds.
          </p>
          <div className="flex items-center gap-4 mt-8">
            <button
              onClick={onRetry}
              id="retry-analysis-btn"
              className="h-11 px-6 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all duration-200 hover:shadow-lg hover:scale-[1.02]"
              style={{ background: '#FBBF24', color: '#0A1A2F' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F59E0B'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#FBBF24'; }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Retry Analysis
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: T.text }}>Analysis Failed</h2>
          <p
            className="mt-3 max-w-xl text-center text-lg leading-relaxed p-4 rounded-xl"
            style={{ color: T.muted, background: T.bgSec, border: `1px solid ${T.border}` }}
          >
            {error}
          </p>
          <div className="flex items-center gap-4 mt-8">
            <button
              onClick={onRetry}
              className="h-11 px-6 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all duration-200 hover:shadow-lg"
              style={{ background: T.accent, color: '#0A0A0A' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.accentH; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.accent; }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Retry Analysis
            </button>
          </div>
        </>
      )}
    </div>
  );
}


/* ═══════════════ EMPTY STATE ═══════════════ */
function EmptyState({ onNewTab }: { onNewTab: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ background: T.bg }}>
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
        style={{ background: 'rgba(37,99,235,0.08)', border: `1px solid rgba(37,99,235,0.15)` }}
      >
        <Logo size={40} />
      </div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: T.text }}>No Repository Open</h2>
      <p className="text-sm mb-8 max-w-md" style={{ color: T.muted }}>
        Open a new tab to analyze a GitHub repository. You can have multiple repositories open simultaneously.
      </p>
      <button
        onClick={onNewTab}
        className="h-12 px-8 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all duration-200 hover:shadow-lg hover:scale-[1.02]"
        style={{ background: T.accent, color: '#0A0A0A' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.accentH; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = T.accent; }}
      >
        <Github className="w-4 h-4" />
        Analyze a Repository
      </button>
    </div>
  );
}

/* ═══════════════ MAIN DASHBOARD ═══════════════ */
export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(location.search);
  const initialUrl = urlParams.get('url');

  const [mounted, setMounted] = useState(false);
  const initializedRef = useRef(false);

  const {
    tabs,
    activeTab,
    activeTabId,
    addTab,
    addAnalyzerTab,
    convertAnalyzerToRepo,
    closeTab,
    switchTab,
    updateTabData,
    updateTabError,
    updateTabChat,
    setChatOpen,
    setChatExpanded,
    updateTabLoadingMessage,
  } = useTabStore();

  /* ── Fetch repo data for a tab ── */
  const analyzeRepo = useCallback(async (tabId: string, repoUrl: string) => {
    // Ensure loading view shows normal progress initially
    if (updateTabLoadingMessage) {
      updateTabLoadingMessage(tabId, '');
    }
    try {
      const data = await fetchRepoDataWithRetry(repoUrl, (attempt, baseMessage) => {
        if (updateTabLoadingMessage) {
          updateTabLoadingMessage(tabId, `${baseMessage} Attempt ${attempt} of 4`);
        }
      });
      updateTabData(tabId, data);
    } catch (err: any) {
      const normalizedError = normalizeError(err);
      
      console.error({
        url: repoUrl,
        status: normalizedError.status,
        message: normalizedError.message,
        error: err
      });

      const isRateLimit = normalizedError.status === 429 || err?.isRateLimit === true;
      const errorMsg = isRateLimit
        ? 'RATE_LIMIT:' + normalizedError.message
        : normalizedError.message;
        
      updateTabError(tabId, errorMsg);
    }
  }, [updateTabData, updateTabError, updateTabLoadingMessage]);

  /* ── Initialize with URL param ── */
  useEffect(() => {
    if (initialUrl && !initializedRef.current) {
      initializedRef.current = true;
      const tabId = addTab(initialUrl);
      analyzeRepo(tabId, initialUrl);
    }
  }, [initialUrl, addTab, analyzeRepo]);

  /* ── Mount animation ── */
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  /* ── Handle "+" button click — open new analyzer tab ── */
  const handleNewAnalyzerTab = useCallback(() => {
    addAnalyzerTab();
  }, [addAnalyzerTab]);

  /* ── Handle URL submit from analyzer tab ── */
  const handleAnalyzerSubmit = useCallback((tabId: string, url: string) => {
    convertAnalyzerToRepo(tabId, url);
    analyzeRepo(tabId, url);
  }, [convertAnalyzerToRepo, analyzeRepo]);

  /* ── Handle close tab → go home if none left ── */
  const handleCloseTab = useCallback((tabId: string) => {
    closeTab(tabId);
    if (tabs.length <= 1) {
      navigate('/');
    }
  }, [closeTab, tabs.length, navigate]);

  /* ── Navigate home if no URL and no tabs ── */
  if (!initialUrl && tabs.length === 0) {
    navigate('/');
    return null;
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: T.bg,
        color: T.text,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 250ms ease-out, transform 250ms ease-out',
      }}
    >
      {/* ═══════════ TAB BAR ═══════════ */}
      <TabBar
        tabs={tabs.map(t => ({
          id: t.id,
          tabType: t.tabType,
          repoName: t.repoName,
          owner: t.owner,
          isLoading: t.isLoading,
          isError: t.isError,
        }))}
        activeTabId={activeTabId}
        onSwitchTab={switchTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewAnalyzerTab}
      />

      {/* Spacer for fixed tab bar */}
      <div style={{ height: 44 }} />

      {/* ═══════════ TAB CONTENT ═══════════ */}
      {activeTab ? (
        // Analyzer tab — show inline analyzer form
        activeTab.tabType === 'analyzer' ? (
          <LandingAnalyzer
            onSubmit={(url) => handleAnalyzerSubmit(activeTab.id, url)}
          />
        ) : activeTab.isLoading ? (
          <LoadingState customMessage={activeTab.loadingMessage} />
        ) : activeTab.isError ? (
          <ErrorView
            error={activeTab.error || 'Unexpected system error'}
            isRateLimit={activeTab.error?.startsWith('RATE_LIMIT:') || false}
            onRetry={() => {
              if (activeTab.repoUrl) {
                updateTabError(activeTab.id, '');
                analyzeRepo(activeTab.id, activeTab.repoUrl);
              } else {
                handleNewAnalyzerTab();
              }
            }}
          />
        ) : activeTab.data ? (
          <div className="flex-1 pb-20">
            <RepoContent data={activeTab.data} />
          </div>
        ) : null
      ) : (
        <EmptyState onNewTab={handleNewAnalyzerTab} />
      )}

      {/* Per-tab Chat — rendered outside scroll container so FAB is always visible */}
      {activeTab && activeTab.data && activeTab.tabType === 'repo' && (
        <Chat
          repoId={activeTab.data.repoId}
          repoName={activeTab.repoName}
          messages={activeTab.chatMessages}
          onMessagesChange={(msgs) => updateTabChat(activeTab.id, msgs)}
          isOpen={activeTab.chatOpen}
          onOpenChange={(open) => setChatOpen(activeTab.id, open)}
          isExpanded={activeTab.chatExpanded}
          onExpandedChange={(expanded) => setChatExpanded(activeTab.id, expanded)}
        />
      )}
    </div>
  );
}
