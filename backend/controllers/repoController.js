import { fetchRepoMetadata, fetchRepoTree, fetchFileContent, fetchRepoLanguages } from '../services/githubService.js';
import { generateCompletion, generateStructuredAnalysis, chatWithContext, sleep } from '../services/groqService.js';
import { storeDocuments, queryDocuments } from '../services/chromaService.js';
import { getTopImportantFiles } from '../services/fileScoring.js';
import { detectDependencies, detectFrameworksFromImports, groupDependencies } from '../services/dependencyDetector.js';
import { detectEntryPoints, detectCoreModules, detectMajorDirectories } from '../services/entryPointDetector.js';

// ═══════════════ CACHING & DEDUP ═══════════════

const analysisCache = new Map();
const chatContextCache = new Map();
const inProgress = new Map();

// ═══════════════ HELPERS ═══════════════

const parseGitHubUrl = (url) => {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace('.git', '') };
};

const normalizeCacheKey = (url) => {
  const parsed = parseGitHubUrl(url);
  if (!parsed) return url;
  return `github.com/${parsed.owner}/${parsed.repo}`.toLowerCase();
};

const isRateLimitError = (error) => {
  return (
    error.isRateLimit === true ||
    error.message?.includes('RATE_LIMIT_EXCEEDED') ||
    error.message?.includes('Rate limit') ||
    error.status === 429
  );
};

// ═══════════════ CORE ANALYSIS LOGIC ═══════════════

