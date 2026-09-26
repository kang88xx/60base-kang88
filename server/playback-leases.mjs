import { randomBytes, createHash } from 'node:crypto';
import { fail } from './security.mjs';

// Short-lived media capabilities replace third-party WebView cookies for native
// playback only. A capability cannot authorize API writes or survive logout.
export function createPlaybackLeases(store, { now = Date.now, ttlMs = 2100000 } = {}) {
  const leases = new Map();
  const hash = value => createHash('sha256').update(value).digest('hex');
  function prune() {
    for (const [key, lease] of leases) if (lease.expiresAt <= now()) leases.delete(key);
  }
  function issue(user, session, video) {
    prune();
    if (!session || session.userId !== user.id || user.status !== 'active' ||
        video.userId !== user.id || ['deleted', 'deleting'].includes(video.status)) fail(403, '본인 영상만 재생할 수 있습니다.');
    if (leases.size >= 4096) fail(429, '잠시 후 다시 재생해주세요.');
    // Bound retained capabilities per session without storing any raw tokens.
    const own = [...leases].filter(([, value]) => value.session === session.token);
    while (own.length >= 8) leases.delete(own.shift()[0]);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Math.min(now() + ttlMs, session.expiresAt);
    leases.set(hash(token), { videoId: video.id, userId: user.id, session: session.token, expiresAt });
    return { token, expiresAt };
  }
  function resolve(token, videoId) {
    prune();
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, '영상 재생 권한을 다시 확인해주세요.');
    const lease = leases.get(hash(token));
    if (!lease || lease.videoId !== videoId) fail(401, '영상 재생 권한이 만료되었습니다. 영상을 다시 열어주세요.');
    const session = store.one('SELECT userId FROM sessions WHERE token=? AND expiresAt>?', lease.session, now());
    const user = store.one("SELECT * FROM users WHERE id=? AND status='active'", lease.userId);
    const video = store.one('SELECT * FROM videos WHERE id=? AND userId=?', videoId, lease.userId);
    if (!session || session.userId !== lease.userId || !user || !video || ['deleting', 'deleted'].includes(video.status)) {
      leases.delete(hash(token));
      fail(401, '영상 재생 권한을 다시 확인해주세요.');
    }
    return { user, video };
  }
  return { issue, resolve };
}
