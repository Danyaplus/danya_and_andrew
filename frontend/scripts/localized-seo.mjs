import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Output is written into Vite's dist and therefore published by GitHub Pages.
const dist = resolve('dist');
const original = await readFile(join(dist, 'index.html'), 'utf8');
const variants = {
  uk: {
    title: 'Kodumi Games — онлайн-ігри для двох',
    description: 'Kodumi Games — безкоштовні онлайн-ігри на двох. Обирай гру, знаходь суперника та грай у браузері в реальному часі.',
    teaser: 'Безкоштовні онлайн-ігри для двох у браузері.',
    locale: 'uk_UA',
  },
  ru: {
    title: 'Kodumi Games — онлайн-игры на двоих',
    description: 'Kodumi Games — бесплатные онлайн-игры на двоих. Выбирай игру, находи соперника и играй прямо в браузере.',
    teaser: 'Бесплатные онлайн-игры на двоих в браузере.',
    locale: 'ru_RU',
  },
  en: {
    title: 'Kodumi Games — two-player online games',
    description: 'Kodumi Games offers free online games for two players. Choose a game, find an opponent and play in real time.',
    teaser: 'Free two-player online games in your browser.',
    locale: 'en_US',
  },
};

// The public GitHub Pages address is a project path, NOT the hostname root.
// An eventual custom domain can be configured with VITE_SITE_URL.
const repo = process.env.GITHUB_REPOSITORY?.split('/');
const basePath = `/${(process.env.VITE_BASE_PATH || '/danya_and_andrew/').replace(/^\/+|\/+$/g, '')}/`;
const inferredUrl = repo?.length === 2 && repo[0] && repo[1]
  ? `https://${repo[0]}.github.io${basePath}`
  : 'https://danyaplus.github.io/danya_and_andrew/';
const siteUrl = process.env.VITE_SITE_URL?.trim() || inferredUrl;
let root;
try {
  root = new URL(siteUrl);
  if (!['https:', 'http:'].includes(root.protocol)) throw new Error('Invalid protocol');
  root.search = '';
  root.hash = '';
  root.pathname = root.pathname.replace(/\/+$/, '') + '/';
} catch {
  throw new Error(`[seo] Invalid VITE_SITE_URL: ${siteUrl}`);
}

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const urlFor = (lang) => new URL(lang === 'uk' ? './' : `${lang}/`, root).href;
const languages = Object.keys(variants);
const alternates = languages.map((lang) =>
  `<link rel="alternate" hreflang="${lang}" href="${escapeXml(urlFor(lang))}" />`);
alternates.push(`<link rel="alternate" hreflang="x-default" href="${escapeXml(urlFor('uk'))}" />`);

for (const [language, copy] of Object.entries(variants)) {
  let html = original
    .replace(/<html lang="[^"]*">/, `<html lang="${language}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeXml(copy.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeXml(copy.description)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeXml(copy.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeXml(copy.teaser)}" />`);
  const metadata = [
    `<link rel="canonical" href="${escapeXml(urlFor(language))}" />`,
    ...alternates,
    `<meta property="og:url" content="${escapeXml(urlFor(language))}" />`,
    `<meta property="og:locale" content="${copy.locale}" />`,
    '<meta name="twitter:card" content="summary" />',
  ].join('\n    ');
  html = html.replace('</head>', `    ${metadata}\n  </head>`);
  const outputFolder = language === 'uk' ? dist : join(dist, language);
  await mkdir(outputFolder, { recursive: true });
  await writeFile(join(outputFolder, 'index.html'), html, 'utf8');
}

const alternateForSitemap = languages.map((lang) =>
  `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(urlFor(lang))}" />`);
alternateForSitemap.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(urlFor('uk'))}" />`);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${languages.map((language) => `  <url>\n    <loc>${escapeXml(urlFor(language))}</loc>\n${alternateForSitemap.join('\n')}\n  </url>`).join('\n')}
</urlset>
`;
await writeFile(join(dist, 'sitemap.xml'), sitemap, 'utf8');

// On GitHub Pages project sites, /project/robots.txt is *not* the origin-level
// /robots.txt requested by search crawlers. It is included for project-level
// tooling; to set origin-wide crawl rules publish robots at danyaplus.github.io/robots.txt.
const robots = [
  'User-agent: *',
  `Allow: ${root.pathname}`,
  '',
  `Sitemap: ${new URL('sitemap.xml', root).href}`,
  '',
].join('\n');
await writeFile(join(dist, 'robots.txt'), robots, 'utf8');
console.log(`[seo] ${languages.length} locale pages, sitemap.xml and project robots.txt for ${root.href}`);
