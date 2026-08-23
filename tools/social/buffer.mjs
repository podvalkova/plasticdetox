#!/usr/bin/env node
/**
 * Buffer scheduler for plasticdetox.org
 *
 * Schedules social posts (Pinterest, Instagram, etc.) from a JSON queue file
 * via Buffer's GraphQL API. Media must be publicly reachable, so images are
 * resolved to their plasticdetox.org URL and verified live before scheduling.
 *
 * Commands:
 *   setup                     verify the API key, cache org + channels + boards
 *   channels                  show cached channels and Pinterest boards
 *   check   <queue.json>      validate a queue without sending anything
 *   push    <queue.json>      schedule the queue in Buffer (needs --send)
 *   list                      show what is already scheduled in Buffer
 *   introspect <TypeName>     dump a GraphQL type's fields (for debugging)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SITE = 'https://plasticdetox.org';
const API = 'https://api.buffer.com';
const CONFIG = join(homedir(), '.config', 'plasticdetox', 'buffer.json');
const CHANNELS_CACHE = join(HERE, 'channels.json');
const LEDGER = join(HERE, 'sent.json');
const DEFAULT_TZ = 'America/Los_Angeles';

/* ---------------------------------------------------------------- utils -- */

const c = {
  dim: s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan: s => `\x1b[36m${s}\x1b[0m`,
};

function die(msg) {
  console.error(c.red('Error: ') + msg);
  process.exit(1);
}

function readJSON(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    die(`${path} is not valid JSON: ${e.message}`);
  }
}

function writeJSON(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

function apiKey() {
  if (process.env.BUFFER_API_KEY) return process.env.BUFFER_API_KEY.trim();
  const cfg = readJSON(CONFIG, null);
  if (!cfg || !cfg.apiKey) {
    die(
      `no Buffer API key found.\n\n` +
      `  Create one at ${c.cyan('https://publish.buffer.com/settings/api')} (Settings -> API -> personal key),\n` +
      `  then save it:\n\n` +
      `    mkdir -p ~/.config/plasticdetox\n` +
      `    printf '{"apiKey":"YOUR_KEY"}' > ${CONFIG}\n` +
      `    chmod 600 ${CONFIG}\n\n` +
      `  Or export BUFFER_API_KEY in your shell.`
    );
  }
  return cfg.apiKey.trim();
}

/* -------------------------------------------------------------- graphql -- */

/** Serialize a JS value as a GraphQL literal. Use E('name') for enum values. */
export const E = name => ({ __enum: name });
export function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v); // GraphQL strings escape like JSON
  if (v.__enum) return v.__enum;
  if (Array.isArray(v)) return '[' + v.map(lit).join(', ') + ']';
  const body = Object.entries(v)
    .filter(([, x]) => x !== undefined)
    .map(([k, x]) => `${k}: ${lit(x)}`)
    .join(', ');
  return `{${body}}`;
}

async function gql(query) {
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({ query }),
    });
  } catch (e) {
    die(`could not reach ${API}: ${e.message}`);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    die(`Buffer returned HTTP ${res.status} with a non-JSON body:\n${text.slice(0, 500)}`);
  }
  if (json.errors && json.errors.length) {
    const msgs = json.errors.map(e => '  - ' + e.message).join('\n');
    die(`Buffer rejected the request (HTTP ${res.status}):\n${msgs}`);
  }
  if (!res.ok) die(`Buffer returned HTTP ${res.status}:\n${text.slice(0, 500)}`);
  return json.data;
}

/* --------------------------------------------------------------- time ---- */

/** Milliseconds that `tz` is ahead of UTC at instant `ts`. */
function tzOffset(ts, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
      .formatToParts(new Date(ts))
      .map(p => [p.type, p.value])
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    hour, Number(parts.minute), Number(parts.second)
  );
  return asUTC - ts;
}

/** "2026-08-25 09:00" in `tz` -> "2026-08-25T16:00:00.000Z" */
export function toUtcISO(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(String(local).trim());
  if (!m) throw new Error(`bad time "${local}" (expected "YYYY-MM-DD HH:MM")`);
  const [Y, Mo, D] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const [h, mi] = [Number(m[4] ?? 9), Number(m[5] ?? 0)];
  const naive = Date.UTC(Y, Mo, D, h, mi);
  let ts = naive;
  for (let i = 0; i < 2; i++) ts = naive - tzOffset(ts, tz); // settle DST
  return new Date(ts).toISOString();
}

