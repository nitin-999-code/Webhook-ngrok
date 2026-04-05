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
    const maxRetries = 3;
    const delays = [2000, 4000, 8000];

    while (true) {
      try {
        const { data } = await axios.post(`${API_URL}/analyze`, { url });
        analysisCache.set(url, data);
        return data;
      } catch (err: any) {
        const status = err.response?.status;
        const isTimeout = err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout');
        
        if (status === 429 || status === 503 || isTimeout) {
          if (attempt >= maxRetries) {
            const finalError = new Error('AI Analysis Temporarily Busy');
            (finalError as any).isRateLimit = true;
            throw finalError;
          }
          
          // Logging for Debugging
          console.log({
            repo: url,
            status: status || 'timeout',
            retryAttempt: attempt + 1,
            nextRetryIn: delays[attempt]
          });

          let baseMessage = 'Request timed out. Retrying...';
          if (status === 429) {
            baseMessage = 'Rate limit reached. Retrying automatically...';
          } else if (status === 503) {
            baseMessage = 'AI service temporarily busy. Retrying...';
          }

          onRetry(attempt + 1, baseMessage);
          
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
          attempt++;
        } else {
          throw err;
        }
      }
    }
  };

  return analysisQueue.enqueue(task);
};