const performAnalysis = async (owner, repo, repoUrl) => {
  const repoName = `${owner}_${repo}`;
  const cacheKey = normalizeCacheKey(repoUrl);

  // 1. Fetch metadata & languages in parallel
  const [metadata, languages] = await Promise.all([
    fetchRepoMetadata(owner, repo),
    fetchRepoLanguages(owner, repo).catch(() => ({})),
  ]);

  const branch = metadata.default_branch || 'main';

  // 2. Fetch tree
  const treeData = await fetchRepoTree(owner, repo, branch);
  if (!treeData || !treeData.tree) {
    throw new Error('Could not fetch repository tree.');
  }

  // Filter tree — exclude noise
  const filePaths = treeData.tree
    .filter(
      (item) =>
        item.type === 'blob' &&
        !item.path.includes('node_modules') &&
        !item.path.includes('.git/') &&
        !item.path.includes('__pycache__') &&
        !item.path.includes('.next/') &&
        !item.path.includes('dist/') &&
        !item.path.includes('build/') &&
        !item.path.includes('vendor/')
    )
    .map((item) => item.path);

  const treeString = filePaths.slice(0, 150).join('\n');

  // 3. Multi-ecosystem dependency detection + README fetch — ALL IN PARALLEL
  const [depResult, readmeContent] = await Promise.all([
    detectDependencies(owner, repo, filePaths),
    fetchFileContent(owner, repo, 'README.md').then(r => r || '').catch(() => ''),
  ]);

  const numDependencies = depResult.totalDeps;
  const depString = depResult.depString;
  const depGroups = groupDependencies(depResult.ecosystems);

  // If no dependency files found, detect frameworks from imports (parallelized internally)
  let detectedFrameworks = [];
  if (depResult.ecosystems.length === 0) {
    detectedFrameworks = await detectFrameworksFromImports(owner, repo, filePaths);
  }

  // 4. Entry point detection & core modules (synchronous, in-memory — instant)
  const { entryPoints, primaryEntry } = detectEntryPoints(filePaths);
  const coreModules = detectCoreModules(filePaths);
  const majorDirs = detectMajorDirectories(filePaths);

  // 5. Complexity calculation
  const numFiles = filePaths.length;
  const folderDepth = Math.max(...filePaths.map((p) => p.split('/').length), 1);
  const totalBytes = treeData.tree.reduce((acc, item) => acc + (item.size || 0), 0);
  const approxLOC = Math.floor(totalBytes / 30);

  let complexityScore = 'Low';
  let timeToUnderstand = 'A few hours';
  if (approxLOC > 10000 || folderDepth > 10 || numDependencies > 30) {
    complexityScore = 'High';
    timeToUnderstand = '2+ weeks';
  } else if (approxLOC > 2000 || folderDepth > 5 || numDependencies > 10) {
    complexityScore = 'Medium';
    timeToUnderstand = 'A few days';
  }

  // 6. Build enhanced architecture context for AI
  const architectureContext = buildArchitectureContext({
    primaryEntry,
    entryPoints,
    coreModules,
    majorDirs,
    detectedFrameworks,
    depGroups,
  });

  // 7. AI Analysis — try combined prompt first
  let summary, folderExplanation, techStack, dependenciesExplanation, architecture, runInstructions, aiKeyFiles;

  const structured = await generateStructuredAnalysis({
    metadata,
    treeString,
    pkgString: depString,
    repoName,
    architectureContext,
  });

  if (structured) {
    ({ summary, folderExplanation, techStack, dependenciesExplanation, architecture, runInstructions } = structured);
    aiKeyFiles = structured.keyFiles || [];
  } else {
    console.log('Using fallback condensed individual prompts (parallelized)...');

    // *** CONDENSED FALLBACK — run 3 batched prompts instead of 7 to avoid Tokens Per Minute (TPM) limits ***
    const [summaryAndRun, archAndFolders, keyFilesAndDeps] = await Promise.all([
      generateCompletion(
        `Based on this metadata: ${JSON.stringify(metadata)}\nAnd these dependencies:\n${depString}\nSummarize the project. Format with headers: '### Project Purpose', '### Key Features', '### Use Cases'. Then add a header '### How To Run The Project' with step-by-step instructions.`
      ),
      generateCompletion(
        `Here is the file structure:\n${treeString}\nAnd architecture context:\n${architectureContext}\nExplain the folder structure and its purpose. Follow it with a high-level system architecture overview under the header '### Architecture Overview'.`
      ),
      generateCompletion(
        `Here are the dependencies:\n${depString}\nDetect frameworks used and list them. Then explain the roles of dependencies under the header '### Dependencies'. Finally, list the 10 most important files from this structure:\n${treeString}\nOutput the important files at the very end under '### Important Files' as a comma-separated list.`
      ),
    ]);

    // Parse out the batched responses roughly
    summary = summaryAndRun.split('### How To Run')[0] || summaryAndRun;
    runInstructions = summaryAndRun.includes('### How To Run') ? '### How To Run' + summaryAndRun.split('### How To Run')[1] : '';

    folderExplanation = archAndFolders.split('### Architecture')[0] || archAndFolders;
    architecture = archAndFolders.includes('### Architecture') ? '### Architecture' + archAndFolders.split('### Architecture')[1] : '';

    techStack = keyFilesAndDeps.split('### Dependencies')[0] || keyFilesAndDeps;
    dependenciesExplanation = keyFilesAndDeps; // Include everything in dependencies as fallback
    
    // Attempt rudimentary extraction of important files
    const impFilesMatch = keyFilesAndDeps.split('### Important Files')[1];
    aiKeyFiles = impFilesMatch 
      ? impFilesMatch.split(',').map((f) => f.trim()).filter(Boolean)
      : [];
  }

  // 8. Score-based important file ranking (deduped, top 10)
  const keyFiles = getTopImportantFiles(filePaths, aiKeyFiles, 10);

  // If we detected frameworks from imports but no dep files, append to tech stack
  if (detectedFrameworks.length > 0) {
    const frameworkNote = `\n\n### Detected from Code Imports\n${detectedFrameworks.map((f) => `- ${f}`).join('\n')}`;
    techStack = (techStack || '') + frameworkNote;
  }

  // 9. Store documents for chat (background, non-blocking)
  (async () => {
    try {
      const chunks = [];
      const metadatas = [];

      const treeChunkSize = 50;
      for (let i = 0; i < filePaths.length; i += treeChunkSize) {
        const chunkPaths = filePaths.slice(i, i + treeChunkSize).join('\n');
        chunks.push(`File structure part:\n${chunkPaths}`);
        metadatas.push({ source: 'tree' });
      }

      if (readmeContent) {
        chunks.push(`README.md content:\n${readmeContent.slice(0, 2000)}`);
        metadatas.push({ source: 'readme' });
      }

      if (chunks.length > 0) {
        await storeDocuments(repoName, chunks, metadatas);
      }
    } catch (e) {
      console.warn('Background document storage failed:', e.message);
    }
  })();

  // Store chat context (always available, even without ChromaDB)
  chatContextCache.set(cacheKey, {
    name: metadata.name,
    description: metadata.description,
    readme: readmeContent.slice(0, 1500),
    dependencies: depString,
    folderStructure: treeString,
    importantFiles: keyFiles.join(', '),
    repoId: repoName,
  });

  // Build response
  const result = {
    metadata: {
      name: metadata.name,
      owner: metadata.owner?.login || owner,
      avatarUrl: metadata.owner?.avatar_url,
      description: metadata.description,
      stars: metadata.stargazers_count,
      forks: metadata.forks_count,
      openIssues: metadata.open_issues_count,
      defaultBranch: branch,
      lastUpdated: metadata.updated_at,
      url: metadata.html_url,
    },
    languages,
    summary,
    folderExplanation,
    techStack,
    dependenciesExplanation,
    architecture,
    runInstructions,
    keyFiles,
    entryPoints: entryPoints.map((e) => e.path),
    primaryEntry,
    coreModules,
    majorDirectories: majorDirs,
    depGroups,
    detectedEcosystems: depResult.ecosystems.map((e) => e.ecosystem),
    detectedFrameworks,
    complexity: {
      score: complexityScore,
      estimatedTime: timeToUnderstand,
      numFiles,
      numDependencies,
      folderDepth,
      approxLOC,
    },
    tree: treeData.tree,
    repoId: repoName,
    cached: false,
  };

  return result;
};

