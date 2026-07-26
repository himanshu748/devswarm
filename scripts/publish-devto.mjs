// Publish BLOG.md to dev.to as a DRAFT via the Forem API.
//
//   DEVTO_API_KEY=... node scripts/publish-devto.mjs
//   DEVTO_API_KEY=... node scripts/publish-devto.mjs --publish            (go live immediately)
//   DEVTO_API_KEY=... node scripts/publish-devto.mjs --update 4231575     (overwrite an existing post)
//
// --update leaves the post's published state exactly as it is, so pushing an
// edit to a draft cannot accidentally publish it and pushing to a live post
// cannot accidentally unpublish it. Add --publish to an update to go live.
//
// Get the key from https://dev.to/settings/extensions under "DEV Community API Keys".
// The API cannot upload images: every image URL in the markdown must already
// resolve publicly, or the post will render with broken images.
import { readFileSync } from 'node:fs';

const KEY = process.env.DEVTO_API_KEY;
if (!KEY) {
  console.error('DEVTO_API_KEY is not set. Generate one at https://dev.to/settings/extensions ("DEV Community API Keys"), then run:\n  DEVTO_API_KEY=your_key node scripts/publish-devto.mjs');
  process.exit(1);
}

const raw = readFileSync(new URL('../BLOG.md', import.meta.url), 'utf8');
const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!m) {
  console.error('BLOG.md is missing its front matter block.');
  process.exit(1);
}

const meta = {};
for (const line of m[1].split('\n')) {
  const kv = line.match(/^(\w+):\s*(.*)$/);
  if (kv) meta[kv[1]] = kv[2].replace(/^"|"$/g, '');
}
const body = m[2].trim();
const publish = process.argv.includes('--publish');
const updateId = process.argv[process.argv.indexOf('--update') + 1];
if (process.argv.includes('--update') && !/^\d+$/.test(updateId || '')) {
  console.error('--update needs the article id, for example: --update 4231575');
  process.exit(1);
}

// Sanity check the image URLs before we ship a post full of broken images.
const urls = [...body.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)].map((x) => x[1]);
const unique = [...new Set([meta.cover_image, ...urls].filter(Boolean))];
console.log(`Checking ${unique.length} image URLs...`);
let broken = 0;
for (const u of unique) {
  try {
    const r = await fetch(u, { method: 'HEAD', redirect: 'follow' });
    if (!r.ok) { console.log(`  BROKEN ${r.status}  ${u}`); broken++; }
  } catch (e) {
    console.log(`  UNREACHABLE  ${u}`);
    broken++;
  }
}
if (broken) {
  console.error(`\n${broken} image URL(s) do not resolve yet. Push docs/blog-images/ (or host them) before publishing, or the post renders with broken images.`);
  if (publish) process.exit(1);
  console.error('Continuing anyway because this is a draft.\n');
} else {
  console.log('  all image URLs resolve\n');
}

const article = {
  title: meta.title,
  body_markdown: body,
  tags: (meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4),
  description: meta.description,
  main_image: meta.cover_image
};
// On update, omitting `published` preserves whatever the post already is.
if (publish || !updateId) article.published = publish;

const res = await fetch(updateId ? `https://dev.to/api/articles/${updateId}` : 'https://dev.to/api/articles', {
  method: updateId ? 'PUT' : 'POST',
  headers: {
    'api-key': KEY,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.forem.api-v1+json'
  },
  body: JSON.stringify({ article })
});

const text = await res.text();
if (!res.ok) {
  console.error(`dev.to returned ${res.status}:\n${text.slice(0, 600)}`);
  process.exit(1);
}
const out = JSON.parse(text);
console.log(updateId ? `Updated article ${updateId} (published: ${out.published}).` : publish ? 'Published.' : 'Draft created (not public yet).');
console.log('  url:  ', out.url);
console.log('  edit: ', `https://dev.to/${out.username || ''}/${out.slug || ''}/edit`);
console.log('  id:   ', out.id);