function fmtLocal(iso, tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(iso));
}

/* ------------------------------------------------------------- channels -- */

async function fetchAccount() {
  const data = await gql(`query { account { id organizations { id name } } }`);
  const orgs = data?.account?.organizations ?? [];
  if (!orgs.length) die('this Buffer account has no organizations.');
  return orgs;
}

async function fetchChannels(orgId) {
  const data = await gql(
    `query { channels(input: ${lit({ organizationId: orgId })}) { id name service } }`
  );
  return data?.channels ?? [];
}

async function fetchPinterestBoards(channelId) {
  const data = await gql(
    `query { channel(input: ${lit({ id: channelId })}) {
        metadata { ... on PinterestMetadata { boards { serviceId name } } }
      } }`
  );
  return data?.channel?.metadata?.boards ?? [];
}

async function cmdSetup() {
  console.log(c.dim('Authenticating with Buffer...'));
  const orgs = await fetchAccount();
  const org = orgs[0];
  if (orgs.length > 1) {
    console.log(c.yellow(`Multiple organizations found; using "${org.name}".`));
  }
  console.log(`Organization: ${c.bold(org.name)} ${c.dim(org.id)}`);

  const channels = await fetchChannels(org.id);
  if (!channels.length) die('no channels connected in Buffer. Connect at least one, then rerun setup.');

  const out = { organizationId: org.id, organizationName: org.name, channels: [] };
  for (const ch of channels) {
    const entry = { id: ch.id, name: ch.name, service: ch.service };
    if (String(ch.service).toLowerCase() === 'pinterest') {
      entry.boards = await fetchPinterestBoards(ch.id);
    }
    out.channels.push(entry);
  }
  writeJSON(CHANNELS_CACHE, out);
  console.log(c.green(`\nSaved ${out.channels.length} channel(s) to ${relative(REPO, CHANNELS_CACHE)}\n`));
  printChannels(out);
}

function loadChannels() {
  const cache = readJSON(CHANNELS_CACHE, null);
  if (!cache) die(`no channel cache. Run ${c.cyan('node tools/social/buffer.mjs setup')} first.`);
  return cache;
}

function printChannels(cache) {
  for (const ch of cache.channels) {
    console.log(`${c.bold(ch.service)}  ${ch.name}  ${c.dim(ch.id)}`);
    for (const b of ch.boards ?? []) {
      console.log(`    board: ${b.name}  ${c.dim(b.serviceId)}`);
    }
  }
}

/** Resolve a queue post's `channel` (service name or channel name) to a channel entry. */
function resolveChannel(cache, want) {
  const w = String(want).toLowerCase();
  const byService = cache.channels.filter(ch => String(ch.service).toLowerCase() === w);
  if (byService.length === 1) return byService[0];
  if (byService.length > 1) {
    throw new Error(`"${want}" matches ${byService.length} channels; use the channel name instead (${byService.map(c2 => c2.name).join(', ')})`);
  }
  const byName = cache.channels.filter(ch => String(ch.name).toLowerCase() === w);
  if (byName.length === 1) return byName[0];
  throw new Error(`no channel matching "${want}". Known: ${cache.channels.map(ch => `${ch.service}/${ch.name}`).join(', ')}`);
}

function resolveBoard(channel, want) {
  const boards = channel.boards ?? [];
  if (!boards.length) throw new Error(`no boards cached for "${channel.name}"; rerun setup`);
  if (!want) {
    throw new Error(`pinterest.board is required. Known boards: ${boards.map(b => b.name).join(', ')}`);
  }
  const w = String(want).toLowerCase();
  const hit = boards.find(b => String(b.name).toLowerCase() === w) ||
              boards.find(b => String(b.serviceId) === String(want));
  if (!hit) throw new Error(`no board "${want}". Known: ${boards.map(b => b.name).join(', ')}`);
  return hit;
}

/* --------------------------------------------------------------- limits -- */

// Caption limits and max images per post, per network.
const LIMITS = {
  pinterest: { text: 500, images: 1, title: 100 },
  instagram: { text: 2200, images: 10 },
  twitter:   { text: 280, images: 4 },
  x:         { text: 280, images: 4 },
  threads:   { text: 500, images: 10 },
  bluesky:   { text: 300, images: 4 },
  mastodon:  { text: 500, images: 4 },
  facebook:  { text: 5000, images: 10 },
  linkedin:  { text: 3000, images: 9 },
  tiktok:    { text: 2200, images: 35 },
};

