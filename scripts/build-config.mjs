import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
let local = {};
try { local = Object.fromEntries(readFileSync(root + '.env.local', 'utf8').trim().split('\n').map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; })); } catch {}
const get = key => process.env[key] || local[key];
const config = {
  token: get('NAU_POSTHOG_TOKEN'),
  apiHost: get('NAU_POSTHOG_API_HOST'),
  allowedHost: get('NAU_ALLOWED_HOST'),
  pathPrefix: get('NAU_PATH_PREFIX')
};
if (Object.values(config).some(v => !v)) throw new Error('Missing public analytics deployment configuration');
if (!config.token.startsWith('phc_')) throw new Error('Use only a public capture token, never a personal API key');
if (new URL(config.apiHost).protocol !== 'https:') throw new Error('Analytics requires HTTPS');
writeFileSync(root + 'dist/analytics-config.js', '// Generated public capture configuration. This grants no read access.\nwindow.NAU_ANALYTICS = ' + JSON.stringify(config) + ';\n');
console.log('Public capture configuration generated. No private read credentials are included.');
