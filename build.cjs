const { rmSync, mkdirSync, cpSync, readdirSync, execSync } = require('node:fs');
const { join, dirname } = require('node:path');
const esbuild = require('esbuild');

// Bundles the extension into ./dist. Each entrypoint -> a flat [name].js the
// HTML pages and manifest reference. Static assets (HTML, manifest, icons)
// are copied alongside.
const OUT = 'dist';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'icons'), { recursive: true });

esbuild.build({
  entryPoints: [
    'src/background/service-worker.ts',
    'src/options/options.ts',
    'src/app/app.ts',
  ],
  outdir: OUT,
  target: 'chrome130',
  format: 'esm',
  minify: true,
  splitting: true,
  outExtension: { '.js': '.js' },
  publicPath: './',
  bundle: true,
  logLevel: 'error',
}).then(async (result) => {
  if (!result.errors.length) {
    console.log('Build succeeded');
  } else {
    for (const log of result.errors) console.error(log);
    process.exit(1);
  }

  // Shared stylesheet.
  cpSync('src/styles.css', join(OUT, 'styles.css'));

  // HTML pages (kept next to their bundled JS by basename).
  for (const html of ['src/options/options.html', 'src/app/app.html']) {
    cpSync(html, join(OUT, html.split('/').pop()));
  }

  cpSync('manifest.json', join(OUT, 'manifest.json'));

  // Generate icon sizes (16, 48, 128) from public/icons/icon.png.
  // Requires ImageMagick installed.
  const sizes = [16, 48, 128];
  for (const size of sizes) {
    try {
      execSync(`magick convert public/icons/icon.png -resize ${size}x${size} ${OUT}/icons/icon${size}.png`, { stdio: 'ignore' });
    } catch {
      try {
        execSync(`convert public/icons/icon.png -resize ${size}x${size} ${OUT}/icons/icon${size}.png`, { stdio: 'ignore' });
      } catch {
        // ImageMagick not available, skip
      }
    }
  }

  // Copy remaining icons (e.g. logo.png) verbatim.
  try {
    const files = readdirSync('public/icons');
    for (const f of files) {
      if (f === 'icon.png') continue;
      cpSync(join('public/icons', f), join(OUT, 'icons', f));
    }
  } catch {
    // No icons directory
  }

  console.log('Built -> dist/');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});