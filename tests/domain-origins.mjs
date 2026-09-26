import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/app.mjs';
import { digest } from '../server/security.mjs';

const productionOrigins = ['https://60base.ai', 'https://60base.kr'];
for (const configuredOrigin of [...productionOrigins, 'http://localhost:4318', 'https://custom.example']) {
  const directory = await mkdtemp(path.join(os.tmpdir(), '60base-domain-origins-'));
  const service = createService({ directory, origin: configuredOrigin });
  try {
    const { store } = service;
    const at = store.now();
    store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)', 'member', 'member@example.test', 'unused', 'member', 'member', at, at);
    store.run('INSERT INTO sessions VALUES(?,?,?,?,?)', digest('test-member'), 'member', 'csrf-member', Date.now() + 3600000, Date.now());
    store.run('INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,path,sha,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', 'video1', 'member', 'dishwashing', 'test', 'test.mp4', 'video/mp4', 10, 300, 640, 480, 3000, 'video1', 'sha1', at);
    await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${service.server.address().port}/api/videos/video1/playback`;
    async function request(origin, { csrf = 'csrf-member', cookie = 'dongjakso_session=test-member' } = {}) {
      return fetch(endpoint, { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', 'X-Forwarded-Host': 'evil.test', 'X-Forwarded-Proto': 'http' }, body: '{}' });
    }
    const allowed = productionOrigins.includes(configuredOrigin) ? productionOrigins : [configuredOrigin];
    for (const origin of allowed) {
      const response = await request(origin);
      assert.equal(response.status, 201, `${configuredOrigin} should accept ${origin}`);
      const playback = new URL((await response.json()).url);
      assert.equal(playback.origin, origin, 'lease uses validated request origin, never forwarded host');
      assert.equal(playback.pathname, '/api/videos/video1/file');
      assert.ok(playback.searchParams.get('playback'));
      assert.equal((await request(origin, { csrf: 'wrong' })).status, 403);
      assert.equal((await request(origin, { csrf: '' })).status, 403);
      assert.equal((await request(origin, { cookie: '' })).status, 401);
    }
    const rejected = ['http://60base.ai', 'http://60base.kr', 'https://60base.ai.evil.test', 'https://60base.kr.evil.test', 'https://60base.ai:444', 'https://60base.ai/', 'null', undefined, ...productionOrigins.filter(origin => !allowed.includes(origin))];
    for (const origin of rejected) assert.equal((await request(origin)).status, 403, `${configuredOrigin} must reject ${origin}`);
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
}
console.log('PASS domain origins: bidirectional production rollout, isolated local/custom config, hostile origin rejection, CSRF/auth guards and same-origin playback leases.');
