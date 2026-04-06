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
 * Serial queue — ensures we NEVER have concurrent connections to Groq
 * AND maintains the minimum delay between requests.
 */
let lastCallTimestamp = 0;
let requestQueue = Promise.resolve();

const enqueueGroqCall = (task) => {
  return new Promise((resolve, reject) => {
    requestQueue = requestQueue.then(async () => {
      try {
        const now = Date.now();
        const elapsed = now - lastCallTimestamp;
        if (elapsed < THROTTLE_DELAY_MS) {
          const waitTime = THROTTLE_DELAY_MS - elapsed;
          console.log(`  ⏱ Throttle: waiting ${waitTime}ms before next Groq call`);
          await sleep(waitTime);
        }

        const result = await task();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        lastCallTimestamp = Date.now();
      }
    });
  });
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
 * Low-level Groq call with serial execution, timeout, and retry on 429.
 */
const callGroqWithRetry = async (messages, { temperature = 0.5, max_tokens = 2000, response_format = undefined } = {}) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Submitting the task to the serial queue
      const chatCompletion = await enqueueGroqCall(() => 
        withTimeout(
          groq.chat.completions.create({
            messages,
            model: MODEL,
            temperature,
            max_tokens,
            response_format,
          }),
          REQUEST_TIMEOUT_MS
        )
      );

      return chatCompletion.choices[0]?.message?.content || '';
    } catch (error) {
      const isRateLimit =
        error.status === 429 ||
        error.message?.includes('Rate limit reached') ||
        error.message?.includes('rate_limit_exceeded');

      if (isRateLimit && attempt < MAX_RETRIES) {
        // Tokens Per Minute (TPM) limit resets every minute. 
        // We MUST back off significantly (e.g. 20s - 60s) to clear the TPM window.
        const backoffDelay = Math.min(20000 * attempt, 65000); 
        console.warn(`⚠ Groq rate limit hit (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${backoffDelay / 1000}s...`);
        await sleep(backoffDelay);
        continue;
      }

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
  // Use a smaller slice of treeString to avoid Tokens Per Minute (TPM) limits on large repos like vercel/next.js
  const safeTreeString = treeString.split('\n').slice(0, 60).join('\n');
  
  const systemPrompt = `You are a senior software engineer. You will analyze a GitHub repository and return a SINGLE JSON response containing all analysis sections. You MUST respond with valid JSON only.`;

  const archSection = architectureContext
    ? `\nDetected Architecture Context:\n${architectureContext}\n`
    : '';

  const userPrompt = `Analyze this GitHub repository and return a JSON object with the following keys. Each value should be a markdown-formatted string unless specified otherwise.

Repository: ${repoName}
Metadata: ${JSON.stringify(metadata).slice(0, 500)}

File Structure (sampled):
${safeTreeString}

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
      { temperature: 0.2, max_tokens: 3500, response_format: { type: 'json_object' } }
    );

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // In case Groq adds fences even with json_object mode
      let jsonStr = raw.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }
      parsed = JSON.parse(jsonStr);
    }

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

    console.warn('⚠ Structured analysis JSON parsing failed, falling back to individual prompts...');
    return null;
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
