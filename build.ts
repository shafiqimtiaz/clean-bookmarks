import { rm, mkdir, cp, readdir } from 'node:fs/promises';
import { join } from 'node:path';

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

// HTML pages (kept next to their bundled JS by basename).
for (const html of ['src/options/options.html', 'src/app/app.html']) {
  await cp(html, join(OUT, html.split('/').pop()!));
}

await cp('manifest.json', join(OUT, 'manifest.json'));

// Icons (copy whatever is in public/icons).
for (const f of await readdir('public/icons').catch(() => [])) {
  await cp(join('public/icons', f), join(OUT, 'icons', f));
}

console.log('Built -> dist/');