const isX = s2 => s2 === 'twitter' || s2 === 'x';

/** X shortens every link to a fixed 23 chars, so a naive .length overcounts. */
function weightedLength(text, service) {
  const t = String(text ?? '');
  if (!isX(service)) return [...t].length;
  return [...t.replace(/https?:\/\/\S+/g, 'x'.repeat(23))].length;
}

/* ---------------------------------------------------------------- media -- */

export function imageURL(img) {
  if (/^https?:\/\//i.test(img)) return img;
  const clean = String(img).replace(/^\.?\//, '');
  return SITE + '/' + clean.split('/').map(encodeURIComponent).join('/');
}

export async function verifyImage(url) {
  // Buffer fetches the URL at publish time, so it must be live and permanent.
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'follow' });
    }
    const type = res.headers.get('content-type') || '';
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    if (!/^image\//i.test(type)) return { ok: false, why: `content-type is "${type}", not an image` };
    if (/[?&](X-Amz-Signature|Signature|token)=/i.test(url)) {
      return { ok: false, why: 'looks like a signed/expiring URL; Buffer needs a permanent one' };
    }
    return { ok: true, type, size: Number(res.headers.get('content-length') || 0) };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}

/** Verify every image and turn it into Buffer's assets list. */
async function collectAssets(image, service, problems, warnings, where = 'image') {
  if (image === undefined || image === null) return [];
  const list = Array.isArray(image) ? image : [image];
  const max = LIMITS[service]?.images;
  if (max && list.length > max) {
    problems.push(`${list.length} images in "${where}", but ${service} allows at most ${max}`);
  }
  const assets = [];
  for (const img of list) {
    const url = imageURL(img);
    const v = await verifyImage(url);
    if (!v.ok) {
      const hint = !/^https?:\/\//i.test(img)
        ? `\n        (is ${img} committed and pushed? Buffer can only read public URLs)`
        : '';
      problems.push(`${where} not usable: ${url}\n        ${v.why}${hint}`);
    } else if (v.size > 20 * 1048576) {
      warnings.push(`${img} is ${(v.size / 1048576).toFixed(1)}MB, which some networks reject`);
    }
    assets.push({ image: { url } });
  }
  return assets;
}

/* ---------------------------------------------------------------- queue -- */

