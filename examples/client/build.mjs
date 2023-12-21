import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['./index.ts'],
  bundle: true,
  platform: 'node',
  outfile: './index.js',
});
