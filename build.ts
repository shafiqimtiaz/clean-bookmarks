import { rm, mkdir, cp, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

// Bundles the extension into ./dist. Each entrypoint -> a flat [name].js the
// HTML pages and manifest reference. Static assets (HTML, manifest, icons)
// are copied alongside.
const OUT = 'dist';

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'icons'), { recursive: true });

const result = await Bun.build({
  entrypoints: [
    'src/background/service-worker.ts',
    'src/options/options.ts',
    'src/app/app.ts',
  ],
  outdir: OUT,
  target: 'browser',
  format: 'esm',
  minify: true,
  naming: '[name].[ext]',
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Shared stylesheet.
await cp('src/styles.css', join(OUT, 'styles.css'));

// HTML pages (kept next to their bundled JS by basename).
for (const html of ['src/options/options.html', 'src/app/app.html']) {
  await cp(html, join(OUT, html.split('/').pop()!));
}

await cp('manifest.json', join(OUT, 'manifest.json'));

// Generate icon sizes (16, 48, 128) from public/icons/icon.png.
const sizes = [16, 48, 128];
for (const size of sizes) {
  await $`convert public/icons/icon.png -resize ${size}x${size} ${OUT}/icons/icon${size}.png`;
}

// Copy remaining icons (e.g. logo.png) verbatim.
for (const f of await readdir('public/icons').catch(() => [])) {
  if (f === 'icon.png') continue;
  await cp(join('public/icons', f), join(OUT, 'icons', f));
}

console.log('Built -> dist/');
