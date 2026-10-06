import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('trang sản xuất và khán giả dùng API dự án riêng, không gọi dịch vụ khi thiếu khóa', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'living-production-http-'));
  const port = 30000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['src/server.mjs'], { cwd: root, env: { ...process.env, ARK_API_KEY: '', JEV_API_KEY: '', PORT: String(port), LIVING_DRAMA_DB: join(dir, 'db.sqlite'), LIVING_DRAMA_MEDIA: join(dir, 'media') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
  try {
    for (let i = 0; i < 50; i += 1) {
      if (child.exitCode !== null) throw new Error(errors);
      try { if ((await fetch(`${base}/api/bootstrap`)).ok) break; } catch { /* máy chủ đang mở */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal((await fetch(`${base}/producer`)).status, 200);
    assert.equal((await fetch(`${base}/viewer`)).status, 200);
    assert.equal((await fetch(`${base}/producer.js`)).status, 200);
    assert.equal((await fetch(`${base}/viewer.js`)).status, 200);
    const createdResponse = await fetch(`${base}/api/production/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Phim thử', filename: 'phim.md', script_text: 'Tập 1. Nhân vật A vào phòng và thấy một chiếc hộp. A chưa biết bên trong chiếc hộp có gì. A quyết định đặt hộp lên bàn rồi ra khỏi phòng.' }) });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.title, 'Phim thử');
    assert.equal((await (await fetch(`${base}/api/production/projects`)).json()).length, 1);
    const analyzeResponse = await fetch(`${base}/api/production/projects/${created.id}/analyze`, { method: 'POST' });
    assert.equal(analyzeResponse.status, 503);
    assert.equal((await analyzeResponse.json()).code, 'PROVIDER_ERROR');
    const sqlite = new DatabaseSync(join(dir, 'db.sqlite'));
    const payload = JSON.parse(sqlite.prepare('SELECT payload_json FROM production_projects WHERE id = ?').get(created.id).payload_json);
    payload.analysis = { branch_points: [{ id: 'item-1', episode: 'Tập 1', moment: 'Khi A nhìn chiếc hộp', question: 'Nếu A mở hộp?', original_outcome: 'A để hộp lại.' }] };
    payload.visual_locked_at = new Date().toISOString();
    sqlite.prepare('UPDATE production_projects SET payload_json = ? WHERE id = ?').run(JSON.stringify(payload), created.id);
    sqlite.close();
    const queuedResponse = await fetch(`${base}/api/production/projects/${created.id}/draft-branches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ point_id: 'item-1' }) });
    assert.equal(queuedResponse.status, 202);
    const queued = await queuedResponse.json();
    assert.equal(queued.status, 'running');
    let visibleJob;
    for (let i = 0; i < 30; i += 1) {
      const refreshed = await (await fetch(`${base}/api/production/projects/${created.id}`)).json();
      visibleJob = refreshed.draft_jobs.find((item) => item.id === queued.id);
      if (visibleJob?.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(visibleJob.status, 'failed');
    assert.match(visibleJob.error, /khóa ModelArk|ARK_API_KEY|chưa cấu hình/i);
    assert.equal((await (await fetch(`${base}/api/watch/projects`)).json()).length, 0);
  } finally {
    if (child.exitCode === null) { const done = new Promise((resolve) => child.once('exit', resolve)); child.kill(); await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 2000))]); }
    rmSync(dir, { recursive: true, force: true });
  }
});
