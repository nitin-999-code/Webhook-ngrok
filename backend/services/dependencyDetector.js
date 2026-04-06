/**
 * dependencyDetector.js — Multi-ecosystem dependency detection.
 *
 * Detects dependencies from ecosystem-specific files across:
 * Node, Python, Rust, Go, Java, C#, Ruby
 *
 * Also performs fallback framework detection from code imports
 * when no dependency files are found.
 */

import { fetchFileContent } from './githubService.js';

// ═══════════════ ECOSYSTEM DEFINITIONS ═══════════════

/**
 * Each ecosystem definition maps a manifest file to a parser function.
 * The parser receives the raw file content and returns:
 *   { ecosystem, file, dependencies: string[], devDependencies: string[], raw: string }
 */
const ECOSYSTEMS = [
  {
    name: 'Node.js',
    file: 'package.json',
    parse: (content) => {
      try {
        const pkg = JSON.parse(content);
        return {
          ecosystem: 'Node.js',
          file: 'package.json',
          dependencies: Object.keys(pkg.dependencies || {}),
          devDependencies: Object.keys(pkg.devDependencies || {}),
          raw: content,
        };
      } catch { return null; }
    },
  },
  {
    name: 'Python',
    file: 'requirements.txt',
    parse: (content) => {
      const deps = content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('-'))
        .map((l) => l.split(/[=<>!~;@\s]/)[0].trim())
        .filter(Boolean);
      return {
        ecosystem: 'Python',
        file: 'requirements.txt',
        dependencies: deps,
        devDependencies: [],
        raw: content,
      };
    },
  },
  {
    name: 'Python',
    file: 'pyproject.toml',
    parse: (content) => {
      // Simple TOML parsing for dependencies array
      const deps = [];
      const depMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
      if (depMatch) {
        const items = depMatch[1].match(/"([^"]+)"/g) || [];
        items.forEach((item) => {
          deps.push(item.replace(/"/g, '').split(/[=<>!~;@\s]/)[0].trim());
        });
      }
      return {
        ecosystem: 'Python',
        file: 'pyproject.toml',
        dependencies: deps,
        devDependencies: [],
        raw: content,
      };
    },
  },
  {
    name: 'Rust',
    file: 'Cargo.toml',
    parse: (content) => {
      // Extract [dependencies] section
      const deps = [];
      const depSection = content.match(/\[dependencies\]([\s\S]*?)(\[|$)/);
      if (depSection) {
        const lines = depSection[1].split('\n');
        lines.forEach((line) => {
          const m = line.match(/^(\S+)\s*=/);
          if (m) deps.push(m[1].trim());
        });
      }
      return {
        ecosystem: 'Rust',
        file: 'Cargo.toml',
        dependencies: deps,
        devDependencies: [],
        raw: content,
      };
    },
  },
  {
    name: 'Go',
    file: 'go.mod',
    parse: (content) => {
      const deps = [];
      const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/);
      if (requireBlock) {
        requireBlock[1].split('\n').forEach((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('//')) {
            const parts = trimmed.split(/\s+/);
            if (parts[0]) deps.push(parts[0]);
          }
        });
      }
      // Single-line requires
      const singleReqs = content.matchAll(/require\s+(\S+)\s+/g);
      for (const m of singleReqs) {
        if (m[1] && !m[1].startsWith('(')) deps.push(m[1]);
      }
      return {
        ecosystem: 'Go',
        file: 'go.mod',
        dependencies: [...new Set(deps)],
        devDependencies: [],
        raw: content,
      };
    },
  },
  {
    name: 'Java',
    file: 'pom.xml',
    parse: (content) => {
      const deps = [];
      const depMatches = content.matchAll(/<dependency>[\s\S]*?<groupId>(.*?)<\/groupId>[\s\S]*?<artifactId>(.*?)<\/artifactId>[\s\S]*?<\/dependency>/g);
      for (const m of depMatches) {
        deps.push(`${m[1]}:${m[2]}`);
      }
      return {
        ecosystem: 'Java',
        file: 'pom.xml',
        dependencies: deps,
        devDependencies: [],
        raw: content,
      };
    },
  },
  {
    name: 'C#',
    files: ['.csproj'],  // special: look for any .csproj file in tree
    filePattern: /\.csproj$/i,
    parse: (content, fileName) => {
      const deps = [];
      const pkgRefs = content.matchAll(/<PackageReference\s+Include="([^"]+)"/gi);
      for (const m of pkgRefs) {
        deps.push(m[1]);
      }
      return {
        ecosystem: 'C#',
        file: fileName || '.csproj',
        dependencies: deps,
        devDependencies: [],
        raw: content,
      };
    },
  },
  {
    name: 'Ruby',
    file: 'Gemfile',
    parse: (content) => {
      const deps = [];
      const gemMatches = content.matchAll(/gem\s+['"](\\S+?)['"]/g);
      for (const m of gemMatches) {
        deps.push(m[1]);
      }
      return {
        ecosystem: 'Ruby',
        file: 'Gemfile',
        dependencies: deps,
        devDependencies: [],
        raw: content,
      };
    },
  },
];

// ═══════════════ FRAMEWORK HEURISTICS ═══════════════

/**
 * Import-based framework detection patterns.
 * Scanned when no dependency manifest files are found.
 */
const FRAMEWORK_PATTERNS = [
  // JavaScript / TypeScript
  { pattern: /(?:import|require)\s*\(?['"]react/i,                  framework: 'React' },
  { pattern: /(?:import|require)\s*\(?['"]next/i,                   framework: 'Next.js' },
  { pattern: /(?:import|require)\s*\(?['"]express/i,                framework: 'Express' },
  { pattern: /(?:import|require)\s*\(?['"]vue/i,                    framework: 'Vue.js' },
  { pattern: /(?:import|require)\s*\(?['"]@angular/i,               framework: 'Angular' },
  { pattern: /(?:import|require)\s*\(?['"]svelte/i,                 framework: 'Svelte' },
  { pattern: /(?:import|require)\s*\(?['"]fastify/i,                framework: 'Fastify' },
  { pattern: /(?:import|require)\s*\(?['"]koa/i,                    framework: 'Koa' },
  { pattern: /(?:import|require)\s*\(?['"]nestjs|@nestjs/i,         framework: 'NestJS' },
  // Python
  { pattern: /from\s+flask\b/i,                                     framework: 'Flask' },
  { pattern: /from\s+django\b/i,                                    framework: 'Django' },
  { pattern: /from\s+fastapi\b|import\s+fastapi/i,                  framework: 'FastAPI' },
  { pattern: /import\s+tornado/i,                                    framework: 'Tornado' },
  { pattern: /import\s+streamlit/i,                                  framework: 'Streamlit' },
  { pattern: /import\s+tensorflow|from\s+tensorflow/i,               framework: 'TensorFlow' },
  { pattern: /import\s+torch|from\s+torch/i,                         framework: 'PyTorch' },
  // Rust
  { pattern: /use\s+actix_web/i,                                     framework: 'Actix Web' },
  { pattern: /use\s+rocket/i,                                        framework: 'Rocket' },
  { pattern: /use\s+tokio/i,                                         framework: 'Tokio' },
  // Go
  { pattern: /\"github\.com\/gin-gonic\/gin\"/i,                     framework: 'Gin' },
  { pattern: /\"github\.com\/labstack\/echo\"/i,                     framework: 'Echo' },
  { pattern: /\"github\.com\/gofiber\/fiber\"/i,                     framework: 'Fiber' },
  // Java
  { pattern: /import\s+org\.springframework/i,                       framework: 'Spring' },
  { pattern: /import\s+javax\.servlet/i,                             framework: 'Java Servlets' },
];

// ═══════════════ PUBLIC API ═══════════════

/**
 * Detect dependencies across all supported ecosystems.
 * *** PARALLELIZED — all ecosystem manifest files are fetched concurrently. ***
 *
 * @param {string} owner - GitHub repo owner
 * @param {string} repo - GitHub repo name
 * @param {string[]} filePaths - All file paths from the tree (for .csproj discovery)
 * @returns {{ ecosystems: object[], totalDeps: number, depString: string }}
 */
export const detectDependencies = async (owner, repo, filePaths = []) => {
  // Build fetch promises for ALL ecosystems in parallel
  const fetchPromises = ECOSYSTEMS.map(async (eco) => {
    try {
      // Special case: C# — find first .csproj in tree
      if (eco.filePattern) {
        const csprojFile = filePaths.find((f) => eco.filePattern.test(f));
        if (!csprojFile) return null;
        const content = await fetchFileContent(owner, repo, csprojFile);
        if (!content) return null;
        const parsed = eco.parse(String(content), csprojFile);
        if (parsed && (parsed.dependencies.length > 0 || parsed.devDependencies.length > 0)) {
          return parsed;
        }
        return null;
      }

      const content = await fetchFileContent(owner, repo, eco.file);
      if (!content) return null;
      const parsed = eco.parse(String(content));
      if (parsed && (parsed.dependencies.length > 0 || parsed.devDependencies.length > 0)) {
        return parsed;
      }
      return null;
    } catch (e) {
      return null; // Silently skip ecosystems that fail
    }
  });

  // Wait for ALL ecosystem fetches in parallel
  const settled = await Promise.all(fetchPromises);
  const results = settled.filter(Boolean);

  // Calculate totals
  const totalDeps = results.reduce(
    (sum, r) => sum + r.dependencies.length + r.devDependencies.length,
    0
  );

  // Build a combined dependency string for AI prompts
  const depString = results.length > 0
    ? results
        .map((r) => {
          const deps = r.dependencies.length > 0
            ? `Dependencies: ${r.dependencies.slice(0, 30).join(', ')}`
            : '';
          const devDeps = r.devDependencies.length > 0
            ? `Dev: ${r.devDependencies.slice(0, 15).join(', ')}`
            : '';
          return `[${r.ecosystem} — ${r.file}]\n${deps}${devDeps ? '\n' + devDeps : ''}`;
        })
        .join('\n\n')
    : 'No dependency files found.';

  return { ecosystems: results, totalDeps, depString };
};

/**
 * Detect frameworks from code imports when no dependency files exist.
 * *** PARALLELIZED — all source files are fetched concurrently. ***
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string[]} filePaths
 * @returns {string[]} Detected framework names.
 */
export const detectFrameworksFromImports = async (owner, repo, filePaths) => {
  const codeExtensions = /\.(js|ts|tsx|jsx|py|go|rs|java|rb|cs)$/i;
  const sourceFiles = filePaths
    .filter((f) => codeExtensions.test(f))
    .slice(0, 8); // sample up to 8 files

  const detected = new Set();

  // Fetch all source files in parallel
  const fetchResults = await Promise.all(
    sourceFiles.map(async (file) => {
      try {
        const content = await fetchFileContent(owner, repo, file);
        return content ? String(content).slice(0, 3000) : null;
      } catch {
        return null;
      }
    })
  );

  for (const text of fetchResults) {
    if (!text) continue;
    for (const { pattern, framework } of FRAMEWORK_PATTERNS) {
      if (pattern.test(text)) {
        detected.add(framework);
      }
    }
  }

  return [...detected];
};

// ═══════════════ DEPENDENCY GROUPING ═══════════════

const FRAMEWORK_NAMES = new Set([
  'react', 'react-dom', 'next', 'vue', 'nuxt', '@angular/core', 'svelte',
  'express', 'fastify', 'koa', 'hapi', 'nestjs', '@nestjs/core', '@nestjs/common',
  'flask', 'django', 'fastapi', 'tornado', 'sanic',
  'actix-web', 'rocket', 'axum', 'warp',
  'gin', 'echo', 'fiber',
  'spring-boot', 'spring-core', 'spring-web',
  'rails', 'sinatra',
]);

const BUILD_TOOL_NAMES = new Set([
  'webpack', 'rollup', 'vite', 'esbuild', 'parcel', 'turbo', 'turborepo',
  'babel', '@babel/core', '@babel/preset-env', '@babel/preset-react',
  'gulp', 'grunt', 'snowpack',
  'postcss', 'autoprefixer', 'cssnano', 'sass', 'less',
  'tailwindcss', '@tailwindcss/forms', '@tailwindcss/typography',
  'swc', '@swc/core',
  'tsc', 'tsup', 'unbuild',
]);

const DEV_TOOL_NAMES = new Set([
  'eslint', 'prettier', 'typescript', '@types/node', '@types/react',
  'jest', 'vitest', 'mocha', 'chai', 'sinon', 'nyc', 'c8',
  'cypress', 'playwright', '@playwright/test',
  'husky', 'lint-staged', 'commitlint',
  'nodemon', 'ts-node', 'tsx', 'concurrently',
  'dotenv', 'cross-env',
  'storybook', '@storybook/react',
  'testing-library', '@testing-library/react', '@testing-library/jest-dom',
]);

const CORE_LIB_NAMES = new Set([
  'axios', 'node-fetch', 'got', 'superagent',
  'lodash', 'underscore', 'ramda',
  'moment', 'dayjs', 'date-fns', 'luxon',
  'chalk', 'commander', 'yargs', 'inquirer',
  'uuid', 'nanoid',
  'winston', 'pino', 'morgan', 'bunyan',
  'mongoose', 'sequelize', 'prisma', '@prisma/client', 'typeorm', 'knex',
  'redis', 'ioredis',
  'socket.io', 'ws',
  'jsonwebtoken', 'bcrypt', 'bcryptjs', 'passport',
  'three', 'pixi.js', 'd3', 'chart.js', 'recharts',
  'zustand', 'redux', '@reduxjs/toolkit', 'mobx', 'recoil', 'jotai',
  'react-query', '@tanstack/react-query', 'swr',
  'react-router', 'react-router-dom',
  'framer-motion', 'gsap', 'animejs',
  'zod', 'yup', 'joi', 'ajv',
  'cors', 'helmet', 'compression', 'body-parser', 'cookie-parser',
  'multer', 'sharp', 'jimp',
  'numpy', 'pandas', 'scipy', 'matplotlib',
  'tensorflow', 'torch', 'scikit-learn', 'keras',
  'requests', 'httpx', 'aiohttp', 'beautifulsoup4',
  'sqlalchemy', 'alembic', 'celery',
  'serde', 'tokio', 'reqwest', 'clap',
]);

/**
 * Group detected dependencies into categories.
 *
 * @param {object[]} ecosystems - Parsed ecosystem results from detectDependencies.
 * @returns {{ frameworks: string[], coreLibraries: string[], buildTools: string[], devTools: string[], other: string[] }}
 */
export const groupDependencies = (ecosystems) => {
  const groups = {
    frameworks: [],
    coreLibraries: [],
    buildTools: [],
    devTools: [],
    other: [],
  };

  for (const eco of ecosystems) {
    const allDeps = [...eco.dependencies, ...eco.devDependencies];

    for (const dep of allDeps) {
      const lower = dep.toLowerCase().split(/[:/]/)[0]; // handle scoped packages, Java groupId:artifactId

      if (FRAMEWORK_NAMES.has(lower)) {
        groups.frameworks.push(dep);
      } else if (BUILD_TOOL_NAMES.has(lower)) {
        groups.buildTools.push(dep);
      } else if (DEV_TOOL_NAMES.has(lower)) {
        groups.devTools.push(dep);
      } else if (CORE_LIB_NAMES.has(lower)) {
        groups.coreLibraries.push(dep);
      } else {
        groups.other.push(dep);
      }
    }
  }

  // Deduplicate each group
  for (const key of Object.keys(groups)) {
    groups[key] = [...new Set(groups[key])];
  }

  return groups;
};
