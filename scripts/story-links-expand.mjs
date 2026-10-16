#!/usr/bin/env node
// 把指针展开成可读剧情清单（Markdown，只读）：node scripts/story-links-expand.mjs
import { fileURLToPath } from 'node:url';
import { loadInputs, expandStoryLinks } from './story-links.mjs';

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(expandStoryLinks(loadInputs()));
