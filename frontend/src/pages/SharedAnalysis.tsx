import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

import { RepoContent, ErrorView } from './Dashboard';
import { LoadingState } from '../components/LoadingState';
import { theme as T } from '../lib/theme';
import Chat from '../components/Chat';
import { Share2, Github } from 'lucide-react';
import { fetchRepoDataWithRetry, normalizeError } from '../lib/api';

export default function SharedAnalysis() {
  const { owner, repo } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState('');
  const [isRateLimit, setIsRateLimit] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);

  // CTA State
  const [analyzeUrl, setAnalyzeUrl] = useState('');
  const navigate = useNavigate();

  const handleAnalyzeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (analyzeUrl) {
      navigate(`/dashboard?url=${encodeURIComponent(analyzeUrl)}`);
    }
  };

  const fetchAnalysis = async () => {
    if (!owner || !repo) {
      setError('Invalid share link: Missing repository information.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadingMessage('');
    setError('');
    setIsRateLimit(false);
    
    const url = `https://github.com/${owner}/${repo}`;
    console.log("Share page repo:", url);

    try {
      const data = await fetchRepoDataWithRetry(url, (attempt, baseMessage) => {
        setLoadingMessage(`${baseMessage} Attempt ${attempt} of 3`);
      });
      console.log("Analysis result:", data);
      setData(data);
    } catch (err: any) {
      const normalizedError = normalizeError(err);
      
      console.error({
        url,
        status: normalizedError.status,
        message: normalizedError.message,
        retryAttempt: 0,
        error: err
      });

      const isRateL = normalizedError.status === 429 || err?.isRateLimit === true;
      if (isRateL) {
        setIsRateLimit(true);
      }
      setError(normalizedError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo]);

  // Make sure we never render a blank screen.
  // We show loading first if it's explicitly loading, OR if we have no data and no error yet.
  if (loading || (!data && !error)) {
    return (
      <div className="min-h-screen flex flex-col pt-16" style={{ background: T.bg }}>
        <LoadingState customMessage={loadingMessage} />
      </div>
    );
  }

  // If there's an error, show it.
  if (error) {
    return (
      <div className="min-h-screen flex flex-col pt-16" style={{ background: T.bg }}>
        <ErrorView error={error} isRateLimit={isRateLimit} onRetry={fetchAnalysis} />
      </div>
    );
  }

  // Fallback safely to error if somehow data is still missing (should be impossible now).
  if (!data) {
     return (
        <div className="min-h-screen flex flex-col pt-16" style={{ background: T.bg }}>
          <ErrorView error={"Repository could not be analyzed."} onRetry={fetchAnalysis} />
        </div>
     );
  }



  return (
    <div className="min-h-screen flex flex-col" style={{ background: T.bg, color: T.text, opacity: 1 }}>
      {/* ═══════════ SHARED BANNER ═══════════ */}
      <div 
        className="w-full px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 border-b relative overflow-hidden"
        style={{ 
          background: T.card, 
          borderColor: T.border 
        }}
      >

        
        <div className="flex items-center gap-4 relative z-10">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-lg border"
            style={{ background: 'rgba(37,99,235,0.1)', borderColor: 'rgba(37,99,235,0.2)' }}
          >
            <Share2 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase text-blue-400 mb-0.5">
              Shared Repository Analysis
            </h2>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg" style={{ color: T.text }}>
                {owner} <span style={{ color: T.muted }}>/</span> {repo}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: T.muted }}>
              <Link to="/" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors">
                Powered by SourceMind AI
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════ ANALYZE ANOTHER REPO CTA ═══════════ */}
      <div 
        className="w-full px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-b"
        style={{ background: T.bgSec, borderColor: T.border }}
      >
        <span className="text-sm font-medium" style={{ color: T.text }}>
          Analyze Another Repository
        </span>
        <form onSubmit={handleAnalyzeSubmit} className="flex-1 w-full max-w-lg">
          <div 
            className="flex items-center gap-2 p-1.5 rounded-lg w-full transition-all duration-200"
            style={{ background: T.bgSec, border: `1px solid ${T.border}` }}
          >
            <Github className="w-4 h-4 ml-2 shrink-0" style={{ color: T.muted }} />
            <input
              type="text"
              value={analyzeUrl}
              onChange={(e) => setAnalyzeUrl(e.target.value)}
              placeholder="GitHub Repository URL"
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: T.text }}
            />
            <button
              type="submit"
              className="h-8 px-4 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 shrink-0"
              style={{ background: T.accent, color: '#0A0A0A' }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
            >
              Analyze Repository
            </button>
          </div>
        </form>
      </div>

      <div className="flex-1 pb-20">
        <RepoContent data={data} isSharedView={true} />
      </div>
      
      <Chat
        repoId={data.repoId}
        repoName={`${owner}/${repo}`}
        messages={chatMessages}
        onMessagesChange={setChatMessages}
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
        isExpanded={chatExpanded}
        onExpandedChange={setChatExpanded}
      />
    </div>
  );
}
