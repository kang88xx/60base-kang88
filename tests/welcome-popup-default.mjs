import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/app.mjs';
import { createWelcomePopupService, DEFAULT_WELCOME_POPUP } from '../server/welcome-popup.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-popup-default-'));
const service = createService({ directory, origin: 'http://localhost:4397' });
try {
  assert.equal(createWelcomePopupService(service.store).config().ctaPath, '#missions', 'first filming starts with activity selection');
  const legacy = { ...DEFAULT_WELCOME_POPUP, ctaPath: '#education', body: '촬영 가이드에서 구도와 주의사항을 확인해보세요. 준비가 끝나면 일상의 활동을 촬영할 수 있어요.' };
  const save = value => service.store.run('UPDATE settings SET value=? WHERE key=?', JSON.stringify(value), 'welcomePopup');
  save(legacy);
  const migrated = createWelcomePopupService(service.store).config();
  assert.equal(migrated.ctaPath, '#missions', 'untouched installed default is corrected too');
  assert.equal(migrated.version, legacy.version, 'migration does not restart once-only popup delivery');
  assert.equal(migrated.updatedAt, null);
  for (const customized of [
    { ...legacy, version: 2, updatedAt: '2026-10-15T00:00:00.000Z' },
    { ...legacy, title: '맞춤 교육 안내' },
    { ...legacy, enabled: false },
    { ...legacy, ctaPath: '#guide/dishwashing/1' },
  ]) {
    save(customized);
    assert.deepEqual(createWelcomePopupService(service.store).config(), customized, 'administrator configuration remains authoritative');
  }
  console.log('Popup defaults: activity selection, untouched legacy migration, delivery version and custom configuration preservation passed.');
} finally {
  await service.close();
  await rm(directory, { recursive: true, force: true });
}
