import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadFileInfo } from '../studio/upload-file.js';

test('iPhone original MOV/M4V files with missing generic MIME keep their filename', async () => {
  for (const type of ['', 'application/octet-stream']) {
    for (const [name, mime] of [['IMG_1234.MOV', 'video/quicktime'], ['original.m4v', 'video/mp4'], ['original.mp4', 'video/mp4'], ['original.webm', 'video/webm']]) {
      assert.deepEqual(await uploadFileInfo({ name, type }), { filename: name, mime });
    }
  }
});

test('declared media type is preserved for server-side original validation', async () => {
  assert.deepEqual(await uploadFileInfo({ name: 'original.mov', type: 'video/mp4; codecs=avc1' }), { filename: 'original.mov', mime: 'video/mp4' });
  assert.deepEqual(await uploadFileInfo({ type: 'video/quicktime' }, '촬영 영상'), { filename: '촬영 영상.mov', mime: 'video/quicktime' });
  await assert.rejects(uploadFileInfo({ name: 'fake.mov', type: 'image/png' }), /원본 영상/);
  await assert.rejects(uploadFileInfo({ name: 'unknown', type: '' }), /원본 영상/);
});
