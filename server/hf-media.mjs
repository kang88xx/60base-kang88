import { createHash } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fail } from './security.mjs';

const CHUNK_BYTES = 2097152;
const videoId = uploadId => uploadId.replace(/^up_/, 'vid_');
const chunkKey = (uploadId, offset) => `staging/${uploadId}/${offset}`;
const hash = data => createHash('sha256').update(data).digest('hex');

export function createHfMedia({ storage, checkpoint, assertCurrent }) {
  async function readChunk(key, size, sha) {
    const response = await storage.get(key), chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > size || length > CHUNK_BYTES) fail(503, '업로드 조각을 확인하지 못했습니다.');
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    if (length !== size || hash(data) !== sha) fail(503, '업로드 조각을 확인하지 못했습니다.');
    return data;
  }

  async function writeChunk(store, upload, offset, data) {
    const sha = hash(data), existing = store.one('SELECT * FROM upload_chunks WHERE uploadId=? AND offset=?', upload.id, offset);
    if (existing && (existing.sha !== sha || existing.size !== data.length)) fail(409, '이 위치에 다른 영상 조각이 있습니다. 업로드를 다시 시작해주세요.');
    if (!existing) store.run('INSERT INTO upload_chunks VALUES(?,?,?,?)', upload.id, offset, data.length, sha);
    // Persist intent before storing bytes; interruption leaves a retryable chunk.
    await checkpoint(store);
    try { await storage.put(chunkKey(upload.id, offset), data, { ifNoneMatch: '*' }); }
    catch (error) {
      if (![409, 412].includes(error.status)) throw error;
      await readChunk(chunkKey(upload.id, offset), data.length, sha);
    }
    store.run('UPDATE uploads SET received=received+? WHERE id=? AND received=?', data.length, upload.id, offset);
  }

  async function assemble(store, upload) {
    const file = path.join(store.directory, 'uploads', upload.id);
    const handle = await open(file, 'w', 0o600);
    let offset = 0;
    try {
      for (const chunk of store.all('SELECT * FROM upload_chunks WHERE uploadId=? ORDER BY offset', upload.id)) {
        if (chunk.offset !== offset || offset + chunk.size > upload.total) fail(503, '업로드 조각의 순서를 확인하지 못했습니다.');
        const bytes = await readChunk(chunkKey(upload.id, offset), chunk.size, chunk.sha);
        await handle.writeFile(bytes);
        offset += bytes.length;
      }
      if (offset !== upload.total) fail(409, '업로드가 아직 완료되지 않았습니다.');
    } finally { await handle.close(); }
    return file;
  }

  async function putVideo(upload, file, sha, mime) {
    const id = videoId(upload.id), key = `videos/${id}`;
    try { await storage.putFile(key, file, { sha256: sha, size: upload.total, contentType: mime, ifNoneMatch: '*' }); }
    catch (error) {
      if (![409, 412].includes(error.status)) throw error;
      const response = await storage.get(key), hasher = createHash('sha256');
      let size = 0;
      for await (const bytes of response.body) {
        size += bytes.length;
        if (size > upload.total) fail(503, '저장된 영상 크기가 일치하지 않습니다.');
        hasher.update(bytes);
      }
      if (size !== upload.total || hasher.digest('hex') !== sha) fail(503, '저장된 영상을 확인하지 못했습니다.');
    }
    return { id, key };
  }

  function discardUpload(store, upload, { keepVideo = false } = {}) {
    // The candidate final key is deterministic, so even a crash after PutObject
    // cannot strand an unknown video. Cancellation/expiry removes it as well.
    for (const row of store.all('SELECT offset FROM upload_chunks WHERE uploadId=?', upload.id)) {
      store.run('INSERT OR IGNORE INTO hf_garbage VALUES(?,?)', chunkKey(upload.id, row.offset), store.now());
    }
    if (!keepVideo) store.run('INSERT OR IGNORE INTO hf_garbage VALUES(?,?)', `videos/${videoId(upload.id)}`, store.now());
    store.run('DELETE FROM uploads WHERE id=?', upload.id);
  }

  async function cleanup(store) {
    await checkpoint(store); // durable tombstones before irreversible deletes
    await assertCurrent();
    for (const item of store.all('SELECT key FROM hf_garbage')) {
      try {
        await storage.remove(item.key);
        store.run('DELETE FROM hf_garbage WHERE key=?', item.key);
      } catch { /* Keep the job for the next serialized maintenance pass. */ }
    }
    await checkpoint(store);
  }

  async function serve(req, res, video) {
    if (video.size <= 0) fail(404, '삭제된 영상입니다.');
    let start = 0, end = video.size - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) fail(416, '잘못된 영상 범위입니다.');
      start = match[1] ? Number(match[1]) : Math.max(0, video.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= video.size) fail(416, '잘못된 영상 범위입니다.');
    }
    const range = req.headers.range ? `bytes=${start}-${end}` : undefined;
    const response = await storage.get(video.path, { range });
    const length = end - start + 1;
    if ((range && (response.status !== 206 || response.headers.get('content-range') !== `bytes ${start}-${end}/${video.size}`)) ||
        (!range && response.status !== 200) || Number(response.headers.get('content-length')) !== length) {
      await response.body?.cancel();
      fail(502, '영상 응답을 확인하지 못했습니다.');
    }
    res.writeHead(range ? 206 : 200, { 'Content-Type': video.mime, 'Content-Length': length,
      'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${video.size}` } : {}) });
    const stream = Readable.fromWeb(response.body);
    res.once('close', () => stream.destroy());
    stream.on('error', () => res.destroy()).pipe(res);
  }

  return { writeChunk, assemble, putVideo, discardUpload, cleanup, serve,
    remove: key => storage.remove(key),
    release: file => unlink(file).catch(() => {}) };
}
