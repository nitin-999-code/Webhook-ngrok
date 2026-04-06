import axios from 'axios';

const API_URL = 'https://sourcemind.onrender.com/api';

/* ═══════════════ CACHE & QUEUE & FETCH ═══════════════ */
export const analysisCache = new Map<string, any>();

class AnalysisQueue {
  private activeCount = 0;
  private readonly maxConcurrent = 2;
  private queue: (() => void)[] = [];

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.activeCount++;
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeCount--;
          this.processQueue();
        }
      };

      if (this.activeCount < this.maxConcurrent) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }

  private processQueue() {
    if (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) nextTask();
    }
  }
}

export const analysisQueue = new AnalysisQueue();

export const fetchRepoDataWithRetry = async (
  url: string,
  onRetry: (attempt: number, message: string) => void
) => {
  // Cached Result Fallback
  if (analysisCache.has(url)) {
    return analysisCache.get(url);
  }

  const task = async () => {
    let attempt = 0;
    const MAX_RETRIES = 4;
    
    const getRetryDelay = (attempt: number) => {
      return Math.min(5000 * Math.pow(2, attempt), 40000);
    };

    while (true) {
      try {
        const { data } = await axios.post(`${API_URL}/analyze`, { url });
        analysisCache.set(url, data);
        return data;
      } catch (err: any) {
        const status = err.response?.status;
        const isTimeout = err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout');
        
        if (status === 429 || status === 503 || status === 504 || isTimeout) {
          if (attempt >= MAX_RETRIES) {
            const finalError = new Error('AI Analysis Temporarily Busy');
            (finalError as any).isRateLimit = true;
            throw finalError;
          }
          
          const nextRetryIn = getRetryDelay(attempt);

          // Logging for Debugging
          console.log({
            repo: url,
            status: status || 'timeout',
            retryAttempt: attempt + 1,
            nextRetryIn
          });

          let baseMessage = 'Request timed out. Retrying...';
          if (status === 429) {
            baseMessage = 'Rate limit reached. Retrying automatically...';
          } else if (status === 503 || status === 504) {
            baseMessage = 'AI service temporarily busy. Retrying...';
          }

          onRetry(attempt + 1, baseMessage);
          
          await new Promise(resolve => setTimeout(resolve, nextRetryIn));
          attempt++;
        } else {
          throw err;
        }
      }
    }
  };

  return analysisQueue.enqueue(task);
};

/* ═══════════════ ERROR NORMALIZATION ═══════════════ */
export function normalizeError(error: any): { status?: number; message: string; code?: string } {
  let status: number | undefined;
  let message = "Unexpected system error";
  let code: string | undefined;

  if (axios.isAxiosError(error) && error.response) {
    status = error.response.status;
    message = error.response.data?.message || error.response.data?.error || error.message;
    code = error.code;
  } else if (error && typeof error === 'object') {
    status = error.status || status;
    message = error.message || message;
    code = error.code || code;
  }

  if (error?.name === 'AbortError') {
    message = "Request timed out. Please try again.";
  } else if (error?.message === 'Failed to fetch') {
    message = "Network failure. Please check your connection.";
  } else if (status === 429) {
    message = "Rate limit reached. Please wait and retry.";
  } else if (status === 503) {
    message = "AI service temporarily busy.";
  } else if (status === 500) {
    message = "Server error occurred during analysis.";
  }

  // Always return a continuous safe message
  if (!message || message === 'undefined' || message === 'null') {
    message = "Unexpected system error";
  }

  return { status, message, code };
}

/* ═══════════════ FALLBACK ANALYSIS ═══════════════ */
export async function fetchBasicRepoInfo(repoUrl: string) {
  const parts = repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '').split('/');
  const owner = parts[0];
  const repo = parts[1];

  if (!owner || !repo) throw new Error("Invalid GitHub URL");

  const [repoRes, langRes, contentsRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}`).then(res => res.json()),
    fetch(`https://api.github.com/repos/${owner}/${repo}/languages`).then(res => res.json()),
    fetch(`https://api.github.com/repos/${owner}/${repo}/contents`).then(res => res.json())
  ]);

  if (repoRes.message && repoRes.message.includes('API rate limit')) {
    throw new Error("GitHub API rate limit exceeded during fallback");
  }

  const totalBytes = Object.values(langRes).reduce((a: any, b: any) => a + b, 0) as number;
  const languages = Object.entries(langRes).map(([name, bytes]) => ({
    name,
    percentage: totalBytes > 0 ? ((bytes as number) / totalBytes) * 100 : 0,
    color: '#34D399' // dynamic color isn't provided by GH directly, fallback.
  }));

  const tree = Array.isArray(contentsRes) ? contentsRes.map(item => ({
    name: item.name,
    type: item.type === 'dir' ? 'directory' : 'file',
    path: item.path,
    size: item.size
  })) : [];

  return {
    isFallbackMode: true,
    metadata: {
      name: repoRes.name || repo,
      owner: repoRes.owner?.login || owner,
      url: repoUrl,
      description: repoRes.description,
      stars: repoRes.stargazers_count || 0,
      forks: repoRes.forks_count || 0,
      openIssues: repoRes.open_issues_count || 0,
      defaultBranch: repoRes.default_branch || 'main',
      lastUpdated: repoRes.updated_at || new Date().toISOString(),
      avatarUrl: repoRes.owner?.avatar_url
    },
    summary: repoRes.description || "No description provided.",
    languages,
    complexity: {
      score: 'Medium',
      estimatedTime: '~5 min',
      numFiles: tree.length,
      folderDepth: 1,
      approxLOC: 0
    },
    tree,
    architecture: "AI architecture analysis is pending backend processing...",
    techStack: "Tech stack analysis is pending backend processing...",
    folderExplanation: "Folder explanation pending...",
    dependenciesExplanation: "Dependency analysis pending...",
    runInstructions: "Run instructions pending..."
  };
}
