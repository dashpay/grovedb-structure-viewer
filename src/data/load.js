import { validateStructure, isRepoPath } from './validate.js';

const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{7,40}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/;
const MAX_BYTES = 4 * 1024 * 1024;

export class BadSource extends Error {}

/** A branch, tag or commit of the configured repository */
export function parseRef(value) {
  if (typeof value !== 'string' || !REF.test(value) || value.includes('..') || value.includes('//')) {
    throw new BadSource('That ref is not a branch, tag or commit name.');
  }
  return value;
}

/**
 * The head of a pull request: `owner/repo@sha`, or a bare ref of the
 * configured repository. A fork can only be named by a full commit, so a
 * link always shows the same data.
 */
export function parseSource(value, config) {
  if (typeof value !== 'string') throw new BadSource('Missing source.');
  const at = value.lastIndexOf('@');
  if (at === -1) return { repo: config.repo, ref: parseRef(value), foreign: false };
  const repo = value.slice(0, at);
  const sha = value.slice(at + 1);
  if (!REPO.test(repo) || repo.includes('..')) throw new BadSource('That is not a GitHub repository name.');
  if (!SHA.test(sha)) throw new BadSource('A fork must be named by a commit, as owner/repo@sha.');
  return { repo, ref: sha, foreign: repo.toLowerCase() !== config.repo.toLowerCase() };
}

export function rawUrl(source, config) {
  if (!isRepoPath(config.structurePath)) throw new BadSource('Bad structure path in config.json.');
  return `https://raw.githubusercontent.com/${source.repo}/${source.ref}/${config.structurePath}`;
}

/** Where a repository file of the viewed source can be read on GitHub */
export function blobUrl(source, path) {
  if (!isRepoPath(path)) return null;
  return `https://github.com/${source.repo}/blob/${source.ref}/${path}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', cache: 'no-cache' });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  const body = await response.text();
  if (body.length > MAX_BYTES) throw new Error('The structure file is too large.');
  return JSON.parse(body);
}

/** Loads and validates the structure of a source */
export async function loadStructure(source, config) {
  return validateStructure(await fetchJson(rawUrl(source, config)));
}

/** A file served next to the viewer: the bundled snapshot, or a test fixture on localhost */
export async function loadLocal(path) {
  if (typeof path !== 'string' || !/^(\.\/)?[A-Za-z0-9_][A-Za-z0-9_./-]*\.json$/.test(path) || path.includes('..')) {
    throw new BadSource('Bad local path.');
  }
  return validateStructure(await fetchJson(new URL(path, document.baseURI).href));
}

export async function loadConfig() {
  const config = await fetchJson(new URL('./config.json', document.baseURI).href);
  if (!REPO.test(config.repo) || !isRepoPath(config.structurePath)) throw new Error('config.json is invalid.');
  config.defaultRef = parseRef(config.defaultRef);
  config.refs = (Array.isArray(config.refs) ? config.refs : []).map(parseRef);
  if (typeof config.bookUrl !== 'string' || !/^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._/-]*$/.test(config.bookUrl)) config.bookUrl = null;
  return config;
}