async function buildPosts(queuePath) {
  const queue = readJSON(resolve(queuePath), null);
  if (!queue) die(`queue file not found: ${queuePath}`);
  const posts = queue.posts ?? queue;
  if (!Array.isArray(posts)) die('queue file must have a "posts" array.');

  const cache = loadChannels();
  const tz = queue.defaults?.timezone || DEFAULT_TZ;
  const ledger = readJSON(LEDGER, {});
  const seen = new Set();
  const built = [];

  for (const [i, p] of posts.entries()) {
    const label = p.id || `post #${i + 1}`;
    const problems = [];
    const warnings = [];
    let input = null;
    let when = null;

    try {
      if (!p.id) problems.push('missing "id" (needed to avoid double-posting)');
      else if (seen.has(p.id)) problems.push(`duplicate id "${p.id}" in this queue`);
      seen.add(p.id);

      if (!p.text || !String(p.text).trim()) problems.push('missing "text"');

      const channel = resolveChannel(cache, p.channel);
      const service = String(channel.service).toLowerCase();

      // Scheduling: explicit time, or drop into Buffer's own queue slot.
      let mode = E('addToQueue');
      let dueAt;
      if (p.when) {
        dueAt = toUtcISO(p.when, p.timezone || tz);
        mode = E('customScheduled');
        when = dueAt;
        if (new Date(dueAt).getTime() < Date.now()) {
          problems.push(`"when" (${p.when} ${p.timezone || tz}) is in the past`);
        }
      }

      // Media
      const assets = await collectAssets(p.image, service, problems, warnings);
      if (!assets.length && (service === 'pinterest' || service === 'instagram')) {
        problems.push(`${service} posts require an "image"`);
      }

      // Caption length
      const cap = LIMITS[service]?.text;
      let text = String(p.text ?? '').trim();
      if (cap) {
        const n = weightedLength(text, service);
        if (n > cap) {
          problems.push(`text is ${n} characters, over the ${cap} limit for ${service}` +
            (isX(service) ? ' (links count as 23)' : ''));
        }
      }

      // Per-network metadata
      let metadata;
      if (service === 'pinterest') {
        const pin = p.pinterest || {};
        const board = resolveBoard(channel, pin.board);
        if (!pin.title) problems.push('pinterest.title is required');
        else if ([...pin.title].length > LIMITS.pinterest.title) {
          problems.push(`pinterest.title is ${[...pin.title].length} characters, over the ${LIMITS.pinterest.title} limit`);
        }
        if (!pin.url) problems.push('pinterest.url (the destination link) is required');
        metadata = {
          pinterest: { boardServiceId: board.serviceId, title: pin.title, url: pin.url },
        };

      } else if (service === 'instagram') {
        // type and shouldShareToFeed are both required by Buffer.
        const ig = p.instagram || {};
        const type = ig.type || 'post';
        if (!['post', 'reel', 'story', 'carousel'].includes(type)) {
          problems.push(`instagram.type "${type}" is not one of post, reel, story, carousel`);
        }
        metadata = {
          instagram: {
            type: E(type),
            shouldShareToFeed: ig.shouldShareToFeed ?? type !== 'story',
            firstComment: ig.firstComment,
            link: ig.link,
            isAiGenerated: ig.isAiGenerated,
          },
        };

      } else if (isX(service)) {
        const tw = p.twitter || p.x || {};
        if (Array.isArray(tw.thread) && tw.thread.length) {
          // Buffer wants the whole thread here, root first, each replying to the last.
          const thread = [];
          for (const [n, item] of tw.thread.entries()) {
            const where = `thread[${n}].image`;
            const itemText = String(item.text ?? '').trim();
            if (!itemText && !item.image) problems.push(`thread[${n}] has neither text nor image`);
            const len = weightedLength(itemText, service);
            if (len > LIMITS.twitter.text) {
              problems.push(`thread[${n}] is ${len} characters, over the ${LIMITS.twitter.text} limit (links count as 23)`);
            }
            thread.push({
              text: itemText,
              assets: await collectAssets(item.image, service, problems, warnings, where),
            });
          }
          metadata = { twitter: { thread, isAiGenerated: tw.isAiGenerated } };
          // The thread is authoritative, so keep the top-level text as its root.
          text = thread[0].text || text;
        } else if (tw.isAiGenerated !== undefined) {
          metadata = { twitter: { isAiGenerated: tw.isAiGenerated } };
        }
      }

      input = {
        text,
        channelId: channel.id,
        schedulingType: E('automatic'),
        mode,
        dueAt,
        // Both required by CreatePostInput: assets is [AssetInput!]! so a
        // text-only post still has to send an empty list.
        assets,
        needsApproval: false,
        metadata,
      };

      built.push({
        label, id: p.id, channel, when, input, problems, warnings,
        alreadySent: p.id ? ledger[p.id] : null,
      });
    } catch (e) {
      problems.push(e.message);
      built.push({ label, id: p.id, channel: null, when, input, problems, warnings, alreadySent: null });
    }
  }
  return { built, tz };
}

function report({ built, tz }) {
  let bad = 0;
  for (const b of built) {
    const head = b.channel ? `${b.channel.service}/${b.channel.name}` : '?';
    const time = b.when ? fmtLocal(b.when, tz) : 'next open queue slot';
    console.log(`\n${c.bold(b.label)}  ${c.dim(head)}`);
    console.log(`  when: ${time}`);
    if (b.input?.text) {
      const t = b.input.text.replace(/\s+/g, ' ');
      console.log(`  text: ${t.length > 90 ? t.slice(0, 90) + '...' : t}`);
    }
    const imgs = b.input?.assets ?? [];
    if (imgs.length === 1) console.log(`  image: ${c.dim(imgs[0].image.url)}`);
    else if (imgs.length > 1) {
      console.log(`  images: ${imgs.length}`);
      for (const a of imgs) console.log(`    ${c.dim(a.image.url)}`);
    }
    if (b.input?.metadata?.pinterest) {
      const pin = b.input.metadata.pinterest;
      console.log(`  pin: "${pin.title}" -> ${pin.url}`);
    }
    if (b.input?.metadata?.instagram) {
      const ig = b.input.metadata.instagram;
      console.log(`  instagram: ${ig.type.__enum}${ig.shouldShareToFeed ? ', shared to feed' : ''}` +
        (ig.firstComment ? `, first comment set` : ''));
    }
    if (b.input?.metadata?.twitter?.thread) {
      const th = b.input.metadata.twitter.thread;
      console.log(`  thread: ${th.length} posts`);
      th.forEach((t, i) => console.log(`    ${i + 1}. ${String(t.text).replace(/\s+/g, ' ').slice(0, 70)}`));
    }
    if (b.alreadySent) {
      console.log(c.yellow(`  already scheduled on ${b.alreadySent.at} (Buffer post ${b.alreadySent.postId}) — will be skipped`));
    }
    for (const w of b.warnings) console.log(c.yellow(`  warning: ${w}`));
    for (const p of b.problems) { console.log(c.red(`  problem: ${p}`)); bad++; }
  }
  return bad;
}

