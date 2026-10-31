import fs from 'node:fs';

function quote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

let data = {};
try {
  data = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
} catch {
  // local docker / missing options
}

const token = String(data.admin_token || process.env.ADMIN_TOKEN || '').trim();
const publicBase = String(data.public_base || process.env.PUBLIC_BASE || '')
  .trim()
  .replace(/\/$/, '');

console.log(`export ADMIN_TOKEN=${quote(token)}`);
console.log(`export PUBLIC_BASE=${quote(publicBase)}`);
console.log(`export SITE_URL=${quote(publicBase)}`);
