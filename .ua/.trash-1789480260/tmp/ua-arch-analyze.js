#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) fail('Usage: node ua-arch-analyze.js <input.json> <output.json>');

let data;
try {
  data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (e) {
  fail('Failed to read/parse input JSON: ' + e.message);
}

const fileNodes = data.fileNodes || [];
const importEdges = data.importEdges || [];
const allEdges = data.allEdges || [];

const nodeById = new Map();
for (const n of fileNodes) nodeById.set(n.id, n);

// --- A. Directory Grouping ---
function dirOf(fp) {
  const idx = fp.lastIndexOf('/');
  return idx === -1 ? '' : fp.slice(0, idx);
}

const allPaths = fileNodes.map(n => n.filePath || '');

function commonPrefix(paths) {
  if (paths.length === 0) return '';
  let prefix = paths[0].split('/');
  for (let i = 1; i < paths.length; i++) {
    const parts = paths[i].split('/');
    let j = 0;
    while (j < prefix.length && j < parts.length - 1 && prefix[j] === parts[j]) j++;
    // -1 to avoid consuming the filename itself when path has no dir
    prefix = prefix.slice(0, j);
    if (prefix.length === 0) break;
  }
  return prefix.length ? prefix.join('/') + '/' : '';
}

// compute common prefix based on directory parts only (exclude filenames)
function commonDirPrefix(paths) {
  const dirParts = paths.map(p => {
    const d = dirOf(p);
    return d ? d.split('/') : [];
  });
  if (dirParts.length === 0) return [];
  let prefix = dirParts[0].slice();
  for (let i = 1; i < dirParts.length; i++) {
    const parts = dirParts[i];
    let j = 0;
    while (j < prefix.length && j < parts.length && prefix[j] === parts[j]) j++;
    prefix = prefix.slice(0, j);
    if (prefix.length === 0) break;
  }
  return prefix;
}

const prefixParts = commonDirPrefix(allPaths);
const prefixStr = prefixParts.length ? prefixParts.join('/') + '/' : '';

function groupKeyFor(fp) {
  let rest = fp;
  if (prefixStr && rest.startsWith(prefixStr)) rest = rest.slice(prefixStr.length);
  const segs = rest.split('/');
  if (segs.length === 1) {
    // flat file directly under prefix (or root) - group by extension pattern
    const fname = segs[0];
    const m = fname.match(/\.test\.|\.spec\./);
    if (m) return 'test';
    if (/\.config\./.test(fname)) return 'config';
    const extMatch = fname.match(/\.([a-zA-Z0-9]+)$/);
    return extMatch ? '(root:' + extMatch[1] + ')' : '(root)';
  }
  return segs[0];
}

const directoryGroups = {};
for (const n of fileNodes) {
  const key = groupKeyFor(n.filePath || n.name || '');
  if (!directoryGroups[key]) directoryGroups[key] = [];
  directoryGroups[key].push(n.id);
}

// --- B. Node Type Grouping ---
const nodeTypeGroups = {};
for (const n of fileNodes) {
  const t = n.type || 'unknown';
  if (!nodeTypeGroups[t]) nodeTypeGroups[t] = [];
  nodeTypeGroups[t].push(n.id);
}

// --- C. Import Adjacency Matrix ---
const fileFanOut = {};
const fileFanIn = {};
const importAdj = new Map(); // id -> Set(targets)

for (const e of importEdges) {
  if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
  fileFanOut[e.source] = (fileFanOut[e.source] || 0) + 1;
  fileFanIn[e.target] = (fileFanIn[e.target] || 0) + 1;
  if (!importAdj.has(e.source)) importAdj.set(e.source, new Set());
  importAdj.get(e.source).add(e.target);
}

// id -> group
const idToGroup = {};
for (const [g, ids] of Object.entries(directoryGroups)) {
  for (const id of ids) idToGroup[id] = g;
}

const groupImportsFrom = {}; // group -> Set(groups it imports from)
const groupImportedBy = {}; // group -> Set(groups that import it)

for (const e of importEdges) {
  if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
  const sg = idToGroup[e.source];
  const tg = idToGroup[e.target];
  if (!sg || !tg) continue;
  if (!groupImportsFrom[sg]) groupImportsFrom[sg] = new Set();
  groupImportsFrom[sg].add(tg);
  if (!groupImportedBy[tg]) groupImportedBy[tg] = new Set();
  groupImportedBy[tg].add(sg);
}

// --- D. Cross-Category Dependency Analysis ---
const crossCategoryMap = new Map(); // key: fromType|toType|edgeType -> count
for (const e of allEdges) {
  const s = nodeById.get(e.source);
  const t = nodeById.get(e.target);
  if (!s || !t) continue;
  if (s.type === t.type) continue; // focus on cross-category (node type) edges
  const key = `${s.type}|${t.type}|${e.type}`;
  crossCategoryMap.set(key, (crossCategoryMap.get(key) || 0) + 1);
}
const crossCategoryEdges = [];
for (const [key, count] of crossCategoryMap.entries()) {
  const [fromType, toType, edgeType] = key.split('|');
  crossCategoryEdges.push({ fromType, toType, edgeType, count });
}
crossCategoryEdges.sort((a, b) => b.count - a.count);

// --- E. Inter-Group Import Frequency ---
const interGroupMap = new Map(); // "from|to" -> count
for (const e of importEdges) {
  if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
  const sg = idToGroup[e.source];
  const tg = idToGroup[e.target];
  if (!sg || !tg) continue;
  const key = `${sg}|${tg}`;
  interGroupMap.set(key, (interGroupMap.get(key) || 0) + 1);
}
const interGroupImports = [];
for (const [key, count] of interGroupMap.entries()) {
  const [from, to] = key.split('|');
  interGroupImports.push({ from, to, count });
}
interGroupImports.sort((a, b) => b.count - a.count);

// --- F. Intra-Group Import Density ---
const intraGroupDensity = {};
for (const g of Object.keys(directoryGroups)) {
  let internalEdges = 0;
  let totalEdges = 0;
  for (const e of importEdges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    const sg = idToGroup[e.source];
    const tg = idToGroup[e.target];
    if (sg !== g && tg !== g) continue;
    totalEdges++;
    if (sg === g && tg === g) internalEdges++;
  }
  intraGroupDensity[g] = {
    internalEdges,
    totalEdges,
    density: totalEdges > 0 ? +(internalEdges / totalEdges).toFixed(3) : 0
  };
}

// --- G. Directory Pattern Matching ---
const dirPatternTable = [
  [['routes', 'api', 'controllers', 'endpoints', 'handlers', 'controller', 'routers', 'blueprints'], 'api'],
  [['services', 'core', 'lib', 'domain', 'logic', 'signals', 'internal', 'composables'], 'service'],
  [['models', 'db', 'data', 'persistence', 'repository', 'entities', 'migrations', 'entity', 'sql', 'database', 'schema'], 'data'],
  [['components', 'views', 'pages', 'ui', 'layouts', 'screens'], 'ui'],
  [['middleware', 'plugins', 'interceptors', 'guards'], 'middleware'],
  [['utils', 'helpers', 'common', 'shared', 'tools', 'templatetags', 'pkg'], 'utility'],
  [['config', 'constants', 'env', 'settings', 'management', 'commands'], 'config'],
  [['__tests__', 'test', 'tests', 'spec', 'specs'], 'test'],
  [['types', 'interfaces', 'schemas', 'contracts', 'dtos', 'dto', 'request', 'response'], 'types'],
  [['hooks'], 'hooks'],
  [['store', 'state', 'reducers', 'actions', 'slices'], 'state'],
  [['assets', 'static', 'public'], 'assets'],
  [['serializers'], 'api'],
  [['cmd', 'bin'], 'entry'],
  [['docs', 'documentation', 'wiki'], 'documentation'],
  [['deploy', 'deployment', 'infra', 'infrastructure', 'k8s', 'kubernetes', 'helm', 'charts', 'terraform', 'tf', 'docker'], 'infrastructure'],
  [['.github', '.gitlab', '.circleci'], 'ci-cd'],
  [['mailers', 'jobs', 'channels'], 'service']
];

function matchDirPattern(dirName) {
  const lower = dirName.toLowerCase();
  for (const [names, label] of dirPatternTable) {
    if (names.includes(lower)) return label;
  }
  return null;
}

const patternMatches = {};
for (const g of Object.keys(directoryGroups)) {
  const m = matchDirPattern(g);
  if (m) patternMatches[g] = m;
}

// --- H. Deployment Topology Detection ---
const infraFiles = [];
let hasDockerfile = false, hasCompose = false, hasK8s = false, hasTerraform = false, hasCI = false;
for (const n of fileNodes) {
  const fp = n.filePath || '';
  const base = path.posix.basename(fp);
  if (/^Dockerfile/i.test(base)) { hasDockerfile = true; infraFiles.push(fp); }
  else if (/docker-compose/i.test(base)) { hasCompose = true; infraFiles.push(fp); }
  else if (/\.ya?ml$/.test(base) && /k8s|kubernetes/i.test(fp)) { hasK8s = true; infraFiles.push(fp); }
  else if (/\.tf$|\.tfvars$/.test(base)) { hasTerraform = true; infraFiles.push(fp); }
  else if (/^\.github\/workflows\//.test(fp) || /\.gitlab-ci\.yml$/.test(base) || /^Jenkinsfile$/.test(base)) { hasCI = true; infraFiles.push(fp); }
  else if (/^vercel\.json$/.test(base) || /^Makefile$/.test(base)) { infraFiles.push(fp); }
}

// --- I. Data Pipeline Detection ---
const schemaFiles = [];
const migrationFiles = [];
const dataModelFiles = [];
const apiHandlerFiles = [];
for (const n of fileNodes) {
  const fp = n.filePath || '';
  const tags = Array.isArray(n.tags) ? n.tags : [];
  if (/\.sql$/.test(fp)) {
    if (/migrations?\//.test(fp)) migrationFiles.push(fp);
    else schemaFiles.push(fp);
  }
  if (/\.graphql$|\.gql$|\.proto$|\.prisma$/.test(fp)) schemaFiles.push(fp);
  if (tags.includes('data-model') || /models?\//.test(fp) || /types\/database/.test(fp)) dataModelFiles.push(fp);
  if (/route\.ts$/.test(fp) || tags.includes('api-handler')) apiHandlerFiles.push(fp);
}

// --- J. Documentation Coverage ---
const groupsWithDocs = new Set();
const docFilePaths = new Set(fileNodes.filter(n => n.type === 'document' || /\.md$|\.rst$/.test(n.filePath || '')).map(n => n.filePath));
for (const g of Object.keys(directoryGroups)) {
  for (const id of directoryGroups[g]) {
    const n = nodeById.get(id);
    if (!n) continue;
    const fp = n.filePath || '';
    const base = path.posix.basename(fp);
    if (/^README/i.test(base) || n.type === 'document') {
      groupsWithDocs.add(g);
    }
  }
}
const totalGroups = Object.keys(directoryGroups).length;
const undocumentedGroups = Object.keys(directoryGroups).filter(g => !groupsWithDocs.has(g));
const docCoverage = {
  groupsWithDocs: groupsWithDocs.size,
  totalGroups,
  coverageRatio: totalGroups > 0 ? +(groupsWithDocs.size / totalGroups).toFixed(3) : 0,
  undocumentedGroups
};

// --- K. Dependency Direction ---
const dependencyDirection = [];
const seenPairs = new Set();
for (const { from, to, count } of interGroupImports) {
  if (from === to) continue;
  const pairKey = [from, to].sort().join('|');
  if (seenPairs.has(pairKey)) continue;
  seenPairs.add(pairKey);
  const reverseCount = interGroupMap.get(`${to}|${from}`) || 0;
  if (count > reverseCount) {
    dependencyDirection.push({ dependent: from, dependsOn: to });
  } else if (reverseCount > count) {
    dependencyDirection.push({ dependent: to, dependsOn: from });
  }
}

// --- fileStats ---
const filesPerGroup = {};
for (const [g, ids] of Object.entries(directoryGroups)) filesPerGroup[g] = ids.length;
const nodeTypeCounts = {};
for (const [t, ids] of Object.entries(nodeTypeGroups)) nodeTypeCounts[t] = ids.length;

const result = {
  scriptCompleted: true,
  directoryGroups,
  nodeTypeGroups,
  crossCategoryEdges,
  interGroupImports,
  intraGroupDensity,
  patternMatches,
  deploymentTopology: {
    hasDockerfile, hasCompose, hasK8s, hasTerraform, hasCI,
    infraFiles: Array.from(new Set(infraFiles))
  },
  dataPipeline: {
    schemaFiles: Array.from(new Set(schemaFiles)),
    migrationFiles: Array.from(new Set(migrationFiles)),
    dataModelFiles: Array.from(new Set(dataModelFiles)),
    apiHandlerFiles: Array.from(new Set(apiHandlerFiles))
  },
  docCoverage,
  dependencyDirection,
  fileStats: {
    totalFileNodes: fileNodes.length,
    filesPerGroup,
    nodeTypeCounts
  },
  fileFanIn,
  fileFanOut
};

try {
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
} catch (e) {
  fail('Failed to write output JSON: ' + e.message);
}

console.log('OK: analysis written to ' + outputPath);
process.exit(0);
