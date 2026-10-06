import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function waitForServer(baseUrl, child, errors) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Máy chủ dừng sớm: ${errors.join('')}`);
    try { const response = await fetch(`${baseUrl}/api/bootstrap`); if (response.ok) return; }
    catch { /* Chờ máy chủ thử nghiệm khởi động. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Máy chủ thử nghiệm không khởi động: ${errors.join('')}`);
}

test('luồng phản hồi → quyết định → phiên bản truyện → kịch bản', { timeout: 15000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'living-drama-test-'));
  const port = 20000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: root,
    env: { ...process.env, ARK_API_KEY: '', JEV_API_KEY: '', PORT: String(port), LIVING_DRAMA_DB: join(temp, 'demo.sqlite'), LIVING_DRAMA_MEDIA: join(temp, 'uploads') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const errors = [];
  child.stderr.on('data', (chunk) => errors.push(chunk.toString()));
  const call = async (path, body) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, value: await response.json() };
  };
  try {
    await waitForServer(base, child, errors);
    const initial = await (await fetch(`${base}/api/bootstrap`)).json();
    assert.equal(initial.comments.length, 36);
    assert.equal(initial.state.version, 1);
    assert.equal(initial.visual_bible.version, 1);
    const visualChange = structuredClone(initial.visual_bible);
    visualChange.location = 'Nhà hàng cạnh cửa sổ, bàn số 7 dưới ngọn đèn vàng ổn định.';
    const updateVisual = await fetch(`${base}/api/visual-bible`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(visualChange), signal: AbortSignal.timeout(5000),
    });
    assert.equal(updateVisual.status, 200);
    assert.equal((await updateVisual.json()).version, 2);
    assert.equal((await call('/api/mind')).status, 201);
    const decisionResult = await call('/api/decisions');
    assert.equal(decisionResult.status, 201);
    const decisionId = decisionResult.value.decision_id;
    assert.equal(decisionResult.value.options.length, 3);
    const invalid = await call(`/api/decisions/${decisionId}/approve`, { option_id: 'C', rationale: 'Tôi muốn hé lộ bí mật ngay.' });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.value.code, 'HARD_RULE_FAILED');
    assert.equal((await call(`/api/decisions/${decisionId}/approve`, { option_id: 'B', rationale: 'Giữ bí mật và tăng căng thẳng.' })).status, 200);
    assert.equal((await call(`/api/decisions/${decisionId}/commit`)).value.state_version, 2);
    assert.equal((await call(`/api/decisions/${decisionId}/commit`)).value.state_version, 2);
    assert.equal((await call('/api/plan')).status, 201);
    const current = await (await fetch(`${base}/api/bootstrap`)).json();
    assert.equal(current.state.secrets.girl_identity, 'hidden');
    assert.equal(current.state.characters.linh.has_recording, true);
    assert.equal(current.episodes[1].plan.canonical_state_version, 2);
    assert.equal((await call('/api/plan/approve-script')).status, 200);
    const withoutKey = await call('/api/visual-assets', { kind: 'character', subject_id: 'linh' });
    assert.equal(withoutKey.status, 503);
    assert.equal(withoutKey.value.code, 'KEY_REQUIRED');
    const publishTooEarly = await call('/api/publish');
    assert.equal(publishTooEarly.status, 422);
    assert.equal(publishTooEarly.value.code, 'APPROVAL_REQUIRED');
    const sampleBytes = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(256)]);
    const upload = await fetch(`${base}/api/video`, {
      method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: sampleBytes, signal: AbortSignal.timeout(5000),
    });
    assert.equal(upload.status, 201); // Kiểm luồng HTTP; mẫu này không dùng để kiểm chất lượng phát video.
    assert.equal((await call('/api/plan/approve-video')).status, 200);
    assert.equal((await call('/api/plan/approve-publish')).status, 200);
    const publication = await call('/api/publish');
    assert.equal(publication.status, 200);
    const finished = await (await fetch(`${base}/api/bootstrap`)).json();
    assert.equal(finished.episodes[1].status, 'published');
    assert.equal(finished.state.version, 2);
    assert.ok(finished.audit.some((event) => event.event_type === 'episode_published'));
    assert.equal((await call('/api/publish')).value.published_at, publication.value.published_at);
    const editAfterPublish = await fetch(`${base}/api/plan`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screenplay: 'Một kịch bản mới không được phép sửa sau phát hành.' }),
    });
    assert.equal(editAfterPublish.status, 409);
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
    }
    rmSync(temp, { recursive: true, force: true });
  }
});
