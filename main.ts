// DUSK STRIKE — the entrypoint make.fun runs (Node 22, standard library
// only). It hands the game in: game/ and screenshots/ are copied from this
// repository to the output directory, and dossier.json — the summary the
// judge reads — is written with the kit's vendored library, so the dossier
// always matches the files exactly.
//
// Run it locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader MAKEFUN_OUTPUT_DIR is unset and /output is used.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps, from the bounty: the dossier text cap shapes the
// bytes; the rest refuse an entry the scorer would refuse, so failing here
// is failing there — better to find out now.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function copyTree(name: string) {
  const from = join(repo, name);
  const to = join(out, name);
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(out, { recursive: true });
copyTree('game');
copyTree('screenshots');
writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