/**
 * Build a context string about the architecture to include in AI prompts.
 */
const buildArchitectureContext = ({ primaryEntry, entryPoints, coreModules, majorDirs, detectedFrameworks, depGroups }) => {
  const lines = [];

  if (primaryEntry) {
    lines.push(`Primary Entry Point: ${primaryEntry}`);
  }
  if (entryPoints.length > 1) {
    lines.push(`Other Entry Points: ${entryPoints.slice(1).map((e) => e.path).join(', ')}`);
  }
  if (coreModules.length > 0) {
    lines.push(`Core Modules: ${coreModules.map((m) => `${m.directory} (${m.label}, ${m.fileCount} files)`).join(', ')}`);
  }
  if (majorDirs.length > 0) {
    lines.push(`Major Directories: ${majorDirs.join(', ')}`);
  }
  if (detectedFrameworks.length > 0) {
    lines.push(`Detected Frameworks: ${detectedFrameworks.join(', ')}`);
  }
  if (depGroups.frameworks.length > 0) {
    lines.push(`Framework Dependencies: ${depGroups.frameworks.join(', ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : '';
};

// ═══════════════ ROUTE HANDLERS ═══════════════

export const analyzeRepository = async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'GitHub URL is required.' });

  const parsed = parseGitHubUrl(url);
  if (!parsed) return res.status(400).json({ error: 'Invalid GitHub URL.' });

  const { owner, repo } = parsed;
  const cacheKey = normalizeCacheKey(url);

  try {
    if (analysisCache.has(cacheKey)) {
      console.log(`✅ Cache hit for ${cacheKey}`);
      const cached = analysisCache.get(cacheKey);
      return res.json({ ...cached, cached: true });
    }

    if (inProgress.has(cacheKey)) {
      console.log(`⏳ Analysis already in progress for ${cacheKey}, awaiting result...`);
      const result = await inProgress.get(cacheKey);
      return res.json({ ...result, cached: true });
    }

    console.log(`🔍 Starting fresh analysis for ${cacheKey}...`);

    const analysisPromise = performAnalysis(owner, repo, url);
    inProgress.set(cacheKey, analysisPromise);

    try {
      const result = await analysisPromise;
      analysisCache.set(cacheKey, result);
      console.log(`💾 Cached analysis for ${cacheKey}`);
      return res.json(result);
    } finally {
      inProgress.delete(cacheKey);
    }
  } catch (error) {
    console.error('Analyze Error:', error.message);

    if (isRateLimitError(error)) {
      return res.status(429).json({
        error: 'AI analysis is temporarily busy due to rate limiting. Please try again in a few seconds.',
        errorType: 'RATE_LIMIT',
      });
    }

    const msg = error.response ? error.response.data.message : error.message;
    res.status(500).json({ error: `Failed to analyze repository: ${msg}` });
  }
};

export const chatWithRepository = async (req, res) => {
  const { repoId, message } = req.body;
  if (!repoId || !message) {
    return res.status(400).json({ error: 'repoId and message are required.' });
  }

  try {
    // Try vector DB first, but gracefully handle when unavailable
    let vectorContext = '';
    try {
      const contextDoc = await queryDocuments(repoId, message, 3);
      vectorContext = Array.isArray(contextDoc) ? contextDoc.join('\n\n') : '';
    } catch (e) {
      console.warn('Vector DB query failed, using cached context only:', e.message);
    }

    // Find cached context for this repo
    let cached = null;
    for (const [, val] of chatContextCache) {
      if (val.repoId === repoId) {
        cached = val;
        break;
      }
    }
    cached = cached || {};

    const context = `
Repository Name: ${cached.name || repoId}
Description: ${cached.description || 'N/A'}

README:
${cached.readme || 'N/A'}

Dependencies:
${cached.dependencies || 'N/A'}

Folder Structure:
${cached.folderStructure || 'N/A'}

Important Files:
${cached.importantFiles || 'N/A'}

Relevant Context from Vector DB:
${vectorContext}
`;

    const answer = await chatWithContext(message, context);
    res.json({ reply: answer });
  } catch (error) {
    console.error('Chat Error:', error);

    if (isRateLimitError(error)) {
      return res.status(429).json({
        error: 'AI chat is temporarily busy due to rate limiting. Please try again in a few seconds.',
        errorType: 'RATE_LIMIT',
      });
    }

    res.status(500).json({ error: 'Failed to chat with repository.' });
  }
};

export const explainFile = async (req, res) => {
  const { url, filePath } = req.body;
  if (!url || !filePath) return res.status(400).json({ error: 'URL and filePath are required' });

  const parsed = parseGitHubUrl(url);
  if (!parsed) return res.status(400).json({ error: 'Invalid GitHub URL.' });

  const { owner, repo } = parsed;

  try {
    const fileContent = await fetchFileContent(owner, repo, filePath);
    if (!fileContent) {
      return res.status(404).json({ error: 'File content not found or empty.' });
    }

    const explanation = await generateCompletion(
      `Explain this file:\n\nFileName: ${filePath}\n\nContent:\n${String(fileContent).slice(0, 3000)}\n\nUse bullet points and be concise. Structure with "### Purpose" and "### Key Logic".`
    );

    res.json({ explanation });
  } catch (error) {
    console.error('File Explain Error:', error);

    if (isRateLimitError(error)) {
      return res.status(429).json({
        error: 'AI analysis is temporarily busy due to rate limiting. Please try again in a few seconds.',
        errorType: 'RATE_LIMIT',
      });
    }

    res.status(500).json({ error: 'Failed to explain file.' });
  }
};

export const clearCache = (req, res) => {
  const { repoUrl } = req.body;
  if (repoUrl) {
    const key = normalizeCacheKey(repoUrl);
    analysisCache.delete(key);
    chatContextCache.delete(key);
    res.json({ message: `Cache cleared for ${key}` });
  } else {
    analysisCache.clear();
    chatContextCache.clear();
    res.json({ message: 'All caches cleared' });
  }
};