async function cmdCheck(queuePath) {
  const result = await buildPosts(queuePath);
  const bad = report(result);
  const ready = result.built.filter(b => !b.problems.length && !b.alreadySent).length;
  console.log('');
  if (bad) {
    console.log(c.red(`${bad} problem(s) found. Nothing was sent.`));
    process.exitCode = 1;
  } else {
    console.log(c.green(`All good. ${ready} post(s) ready to schedule.`));
    console.log(c.dim(`Run with --send to schedule them in Buffer.`));
  }
}

function mutationFor(input) {
  return `mutation { createPost(input: ${lit(input)}) {
      ... on PostActionSuccess { post { id dueAt } }
      ... on MutationError { message }
    } }`;
}

async function cmdPush(queuePath, send, verbose, draft) {
  const result = await buildPosts(queuePath);
  const bad = report(result);
  console.log('');
  if (bad) {
    console.log(c.red(`${bad} problem(s) found. Nothing was sent — fix these first.`));
    process.exitCode = 1;
    return;
  }
  const todo = result.built.filter(b => !b.alreadySent);
  if (draft) for (const b of todo) b.input.saveToDraft = true;
  if (!todo.length) {
    console.log(c.yellow('Every post in this queue was already scheduled. Nothing to do.'));
    return;
  }
  if (!send) {
    if (verbose) for (const b of todo) console.log(`\n${c.dim('--- ' + b.label + ' ---')}\n${mutationFor(b.input)}`);
    console.log(c.yellow(`Dry run. ${todo.length} post(s) would be scheduled.`));
    console.log(c.dim('Add --send to actually schedule them.'));
    return;
  }

  // Stay under the Free plan's per-channel queue limit rather than erroring on it.
  const CAP = 10;
  const queued = await queuedByChannel(loadChannels());
  const room = new Map();
  const deferred = [];
  const sendable = [];
  for (const b of todo) {
    const chId = b.channel.id;
    if (!room.has(chId)) room.set(chId, CAP - (queued.get(chId) ?? 0));
    if (room.get(chId) > 0) { room.set(chId, room.get(chId) - 1); sendable.push(b); }
    else deferred.push(b);
  }
  if (deferred.length) {
    console.log(c.yellow(`\n${deferred.length} post(s) held back: those channels are at the ${CAP} post Free plan limit.`));
    for (const b of deferred) console.log(c.dim(`  held: ${b.label} (${b.channel.service})`));
    console.log(c.dim('  They stay in the queue file. Rerun once earlier posts publish.'));
  }

  const ledger = readJSON(LEDGER, {});
  let ok = 0;
  for (const b of sendable) {
    const data = await gql(mutationFor(b.input));
    const res = data?.createPost ?? {};
    if (res.message) {
      console.log(c.red(`  ${b.label}: ${res.message}`));
      continue;
    }
    const post = res.post;
    ledger[b.id] = {
      postId: post.id,
      dueAt: post.dueAt ?? b.when ?? null,
      channel: `${b.channel.service}/${b.channel.name}`,
      at: new Date().toISOString(),
    };
    writeJSON(LEDGER, ledger); // persist after each one, so a crash can't double-post
    ok++;
    console.log(c.green(`  scheduled ${b.label} -> ${post.id}`));
    await new Promise(r => setTimeout(r, 400)); // be gentle with rate limits
  }
  console.log('');
  console.log(c.green(`Scheduled ${ok}/${sendable.length} post(s).`) +
    (deferred.length ? c.yellow(` ${deferred.length} waiting on free slots.`) : ''));
}

