'use strict';

// Run from the site root: node --test tests/ai-brainstem-quest.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const questFile = path.join(root, 'quests/ai-brainstem.html');
const html = fs.readFileSync(questFile, 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const historical = fs.readFileSync(path.join(root, 'quests/rapp-brainstem.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const dataScript = scripts.find(match => /id="questData"/.test(match[1]));
const quest = JSON.parse(dataScript[2]);
const executable = scripts.filter(match => !/application\/json/.test(match[1]));
const withoutScripts = text => text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
const documentHtml = withoutScripts(html);
const ids = text => [...withoutScripts(text).matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(match => match[1]);
const plain = value => JSON.parse(JSON.stringify(value));

const features = {
  'desktop-wizard': [/desktop app/i, /wizard/i, /Sign in with GitHub/, /Copilot access/],
  'form-team': [/child twins/, /Scout/, /Maker/, /fixed main/],
  'rename-switch': [/Planner/, /Edit and Save/, /identity/, /Only children/],
  'twin-workspaces': [/RAPP workspace/, /sandbox/, /mint-once RAPPID/, /not.*security guarantee/],
  'root-organization': [/root RAPP work organization/, /separately minted/, /typed references/],
  'mention-multichat': [/@Scout @Planner/, /iMessage-style/, /sender-labeled/, /participant.*organization/, /identities, not names/],
  'work-panel': [/objectives/, /tasks/, /decisions/, /routines/, /artifacts/, /evidence/, /proposed/],
  'durable-evidence': [/persistence/, /artifact/, /provisional/, /does not.*count|different outcomes|different.*outcomes/],
  'hot-load-agents': [/BookSwapChecklist/, /hot-load/, /invocation/, /quarantined/],
  'hot-load-skills': [/book-swap-review/, /reusable instructions/, /skill-used/, /unavailable/],
  'honest-unload': [/next message/, /cannot run|unavailable/, /stale/, /protected/],
  'semantic-autopilot': [/cursor/, /Stop/, /UI-only/, /main-origin/],
  'clear-keeps-work': [/Clear hides the chat/, /durable workspace evidence/, /not.*privacy erase/],
  'workspace-first': [/workspace-first/, /fixed AI Brainstem main fallback/, /verified evidence/, /bounded/],
  'private-hive': [/explicitly authorize/, /only this text/, /private Hive/, /memory\.save/, /untrusted data/],
  'sdk-neutral-workspace': [/SDK-neutral/, /Copilot SDK.*default seed/, /execution adapter/, /not.*migration|Mapping is not migration/],
  'sdk-sessions-tool-search': [/Infinite sessions/i, /native tool search/i, /0\.80\/0\.95/, /off by default/, /one-use/],
  'approvals-limits': [/AI-credit/, /one-use/, /Exhaustion cancels/, /Put settings in chat/, /does not require approving/],
  'autonomous-wake-routines': [/awake\/asleep/, /disabled/, /per-run credit ceiling/, /total credit ceiling/, /not after Quit/, /not automatically replayed/],
  'usage-files-citations': [/unknown/, /cumulative/, /File tracking/, /session diff/, /fallback/, /Citations/i, /Rewind execution is unavailable/, /telemetry is disabled/],
  'native-agents-canvases': [/Native SDK agents/, /temporary roles/, /no-renderer/, /no-safe-renderer/, /ephemeral/],
  'lazy-workspace-graph': [/lazy graph/, /typed local links/, /derived/, /without links/],
  'successor-generations': [/Antifragile adaptation/, /successor generation/, /immutable seed/, /lineage/, /proposed decision/],
  'backup-fresh-hatch': [/canonical RAPP\/1/, /organism egg/, /neighborhoods/, /verify.*preview/i, /newly minted instance identity/, /stream lineage/, /unavailable/, /§13/, /§8/]
};

function appContext(storage = new Map()) {
  const calls = [];
  const notice = { textContent: '', hidden: true };
  const context = vm.createContext({
    document: {
      getElementById(id) {
        if (id === 'questData') return { textContent: dataScript[2] };
        if (id === 'storageNotice') return notice;
        throw new Error(`Unexpected DOM access in pure logic tests: ${id}`);
      }
    },
    window: {
      localStorage: {
        getItem(key) { calls.push(['read', key]); return storage.get(key) ?? null; },
        setItem(key, value) { calls.push(['write', key]); storage.set(key, value); }
      },
      location: { href: 'https://example.org/tutorial/quests/ai-brainstem.html?private=draft#work-panel' }
    },
    navigator: {},
    URL
  });
  const source = executable.map(match => match[2]).join('\n');
  assert.match(source, /\ninitialize\(\);\s*$/);
  vm.runInContext(source.replace(/\ninitialize\(\);\s*$/, ''), context);
  const api = vm.runInContext('({ STORAGE_KEY, emptyProgress, normalizeProgress, readProgress, saveProgress, progressCounts, withOutcome, positionFor, shareSummary, writeClipboard, openLinkedCheckpoint })', context);
  return { api, context, storage, calls, notice };
}

test('all inline executable scripts compile; data is local and versioned', () => {
  assert.equal(scripts.length, 2);
  for (const [i, match] of executable.entries()) new vm.Script(match[2], { filename: `ai-brainstem:inline-${i}` });
  assert.equal(quest.version, '1.0.0');
  assert.equal(quest.reviewed, '2026-09-16');
  assert.match(documentHtml, /<time datetime="2026-09-16">/);
  assert.match(documentHtml, /Sources.*availability/);
  assert.match(documentHtml, /2417777bf78439eb3201296462c06025db488d81/);
  assert.match(documentHtml, /reviewed revision 2417777/);
  assert.doesNotMatch(documentHtml, /unreleased working changes|linked base revision/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel=["']stylesheet|@import|<iframe\b/i);
  assert.doesNotMatch(executable[0][2], /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
});

test('the current user path contains no command-line, key, or private-path instructions', () => {
  const content = html + '\n' + JSON.stringify(quest);
  const banned = [
    /\b(?:powershell|terminal|localhost|curl|cli|cmd(?:\.exe)?|bash|zsh|wsl)\b/i,
    /\bcommand[\s-]+(?:line|prompt)\b/i,
    /\bapi[\s_-]*keys?\b/i,
    /\b(?:sudo|npm|npx|pip|pip3|python3?|brew|winget|chmod|xcrun|irm|iex)\b/i,
    /\bgit\s+(?:clone|checkout|pull|push|commit)\b/i,
    /\b(?:127\.0\.0\.1|0\.0\.0\.0)\b|https?:\/\/\[::1\]/i,
    /(?:\/Users\/|\/home\/|\/Volumes\/|\\\\[A-Za-z0-9-]+\\|[A-Z]:\\)/,
    /\b(?:edit|modify|open)\s+(?:your\s+|the\s+)?(?:source code|\.env|soul\.md)\b/i,
    /\b(?:GITHUB_TOKEN|BRAINSTEM_SECRET)\b/,
    /\+\d[\d ()-]{9,}\d/
  ];
  for (const pattern of banned) assert.doesNotMatch(content, pattern);
  for (const cp of quest.checkpoints) {
    assert.doesNotMatch(cp.prompt, /```|^\s*(?:[$>]|cd\s|rm\s|mkdir\s)/m);
    assert.ok(cp.prompt.length >= 100, `${cp.id} must have a useful natural-language prompt`);
  }
});

test('all 24 expected lessons teach their features, with actions, evidence, and gates', () => {
  assert.deepEqual(quest.checkpoints.map(cp => cp.id), Object.keys(features));
  assert.equal(quest.phases.length, 6);
  for (const [index, cp] of quest.checkpoints.entries()) {
    assert.match(cp.id, /^[a-z][a-z0-9-]+$/);
    assert.equal(cp.phase, Math.floor(index / 4) + 1);
    for (const key of ['title', 'label', 'time', 'context', 'intro', 'prompt', 'boundary', 'help']) {
      assert.equal(typeof cp[key], 'string', `${cp.id}.${key}`);
      assert.ok(cp[key].trim(), `${cp.id}.${key} must not be blank`);
    }
    assert.ok(cp.actions.length >= 2 && cp.actions.every(text => typeof text === 'string' && text.length > 20));
    assert.ok(cp.outcomes.length >= 2 && cp.outcomes.every(text => typeof text === 'string' && text.length > 20));
    const visible = [cp.intro, cp.prompt, ...cp.actions, ...cp.outcomes, cp.boundary, cp.help].join('\n');
    for (const pattern of features[cp.id]) assert.match(visible, pattern, `${cp.id}: missing ${pattern}`);
    assert.match(visible, /gate|block|unavailable|unsupported/i, `${cp.id}: must address an unavailable result`);
  }
});

test('brand, mobile view, semantic landmarks, and accessibility references are present', () => {
  assert.match(documentHtml, /<title>AI Brainstem — Training Quest<\/title>/);
  assert.match(documentHtml, /<h1 id="questTitle">AI Brainstem/);
  assert.doesNotMatch(html, /RAPP Brainstem|RAPPTER|your rappter/i);
  assert.match(documentHtml, /<nav\b[^>]*aria-label="Quest navigation"/);
  assert.match(documentHtml, /<main\b[^>]*id="mainContent"/);
  assert.match(documentHtml, /id="questMap" aria-label="Desktop checkpoint map"/);
  assert.match(documentHtml, /id="mobileList" aria-label="Mobile checkpoint list"/);
  assert.match(documentHtml, /role="progressbar"/);
  assert.match(documentHtml, /role="status" aria-live="polite"/);
  assert.match(documentHtml, /<dialog\b[^>]*aria-labelledby="panelTitle"/);
  assert.match(documentHtml, /<textarea\b[^>]*id="promptText"[^>]*readonly/);
  assert.match(documentHtml, /data-outcome="verified" aria-pressed="false"/);
  assert.match(documentHtml, /data-outcome="gated" aria-pressed="false"/);
  assert.match(html, /@media\s*\(max-width:\s*960px\)/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /:focus-visible/);
  assert.match(executable[0][2], /showModal\(\)/);
  assert.match(executable[0][2], /ArrowRight/);
  assert.match(executable[0][2], /restoreFocus/);
  const staticIds = new Set(ids(html));
  for (const match of documentHtml.matchAll(/\baria-(?:labelledby|describedby|controls)=["']([^"']+)["']/g)) {
    for (const id of match[1].split(/\s+/)) assert.ok(staticIds.has(id), `Missing ARIA reference ${id}`);
  }
});

test('static and generated IDs are unique; every desktop checkpoint has a map position', () => {
  const all = [
    ...ids(html),
    ...quest.checkpoints.flatMap(cp => [cp.id, 'mobile-' + cp.id]),
    ...quest.phases.map((_, i) => `mobile-phase-${i + 1}`)
  ];
  assert.equal(new Set(all).size, all.length, 'Duplicate page/generated ID');
  const { api } = appContext();
  const positions = quest.checkpoints.map((_, index) => plain(api.positionFor(index)));
  assert.equal(new Set(positions.map(pos => `${pos.x},${pos.y}`)).size, quest.checkpoints.length);
  for (const pos of positions) assert.ok(pos.x > 3 && pos.x < 97 && pos.y >= 18 && pos.y <= 84);
});

test('progress is isolated from the preserved historical quest and survives a reload', () => {
  const oldExpression = historical.match(/const STORAGE_KEY\s*=\s*([^;\n]+);/)[1];
  const oldKey = vm.runInNewContext(oldExpression, { btoa: text => Buffer.from(text).toString('base64') });
  const { api, context, storage, calls } = appContext(new Map([[oldKey, '{"completed":{"first-chat":true}}']]));
  assert.equal(api.STORAGE_KEY, 'ai-brainstem-training-quest:v1');
  assert.notEqual(api.STORAGE_KEY, oldKey);
  assert.deepEqual(plain(api.readProgress()), plain(api.emptyProgress()));
  vm.runInContext('progress = withOutcome(progress, CHECKPOINTS[0].id, "verified"); saveProgress();', context);
  assert.equal(api.readProgress().completed['desktop-wizard'], 'verified');
  assert.equal(storage.get(oldKey), '{"completed":{"first-chat":true}}');
  assert.ok(calls.every(([, key]) => key === api.STORAGE_KEY));
  assert.equal(createHash('sha256').update(historical).digest('hex'), '9a5564cb7d96498265b0dd460eda1627e02ebb0b8dad9092c7d4e6543bcc2057', 'Historical quest must remain byte-for-byte unchanged');
});

test('progress validates stored shapes, rejects unknown outcomes, and tolerates storage failure', () => {
  const { api, context, storage, notice } = appContext();
  for (const bad of [null, [], 3, 'bad', {}, { version: 1, completed: null }, { version: 1, completed: [] }]) {
    assert.deepEqual(plain(api.normalizeProgress(bad)), plain(api.emptyProgress()));
  }
  const normalized = api.normalizeProgress({
    version: 1,
    completed: { 'desktop-wizard': 'verified', 'form-team': ['verified'], 'rename-switch': true, unknown: 'verified' },
    lastVisited: 'unknown',
    completedAt: 'not-a-date'
  });
  assert.deepEqual(plain(normalized.completed), { 'desktop-wizard': 'verified' });
  assert.equal(normalized.lastVisited, null);
  assert.equal(normalized.completedAt, null);
  storage.set(api.STORAGE_KEY, '{broken');
  assert.equal(api.progressCounts(api.readProgress()).reviewed, 0);
  vm.runInContext('window.localStorage.getItem = () => { throw new Error("blocked"); }; window.localStorage.setItem = () => { throw new Error("full"); };', context);
  assert.equal(api.progressCounts(api.readProgress()).reviewed, 0);
  assert.doesNotThrow(() => api.saveProgress());
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /this visit only/);
});

test('verified and gated outcomes toggle independently and completion counts are truthful', () => {
  const { api } = appContext();
  let value = api.emptyProgress();
  const first = quest.checkpoints[0].id;
  value = api.withOutcome(value, first, 'verified');
  value = api.withOutcome(value, first, 'gated');
  assert.deepEqual(plain(api.progressCounts(value)), { verified: 0, gated: 1, reviewed: 1 });
  value = api.withOutcome(value, first, 'gated');
  assert.equal(api.progressCounts(value).reviewed, 0);
  value = api.withOutcome(value, 'unknown', 'verified');
  value = api.withOutcome(value, first, ['verified']);
  assert.equal(api.progressCounts(value).reviewed, 0);
  for (const [i, cp] of quest.checkpoints.entries()) value = api.withOutcome(value, cp.id, i % 2 ? 'gated' : 'verified', '2026-09-16T12:00:00.000Z');
  assert.deepEqual(plain(api.progressCounts(value)), { verified: 12, gated: 12, reviewed: 24 });
  assert.equal(value.completedAt, '2026-09-16T12:00:00.000Z');
  value = api.withOutcome(value, first, 'verified');
  assert.equal(value.completedAt, null);
});

test('share text is count-derived, strips private fragments/queries, and never exposes a file address', () => {
  const { api, context } = appContext();
  vm.runInContext('for (const cp of CHECKPOINTS) progress = withOutcome(progress, cp.id, "gated");', context);
  assert.match(api.shareSummary(), /AI Brainstem Training Quest: 24 checkpoints, 0 outcomes verified and 24 gates recorded/);
  assert.match(api.shareSummary(), /https:\/\/example\.org\/tutorial\/quests\/ai-brainstem\.html$/);
  assert.doesNotMatch(api.shareSummary(), /private=|#work-panel/);
  context.window.location.href = 'file:///training/ai-brainstem.html';
  assert.doesNotMatch(api.shareSummary(), /file:|\/training\//);
});

test('clipboard absence and rejection return an honest fallback rather than a false success', async () => {
  const { api, context } = appContext();
  assert.equal(await api.writeClipboard('A practice prompt'), false);
  context.navigator.clipboard = { writeText: async () => { throw new Error('denied'); } };
  assert.equal(await api.writeClipboard('A practice prompt'), false);
  let copied = '';
  context.navigator.clipboard = { writeText: async text => { copied = text; } };
  assert.equal(await api.writeClipboard('A practice prompt'), true);
  assert.equal(copied, 'A practice prompt');
});

test('checkpoint fragments resolve by ID and ignore malformed or unrelated fragments', () => {
  const { api, context } = appContext();
  vm.runInContext('window.opened = []; openCheckpoint = index => window.opened.push(index);', context);
  for (const [fragment, expected] of [['#work-panel', 6], ['#backup-fresh-hatch', 23], ['#%64esktop-wizard', 0]]) {
    context.window.location.hash = fragment;
    api.openLinkedCheckpoint();
    assert.equal(context.window.opened.at(-1), expected);
  }
  for (const fragment of ['#sourceNote', '#unknown', '#%E0%A4%A']) {
    context.window.location.hash = fragment;
    assert.doesNotThrow(() => api.openLinkedCheckpoint());
  }
  assert.equal(context.window.opened.length, 3);
  assert.match(executable[0][2], /addEventListener\('hashchange', openLinkedCheckpoint\)/);
});

test('all local links in the new quest and site index resolve, including fragments', () => {
  assert.match(index, /href="quests\/ai-brainstem\.html"/);
  assert.match(index, /href="quests\/rapp-brainstem\.html"/);
  assert.match(index, /Current · v1\.0\.0/);
  for (const [file, text] of [[questFile, html], [path.join(root, 'index.html'), index]]) {
    const base = new URL(path.relative(root, file).split(path.sep).join('/'), 'https://site.invalid/');
    for (const match of withoutScripts(text).matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
      const href = match[1].replace(/&amp;/g, '&');
      assert.doesNotMatch(href, /^javascript:/i);
      const url = new URL(href, base);
      if (url.origin !== base.origin) continue;
      let target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      assert.ok(target.startsWith(root + path.sep), `Link escapes site: ${href}`);
      assert.ok(fs.existsSync(target), `Missing local link: ${href}`);
      if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      assert.ok(fs.existsSync(target), `Missing directory index: ${href}`);
      if (url.hash) {
        const fragment = decodeURIComponent(url.hash.slice(1));
        const available = new Set(ids(fs.readFileSync(target, 'utf8')));
        if (target === questFile) quest.checkpoints.forEach(cp => available.add(cp.id));
        assert.ok(available.has(fragment), `Missing fragment: ${href}`);
      }
    }
  }
});

test('existing quest inline scripts still compile alongside the new page', () => {
  for (const name of fs.readdirSync(path.join(root, 'quests')).filter(name => name.endsWith('.html'))) {
    const text = fs.readFileSync(path.join(root, 'quests', name), 'utf8');
    for (const [i, match] of [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].entries()) {
      if (/application\/json/.test(match[1])) JSON.parse(match[2]);
      else if (match[2].trim()) new vm.Script(match[2], { filename: `${name}:inline-${i}` });
    }
  }
});
