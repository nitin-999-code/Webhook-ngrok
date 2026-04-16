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
    
    const getRetryDelay = (attempt: number, status?: number) => {
      // If we hit a 429, we likely hit a Tokens Per Minute limit which resets every 60s
      if (status === 429) {
        return 65000; // Force a 65 second wait
      }
      return Math.min(5000 * Math.pow(2, attempt), 30000);
    };

    while (true) {
      try {
        const { data } = await axios.post(`${API_URL}/analyze`, { url }, {
          timeout: 150000, // 2.5 minute timeout for long queue
        });
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
          
          const nextRetryIn = getRetryDelay(attempt, status);

          console.log({
            repo: url,
            status: status || 'timeout',
            retryAttempt: attempt + 1,
            nextRetryIn
          });

          let baseMessage = 'Request timed out. Retrying...';
          if (status === 429) {
            baseMessage = 'Rate limit reached. Waiting 60s for AI to reset...';
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
    if (message === "Unexpected system error" || message === "Request failed with status code 500" || !message) {
      message = "Server error occurred during analysis.";
    }
  }

  // Always return a safe message
  if (!message || message === 'undefined' || message === 'null') {
    message = "Unexpected system error";
  }

  return { status, message, code };
}