/** Buffer Free allows only 10 queued posts per channel, so count what is pending. */
async function queuedByChannel(cache) {
  const data = await gql(
    `query { posts(first: 100, input: ${lit({
        organizationId: cache.organizationId,
        filter: { status: [E('scheduled'), E('draft'), E('needs_approval')] },
      })}) {
        edges { node { id channel { id } } }
      } }`
  );
  const counts = new Map();
  for (const e of data?.posts?.edges ?? []) {
    const id = e.node?.channel?.id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

async function cmdList(all) {
  const cache = loadChannels();
  // organizationId is a top-level PostsInput field, not part of the filter.
  const filter = all ? undefined : { status: [E('scheduled'), E('draft'), E('needs_approval'), E('error')] };
  const data = await gql(
    `query { posts(first: 50, input: ${lit({ organizationId: cache.organizationId, filter })}) {
        edges { node { id text status dueAt channel { name service } } }
      } }`
  );
  const nodes = (data?.posts?.edges ?? []).map(e => e.node);
  if (!nodes.length) { console.log(all ? 'No posts in Buffer.' : 'Nothing upcoming in Buffer.'); return; }
  nodes.sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
  const perCh = new Map();
  for (const n of nodes) {
    const k = n.channel ? `${n.channel.service}/${n.channel.name}` : '?';
    perCh.set(k, (perCh.get(k) ?? 0) + 1);
  }
  for (const n of nodes) {
    const when = n.dueAt ? fmtLocal(n.dueAt, DEFAULT_TZ) : 'queued';
    const ch = n.channel ? `${n.channel.service}/${n.channel.name}` : '?';
    const t = String(n.text || '').replace(/\s+/g, ' ').slice(0, 60);
    console.log(`${when.padEnd(22)} ${String(n.status).padEnd(10)} ${ch.padEnd(24)} ${t}`);
  }
  if (!all) {
    console.log('');
    for (const [k, n] of [...perCh].sort()) {
      console.log(c.dim(`  ${k.padEnd(26)} ${n}/10 slots used, ${10 - n} free`));
    }
  }
}

async function cmdIntrospect(typeName) {
  if (!typeName) die('usage: introspect <TypeName>');
  const data = await gql(`query { __type(name: ${lit(typeName)}) {
      name kind
      fields { name type { name kind ofType { name kind } } }
      inputFields { name type { name kind ofType { name kind } } }
      enumValues { name }
    } }`);
  console.log(JSON.stringify(data.__type, null, 2));
}

/* ----------------------------------------------------------------- main -- */

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

const [, , cmd, ...rest] = process.argv;
const flags = new Set(rest.filter(a => a.startsWith('--')));
const args = rest.filter(a => !a.startsWith('--'));

const USAGE = `
${c.bold('Buffer scheduler')} — preschedule plasticdetox social posts

  node tools/social/buffer.mjs setup                 verify key, cache channels + boards
  node tools/social/buffer.mjs channels              show cached channels and boards
  node tools/social/buffer.mjs check <queue.json>    validate a queue, send nothing
  node tools/social/buffer.mjs push  <queue.json>    dry run
  node tools/social/buffer.mjs push  <queue.json> --send    actually schedule
  node tools/social/buffer.mjs push  <queue.json> --send --draft   save as drafts instead
  node tools/social/buffer.mjs list                  show upcoming posts (--all for sent too)
  node tools/social/buffer.mjs introspect <Type>     dump a GraphQL type (debugging)
`;

if (isMain) try {
  switch (cmd) {
    case 'setup': await cmdSetup(); break;
    case 'channels': printChannels(loadChannels()); break;
    case 'check': await cmdCheck(args[0] || join(HERE, 'queue.json')); break;
    case 'push': await cmdPush(args[0] || join(HERE, 'queue.json'), flags.has('--send'), flags.has('--verbose'), flags.has('--draft')); break;
    case 'list': await cmdList(flags.has('--all')); break;
    case 'introspect': await cmdIntrospect(args[0]); break;
    default: console.log(USAGE);
  }
} catch (e) {
  die(e.stack || e.message);
}
