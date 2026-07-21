import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

for (const lang of ['ko', 'en']) {
  const tree = JSON.parse(readFileSync(`locales/${lang}.json`, 'utf8'));
  mkdirSync(`locales/${lang}`, { recursive: true });
  for (const [ns, value] of Object.entries(tree)) {
    writeFileSync(`locales/${lang}/${ns}.json`, JSON.stringify({ [ns]: value }, null, 2) + '\n');
  }
  console.log(`${lang}: ${Object.keys(tree).length} namespaces`);
}
