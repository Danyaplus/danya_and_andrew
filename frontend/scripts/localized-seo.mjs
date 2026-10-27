import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const dist = resolve('dist');
const original = await readFile(join(dist, 'index.html'), 'utf8');
const rootDescription = 'Kodumi Games — безкоштовні онлайн-ігри на двох. Обирай гру, знаходь суперника та грай у браузері в реальному часі.';
const variants = {
  uk: { title: 'Kodumi Games — онлайн-ігри для двох', description: rootDescription, teaser: 'Безкоштовні онлайн-ігри для двох у браузері.' },
  ru: { title: 'Kodumi Games — онлайн-игры на двоих', description: 'Kodumi Games — бесплатные онлайн-игры на двоих. Выбирай игру, находи соперника и играй прямо в браузере.', teaser: 'Бесплатные онлайн-игры на двоих в браузере.' },
  en: { title: 'Kodumi Games — two-player online games', description: 'Kodumi Games offers free online games for two players. Choose a game, find an opponent and play in real time.', teaser: 'Free two-player online games in your browser.' },
};
const basePath = process.env.VITE_BASE_PATH || '/danya_and_andrew/';
const explicitUrl = process.env.VITE_SITE_URL?.trim();
const githubRepo = process.env.GITHUB_REPOSITORY?.split('/');
const inferred = githubRepo?.length === 2 ? `https://${githubRepo[0]}.github.io${basePath}` : '';
const siteRoot = explicitUrl || inferred;
const validSite = /^https?:\/\/[^/]+/i.test(siteRoot);
const rootUrl = validSite ? siteRoot.replace(/\/?$/, '/') : '';
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

for (const [language, copy] of Object.entries(variants)) {
  let html = original.replace('<html lang="uk">', `<html lang="${language}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(copy.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escape(copy.description)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escape(copy.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escape(copy.teaser)}" />`);
  if (rootUrl) {
    const selfUrl = rootUrl + (language === 'uk' ? '' : `${language}/`);
    const links = [
      `<link rel="canonical" href="${escape(selfUrl)}" />`,
      ...Object.keys(variants).map((lang) => `<link rel="alternate" hreflang="${lang}" href="${escape(rootUrl + (lang === 'uk' ? '' : `${lang}/`))}" />`),
      `<link rel="alternate" hreflang="x-default" href="${escape(rootUrl)}" />`,
      `<meta property="og:url" content="${escape(selfUrl)}" />`,
    ].join('\n    ');
    html = html.replace('</head>', `    ${links}\n  </head>`);
  }
  if (language !== 'uk') await mkdir(join(dist, language), { recursive: true });
  await writeFile(join(dist, language === 'uk' ? 'index.html' : `${language}/index.html`), html);
}
const robots = ['User-agent: *', 'Allow: /'];
if (rootUrl) {
  const origin = new URL(rootUrl).origin;
  robots.push(`Sitemap: ${new URL('sitemap.xml', rootUrl).href}`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${Object.keys(variants).map(lang=> {
    const target = rootUrl + (lang === 'uk' ? '' : `${lang}/`);
    const alts = Object.keys(variants).map(other => `    <xhtml:link rel="alternate" hreflang="${other}" href="${escape(rootUrl + (other === 'uk' ? '' : `${other}/`))}" />`).join('\n');
    return `  <url>\n    <loc>${escape(target)}</loc>\n${alts}\n  </url>`;
  }).join('\n')}\n</urlset>\n`;
  await writeFile(join(dist, 'sitemap.xml'), xml);
  console.log(`[seo] Language pages, sitemap and canonical URLs generated for ${origin}`);
} else {
  console.warn('[seo] VITE_SITE_URL unset. Language pages created; sitemap/canonical at build time require a public URL.');
}
await writeFile(join(dist, 'robots.txt'), robots.join('\n') + '\n');
