import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.1-8b-instant';

// ═══════════════ UTILITIES ═══════════════

/**
 * Async sleep utility — pauses execution for the given milliseconds.
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Minimum delay (ms) between consecutive Groq API calls.
 * Groq free tier: 30 RPM → need ~2000ms gap to be safe.
 * Using 2200ms for safety margin.
 */
const THROTTLE_DELAY_MS = 2200;

/**
 * Retry configuration for 429 (Rate Limit) errors.
 */
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 8000;

/**
 * Timeout per Groq request (ms). Prevents hanging.
 */
const REQUEST_TIMEOUT_MS = 45000;

/**
 * Serial throttle queue — prevents concurrent calls from bypassing the rate limit.
 *
 * When multiple calls fire concurrently (e.g. 7 parallel fallback prompts),
 * the promise chain ensures each call waits for the previous one's throttle
 * gate to complete before checking elapsed time.
 *
 * Without this, all concurrent calls read the same `lastCallTimestamp`
 * simultaneously and skip the delay — causing instant 429 errors.
 */
let lastCallTimestamp = 0;
let throttleChain = Promise.resolve();

const throttle = () => {
  throttleChain = throttleChain.then(async () => {
    const now = Date.now();
    const elapsed = now - lastCallTimestamp;
    if (elapsed < THROTTLE_DELAY_MS) {
      const waitTime = THROTTLE_DELAY_MS - elapsed;
      console.log(`  ⏱ Throttle: waiting ${waitTime}ms before next Groq call`);
      await sleep(waitTime);
    }
    lastCallTimestamp = Date.now();
  });
  return throttleChain;
};

/**
 * Creates a timeout-wrapped promise.
 */
const withTimeout = (promise, ms) => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Groq request timed out')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
};

// ═══════════════ CORE API CALL WITH RETRY ═══════════════

/**
 * Low-level Groq call with serial throttling, timeout, and retry on 429.
 */
const callGroqWithRetry = async (messages, { temperature = 0.5, max_tokens = 2000 } = {}) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Serial throttle gate — concurrent calls are queued here
      await throttle();

      const chatCompletion = await withTimeout(
        groq.chat.completions.create({
          messages,
          model: MODEL,
          temperature,
          max_tokens,
        }),
        REQUEST_TIMEOUT_MS
      );

      return chatCompletion.choices[0]?.message?.content || '';
    } catch (error) {
      const isRateLimit =
        error.status === 429 ||
        error.message?.includes('Rate limit reached') ||
        error.message?.includes('rate_limit_exceeded');

      if (isRateLimit && attempt < MAX_RETRIES) {
        const backoffDelay = RETRY_DELAY_MS * attempt; // exponential-ish backoff
        console.warn(`⚠ Groq rate limit hit (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${backoffDelay / 1000}s...`);
        await sleep(backoffDelay);
        continue;
      }

      // Re-throw with a clear flag so the controller can identify rate limits
      if (isRateLimit) {
        const rateLimitError = new Error('RATE_LIMIT_EXCEEDED');
        rateLimitError.isRateLimit = true;
        throw rateLimitError;
      }

      throw error;
    }
  }
};

// ═══════════════ PUBLIC API ═══════════════

/**
 * Generate a single completion from a prompt string.
 */
export const generateCompletion = async (
  prompt,
  systemPrompt = 'You are a senior software engineer analyzing and explaining a codebase.'
) => {
  try {
    return await callGroqWithRetry([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ]);
  } catch (error) {
    if (error.isRateLimit) throw error; // let controller handle it
    console.error('Error generating completion with Groq:', error.message);
    return `Error generating AI response: ${error.message}`;
  }
};

/**
 * Combined structured analysis — sends ONE prompt to Groq instead of 7 separate calls.
 * Returns a parsed JSON object with all analysis fields.
 */
export const generateStructuredAnalysis = async ({ metadata, treeString, pkgString, repoName, architectureContext = '' }) => {
  const systemPrompt = `You are a senior software engineer. You will analyze a GitHub repository and return a SINGLE JSON response containing all analysis sections. You MUST respond with valid JSON only — no markdown fences, no explanations outside the JSON.`;

  const archSection = architectureContext
    ? `\nDetected Architecture Context:\n${architectureContext}\n`
    : '';

  const userPrompt = `Analyze this GitHub repository and return a JSON object with the following keys. Each value should be a markdown-formatted string unless specified otherwise.

Repository: ${repoName}
Metadata: ${JSON.stringify(metadata)}

File Structure (first 150 files):
${treeString}

Dependency Files:
${pkgString}
${archSection}
Return EXACTLY this JSON structure:
{
  "summary": "Markdown with headers: ### Project Purpose, ### Key Features, ### Use Cases — use concise bullet points.",
  "folderExplanation": "Markdown explaining the folder structure and its purpose with concise bullet points.",
  "techStack": "Markdown list of frameworks and libraries detected from the dependency files.",
  "dependenciesExplanation": "Markdown formatted as a bulleted list under header ### Dependencies, explaining each dependency and its role.",
  "architecture": "Markdown formatted as a bulleted list under ### Architecture Overview giving a high-level system architecture overview. IMPORTANT: Reference the detected entry point, core modules, and key directories by name. Explain the flow: what initializes, what the core modules do, and how the build system works.",
  "runInstructions": "Markdown with ### How To Run The Project header, step-by-step instructions including bash code blocks.",
  "keyFiles": ["array", "of", "important", "file", "paths"]
}

IMPORTANT: Return ONLY valid JSON. No markdown code fences. No text outside the JSON object.`;

  try {
    const raw = await callGroqWithRetry(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3, max_tokens: 4000 }
    );

    // Try to extract JSON from the response (handle potential markdown fences)
    let jsonStr = raw.trim();
    // Remove markdown code fences if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonStr);

    return {
      summary: parsed.summary || '',
      folderExplanation: parsed.folderExplanation || '',
      techStack: parsed.techStack || '',
      dependenciesExplanation: parsed.dependenciesExplanation || '',
      architecture: parsed.architecture || '',
      runInstructions: parsed.runInstructions || '',
      keyFiles: Array.isArray(parsed.keyFiles)
        ? parsed.keyFiles.map((f) => f.trim()).filter(Boolean)
        : [],
    };
  } catch (error) {
    if (error.isRateLimit) throw error;

    // If JSON parsing fails, fall back to individual calls
    console.warn('⚠ Structured analysis JSON parsing failed, falling back to individual prompts...');
    return null; // signal the controller to use fallback
  }
};

/**
 * Chat with context — used for the repository chat feature.
 */
export const chatWithContext = async (query, context) => {
  try {
    return await callGroqWithRetry([
      {
        role: 'system',
        content:
          'You are an AI assistant helping a developer understand a GitHub repository. Use the provided context documents to answer the question. If the answer is not in the context, say you do not know based on the provided files.',
      },
      { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` },
    ]);
  } catch (error) {
    if (error.isRateLimit) throw error;
    console.error('Error in chatWithContext:', error.message);
    return 'Error generating chat response.';
  }
};
