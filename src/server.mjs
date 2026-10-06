import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit, hashAuthor, listComments, openStore } from './store.mjs';
import { commitOption, makeDecisionOptions, makeEpisodePlan, normalizeComment, summarizeAudience, summarizeJevAudience } from './domain.mjs';
import { providerConfig, ProviderError, classifyWithJev, generateSeedreamImage, createSeedanceTask, getSeedanceTask, downloadArkAsset, imageMime } from './providers.mjs';
import { ProductionError, productionList, productionGet, productionCreate, productionAnalyze, productionSaveStory, productionApproveStory, productionSaveVisuals, productionUnlockVisuals, productionLockVisuals, productionGenerateVisual, productionApproveVisual, productionQueueDraft, productionDraftBranches, productionFinishDraftJob, productionSaveBranch, productionApproveBranch, productionGenerateKeyframe, productionApproveKeyframe, productionCreateVideo, productionRefreshVideo, productionPublishBranch, productionViewerList, productionViewerGet, productionViewerRoute, productionViewerRouteBatch } from './production.mjs';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const publicRoot = join(projectRoot, 'public');
const mediaRoot = process.env.LIVING_DRAMA_MEDIA || join(projectRoot, 'data', 'uploads');
const db = openStore();
db.prepare("UPDATE production_draft_jobs SET status = 'interrupted', error = 'Máy chủ đã khởi động lại trước khi hoàn tất. Có thể thử soạn lại.', updated_at = ? WHERE status = 'running'").run(new Date().toISOString());
const assetRoot = join(projectRoot, 'data', 'assets');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) { throw new ApiError(status, code, message); }
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function parseJson(row, field) { return row ? JSON.parse(row[field]) : null; }
function currentState() {
  const version = db.prepare('SELECT current_version FROM shows WHERE id = ?').get('show-1').current_version;
  return parseJson(db.prepare('SELECT snapshot_json FROM world_states WHERE show_id = ? AND version = ?').get('show-1', version), 'snapshot_json');
}
function latestMind() {
  const row = db.prepare('SELECT * FROM audience_minds WHERE episode_id = ? ORDER BY created_at DESC LIMIT 1').get('e1');
  return row ? { id: row.id, ...JSON.parse(row.payload_json) } : null;
}
function latestDecision() {
  const row = db.prepare('SELECT * FROM decisions WHERE show_id = ? ORDER BY created_at DESC LIMIT 1').get('show-1');
  return row ? { ...row, options: JSON.parse(row.options_json) } : null;
}
function visualBible() {
  const row = db.prepare('SELECT payload_json FROM visual_bibles WHERE show_id = ? ORDER BY version DESC LIMIT 1').get('show-1');
  return JSON.parse(row.payload_json);
}
function episode(id = 'e2') {
  const row = db.prepare('SELECT * FROM episodes WHERE id = ?').get(id);
  return row ? { ...row, plan: parseJson(row, 'plan_json') } : null;
}
function snapshot() {
  const show = db.prepare('SELECT * FROM shows WHERE id = ?').get('show-1');
  return {
    show: { ...show, bible: JSON.parse(show.bible_json) },
    state: currentState(),
    episodes: db.prepare('SELECT * FROM episodes ORDER BY number').all().map((row) => ({ ...row, plan: parseJson(row, 'plan_json') })),
    comments: listComments(db),
    mind: latestMind(),
    decision: latestDecision(),
    audit: db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 30').all().map((row) => ({ ...row, payload: JSON.parse(row.payload_json) })),
    assets: db.prepare('SELECT * FROM visual_assets ORDER BY created_at DESC').all(),
    video_shots: db.prepare('SELECT * FROM video_shots WHERE episode_id = ? ORDER BY shot_id').all('e2').map((row) => ({ ...row, reference_asset_ids: JSON.parse(row.reference_asset_ids_json) })),
    integrations: { byteplus_ready: Boolean(providerConfig.arkKey), jev_ready: Boolean(providerConfig.jevKey), text_model: providerConfig.textModel, seedream_model: providerConfig.seedreamModel, seedance_model: providerConfig.seedanceModel },
    visual_bible: visualBible(),
  };
}

function imageDataUrl(asset) {
  const file = join(assetRoot, basename(asset.path));
  if (!existsSync(file)) fail(409, 'ASSET_MISSING', 'Ảnh tham chiếu đã mất khỏi kho lưu trữ.');
  return `data:image/png;base64,${readFileSync(file).toString('base64')}`;
}
function saveAsset(kind, subjectId, prompt, generated, source = 'seedream') {
  const { bytes, url, expiresAt } = generated;
  const id = randomUUID();
  mkdirSync(assetRoot, { recursive: true });
  const name = `${id}.png`;
  writeFileSync(join(assetRoot, name), bytes, { flag: 'wx' });
  const row = { id, show_id: 'show-1', kind, subject_id: subjectId, prompt, path: `/assets/${name}`, source, status: 'pending', sha256: createHash('sha256').update(bytes).digest('hex'), created_at: new Date().toISOString(), public_url: url || null, expires_at: expiresAt || null };
  db.prepare('INSERT INTO visual_assets (id, show_id, kind, subject_id, prompt, path, source, status, sha256, created_at, public_url, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...Object.values(row));
  audit(db, 'visual_asset_generated', { asset_id: id, kind, subject_id: subjectId, source });
  return row;
}
function approvedAsset(kind, subjectId) {
  return db.prepare("SELECT * FROM visual_assets WHERE kind = ? AND subject_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 1").get(kind, subjectId);
}
function invalidateShots(reason, fromShotId = null) {
  db.prepare("UPDATE video_shots SET status = 'stale', error = ?, updated_at = ? WHERE episode_id = 'e2' AND status != 'stale' AND (? IS NULL OR shot_id >= ?)").run(reason, new Date().toISOString(), fromShotId, fromShotId);
  db.prepare("UPDATE episodes SET video_path = NULL WHERE id = 'e2'").run();
  audit(db, 'visuals_invalidated', { episode_id: 'e2', reason });
}

async function readBody(req, maxBytes = 1_000_000) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) fail(413, 'TOO_LARGE', 'Tệp hoặc yêu cầu quá lớn.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function bodyJson(req, maxBytes = 1_000_000) {
  const raw = await readBody(req, maxBytes);
  try { return JSON.parse(raw.toString('utf8')); }
  catch { return fail(400, 'INVALID_JSON', 'Dữ liệu gửi lên không phải JSON hợp lệ.'); }
}

function parseCsv(csv) {
  const rows = [];
  let cell = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (char === '"' && quoted && csv[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && csv[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) fail(400, 'INVALID_CSV', 'Dấu ngoặc kép trong CSV chưa đóng.');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) fail(400, 'INVALID_CSV', 'CSV cần dòng tiêu đề và ít nhất một bình luận.');
  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, '').trim());
  for (const field of ['episode_id', 'author_ref', 'body', 'language', 'created_at']) {
    if (!headers.includes(field)) fail(400, 'INVALID_CSV', `CSV thiếu cột ${field}.`);
  }
  return rows.map((values, index) => {
    if (values.length !== headers.length) fail(400, 'INVALID_CSV', `Dòng ${index + 2} có số cột không đúng.`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]));
  });
}

function redact(text) {
  return text.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/(?:\+?\d[\d .-]{8,}\d)/g, '[số điện thoại]');
}

function ensurePlan() {
  const e = episode();
  if (!e?.plan) fail(409, 'PLAN_REQUIRED', 'Cần tạo kế hoạch tập 2 trước.');
  if (e.state_version !== currentState().version) fail(409, 'PLAN_STALE', 'Kế hoạch dùng phiên bản truyện cũ.');
  return e;
}
function ensureEditablePlan() {
  const e = ensurePlan();
  if (e.status === 'published') fail(409, 'ALREADY_PUBLISHED', 'Tập đã phát hành; không thể sửa hoặc duyệt lại.');
  return e;
}

function savePlan(plan) {
  db.prepare('UPDATE episodes SET plan_json = ? WHERE id = ?').run(JSON.stringify(plan), 'e2');
}

function serveStatic(res, path) {
  const assets = { '/': 'index.html', '/producer': 'producer.html', '/viewer': 'viewer.html', '/producer.js': 'producer.js', '/viewer.js': 'viewer.js', '/viewer-policy.mjs': 'viewer-policy.mjs', '/ui-errors.mjs': 'ui-errors.mjs', '/producer.css': 'producer.css', '/viewer.css': 'viewer.css', '/app.js': 'app.js', '/styles.css': 'styles.css' };
  const name = assets[path];
  if (!name) return false;
  const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' }[extname(name)];
  res.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(readFileSync(join(publicRoot, name)));
  return true;
}

async function route(req, res) {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && serveStatic(res, path)) return;
  if (req.method === 'GET' && path.startsWith('/media/')) {
    const file = basename(path);
    if (file !== path.slice('/media/'.length)) fail(404, 'NOT_FOUND', 'Không tìm thấy video.');
    const full = join(mediaRoot, file);
    if (!existsSync(full)) fail(404, 'NOT_FOUND', 'Không tìm thấy video.');
    res.writeHead(200, { 'Content-Type': file.endsWith('.webm') ? 'video/webm' : 'video/mp4', 'X-Content-Type-Options': 'nosniff' });
    res.end(readFileSync(full));
    return;
  }
  if (req.method === 'GET' && path.startsWith('/assets/')) {
    const file = basename(path);
    if (!/^[-\w]+\.(png|jpg)$/.test(file) || file !== path.slice('/assets/'.length)) fail(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
    const full = join(assetRoot, file);
    if (!existsSync(full)) fail(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
    res.writeHead(200, { 'Content-Type': file.endsWith('.jpg') ? 'image/jpeg' : 'image/png', 'X-Content-Type-Options': 'nosniff' });
    res.end(readFileSync(full));
    return;
  }
  if (req.method === 'GET' && path === '/api/bootstrap') return json(res, 200, snapshot());

  if (req.method === 'GET' && path === '/api/watch/projects') return json(res, 200, productionViewerList(db));
  const watchPath = path.match(/^\/api\/watch\/projects\/([0-9a-f-]{36})(?:\/(route|route-batch))?$/);
  if (watchPath) {
    if (req.method === 'GET' && !watchPath[2]) return json(res, 200, productionViewerGet(db, watchPath[1]));
    if (req.method === 'POST' && watchPath[2] === 'route') {
      const body = await bodyJson(req);
      return json(res, 200, await productionViewerRoute(db, watchPath[1], body.message, body.point_id, body.simulated === true));
    }
    if (req.method === 'POST' && watchPath[2] === 'route-batch') {
      const body = await bodyJson(req);
      return json(res, 200, await productionViewerRouteBatch(db, watchPath[1], body.point_id, body.comments));
    }
  }

  if (path === '/api/production/projects') {
    if (req.method === 'GET') return json(res, 200, productionList(db));
    if (req.method === 'POST') return json(res, 201, productionCreate(db, await bodyJson(req, 300_000)));
  }
  const productionPath = path.match(/^\/api\/production\/projects\/([0-9a-f-]{36})(?:\/(.*))?$/);
  if (productionPath) {
    const [, id, action = ''] = productionPath;
    if (req.method === 'GET' && !action) return json(res, 200, productionGet(db, id));
    if (req.method === 'POST' && action === 'analyze') return json(res, 200, await productionAnalyze(db, id));
    if (req.method === 'PATCH' && action === 'story') return json(res, 200, productionSaveStory(db, id, await bodyJson(req)));
    if (req.method === 'POST' && action === 'approve-story') return json(res, 200, productionApproveStory(db, id));
    if (req.method === 'PATCH' && action === 'visuals') return json(res, 200, productionSaveVisuals(db, id, await bodyJson(req)));
    if (req.method === 'POST' && action === 'unlock-visuals') return json(res, 200, productionUnlockVisuals(db, id));
    if (req.method === 'POST' && action === 'lock-visuals') return json(res, 200, productionLockVisuals(db, id));
    if (req.method === 'POST' && action === 'draft-branches') {
      const job = productionQueueDraft(db, id, (await bodyJson(req)).point_id);
      if (!job.already_running) {
        setImmediate(async () => {
          try { await productionDraftBranches(db, id, job.point_id); productionFinishDraftJob(db, job.id); }
          catch (error) { productionFinishDraftJob(db, job.id, error); }
        });
      }
      return json(res, 202, job);
    }
    const visual = action.match(/^visuals\/(visual-\d+)\/generate$/);
    if (req.method === 'POST' && visual) return json(res, 200, await productionGenerateVisual(db, assetRoot, id, visual[1]));
    const approveVisual = action.match(/^assets\/([0-9a-f-]{36})\/approve$/);
    if (req.method === 'POST' && approveVisual) return json(res, 200, productionApproveVisual(db, id, approveVisual[1]));
    const branch = action.match(/^branches\/((?:item-\d+-)?branch-\d+)\/(approve|publish)$/);
    if (req.method === 'POST' && branch) return json(res, 200, branch[2] === 'approve' ? productionApproveBranch(db, id, branch[1]) : productionPublishBranch(db, id, branch[1]));
    const saveBranch = action.match(/^branches\/((?:item-\d+-)?branch-\d+)$/);
    if (req.method === 'PATCH' && saveBranch) return json(res, 200, productionSaveBranch(db, id, saveBranch[1], await bodyJson(req)));
    const shot = action.match(/^branches\/((?:item-\d+-)?branch-\d+)\/shots\/(shot-\d+)\/(keyframe|video|refresh)$/);
    if (req.method === 'POST' && shot) {
      const result = shot[3] === 'keyframe' ? await productionGenerateKeyframe(db, assetRoot, id, shot[1], shot[2])
        : shot[3] === 'video' ? await productionCreateVideo(db, assetRoot, id, shot[1], shot[2])
          : await productionRefreshVideo(db, mediaRoot, id, shot[1], shot[2]);
      return json(res, 200, result);
    }
    const keyframe = action.match(/^branches\/((?:item-\d+-)?branch-\d+)\/shots\/(shot-\d+)\/keyframes\/([0-9a-f-]{36})\/approve$/);
    if (req.method === 'POST' && keyframe) return json(res, 200, productionApproveKeyframe(db, id, keyframe[1], keyframe[2], keyframe[3]));
  }

  if (req.method === 'PATCH' && path === '/api/visual-bible') {
    if (episode().status === 'published') fail(409, 'ALREADY_PUBLISHED', 'Tập 2 đã phát hành; không sửa hồ sơ hình ảnh của tập này.');
    const incoming = await bodyJson(req);
    const old = visualBible();
    const fields = [incoming.style, incoming.location, incoming.props, ...Object.keys(old.characters).flatMap((id) => [incoming.characters?.[id]?.appearance, incoming.characters?.[id]?.costume])];
    if (fields.some((item) => typeof item !== 'string' || item.trim().length < 8 || item.length > 1000)) {
      fail(400, 'VALIDATION_ERROR', 'Mỗi mô tả hình ảnh cần từ 8 đến 1000 ký tự.');
    }
    const next = { version: old.version + 1, style: incoming.style.trim(), location: incoming.location.trim(), props: incoming.props.trim(), characters: Object.fromEntries(Object.keys(old.characters).map((id) => [id, { appearance: incoming.characters[id].appearance.trim(), costume: incoming.characters[id].costume.trim() }])) };
    db.prepare('INSERT INTO visual_bibles VALUES (?, ?, ?, ?)').run('show-1', next.version, JSON.stringify(next), new Date().toISOString());
    db.prepare("UPDATE visual_assets SET status = 'stale' WHERE status = 'approved'").run();
    invalidateShots('Hồ sơ hình ảnh đã đổi phiên bản.');
    const e = episode();
    if (e?.plan) { e.plan.video_approval = 'pending'; e.plan.publish_approval = 'pending'; savePlan(e.plan); }
    audit(db, 'visual_bible_updated', { from: old.version, to: next.version, approver_id: 'demo-creator' });
    return json(res, 200, next);
  }

  if (req.method === 'POST' && path === '/api/visual-assets') {
    const { kind, subject_id } = await bodyJson(req);
    const bible = JSON.parse(db.prepare('SELECT bible_json FROM shows WHERE id = ?').get('show-1').bible_json);
    const visual = visualBible();
    const e = ensureEditablePlan();
    if (e.plan.script_approval !== 'approved') fail(422, 'APPROVAL_REQUIRED', 'Cần duyệt kịch bản trước khi tạo ảnh.');
    if (!providerConfig.arkKey) fail(503, 'KEY_REQUIRED', 'Cần điền ARK_API_KEY trong tệp .env trên máy chủ.');
    let prompt;
    const refs = [];
    if (kind === 'character') {
      const character = bible.characters.find((item) => item.id === subject_id);
      if (!character) fail(400, 'VALIDATION_ERROR', 'Nhân vật không có trong hồ sơ truyện.');
      prompt = `Tạo một ảnh hồ sơ nhân vật hư cấu duy nhất, toàn thân, tỉ lệ 16:9. Phong cách chung: ${visual.style}. ${character.name}: ${visual.characters[subject_id].appearance}. Tính cách: ${character.traits}. Trang phục cố định: ${visual.characters[subject_id].costume}. Không có người thật, không có chữ, không hé lộ bí mật cốt truyện. Duy trì hình dáng nhân vật này cho các ảnh tiếp theo.`;
    } else if (kind === 'keyframe') {
      const shot = e.plan.shot_plan.find((item) => item.shot_id === subject_id);
      if (!shot) fail(400, 'VALIDATION_ERROR', 'Cảnh không có trong kế hoạch.');
      for (const characterId of shot.character_ids) {
        const asset = approvedAsset('character', characterId);
        if (!asset) fail(422, 'CHARACTER_REFERENCE_REQUIRED', `Cần tạo và duyệt ảnh nhân vật ${characterId} trước khi tạo khung hình cảnh.`);
        refs.push(imageDataUrl(asset));
      }
      const previousIndex = e.plan.shot_plan.findIndex((item) => item.shot_id === subject_id) - 1;
      if (previousIndex >= 0) {
        const previous = db.prepare("SELECT last_frame_path FROM video_shots WHERE episode_id = 'e2' AND shot_id = ? AND status = 'succeeded'").get(e.plan.shot_plan[previousIndex].shot_id);
        if (previous?.last_frame_path) {
          const frame = readFileSync(join(assetRoot, basename(previous.last_frame_path)));
          refs.unshift(`data:${imageMime(frame)};base64,${frame.toString('base64')}`);
        }
      }
      prompt = `Tạo khung hình mở đầu cảnh phim ngang 16:9. Mạch hình ảnh nhất quán: cùng nhân vật, khuôn mặt, trang phục, bối cảnh và đạo cụ như các ảnh tham chiếu. Phong cách: ${visual.style}. ${shot.action}. ${shot.visual_instruction}. Bối cảnh cố định: ${visual.location}. Đạo cụ: ${visual.props}. Trang phục: ${shot.character_ids.map((id) => `${bible.characters.find((character) => character.id === id).name}: ${visual.characters[id].costume}`).join('; ')}. Không có chữ, không hé lộ danh tính cô gái.`;
    } else fail(400, 'VALIDATION_ERROR', 'Loại ảnh phải là nhân vật hoặc khung hình cảnh.');
    const generated = await generateSeedreamImage(prompt, refs);
    return json(res, 201, saveAsset(kind, subject_id, prompt, generated));
  }

  const assetApproval = path.match(/^\/api\/visual-assets\/([^/]+)\/approve$/);
  if (req.method === 'POST' && assetApproval) {
    const asset = db.prepare('SELECT * FROM visual_assets WHERE id = ?').get(assetApproval[1]);
    if (!asset) fail(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
    if (asset.status !== 'pending') fail(409, 'INVALID_STATUS', 'Ảnh này đã được xử lý.');
    db.prepare("UPDATE visual_assets SET status = 'stale' WHERE kind = ? AND subject_id = ? AND status = 'approved'").run(asset.kind, asset.subject_id);
    db.prepare("UPDATE visual_assets SET status = 'approved' WHERE id = ?").run(asset.id);
    if (asset.kind === 'character') {
      db.prepare("UPDATE visual_assets SET status = 'stale' WHERE kind = 'keyframe' AND status = 'approved'").run();
      invalidateShots('Ảnh nhân vật tham chiếu đã thay đổi.');
    } else invalidateShots('Khung hình mở đầu đã thay đổi.', asset.subject_id);
    audit(db, 'visual_asset_approved', { asset_id: asset.id, kind: asset.kind, subject_id: asset.subject_id, approver_id: 'demo-creator' });
    return json(res, 200, { status: 'approved' });
  }

  const shotCreate = path.match(/^\/api\/shots\/([^/]+)$/);
  if (req.method === 'POST' && shotCreate) {
    const e = ensureEditablePlan();
    if (e.plan.script_approval !== 'approved') fail(422, 'APPROVAL_REQUIRED', 'Cần duyệt kịch bản trước khi tạo video.');
    const shot = e.plan.shot_plan.find((item) => item.shot_id === shotCreate[1]);
    if (!shot) fail(404, 'NOT_FOUND', 'Không tìm thấy cảnh.');
    const existingShot = db.prepare('SELECT status FROM video_shots WHERE episode_id = ? AND shot_id = ?').get('e2', shot.shot_id);
    if (existingShot && !['stale', 'failed', 'cancelled'].includes(existingShot.status)) fail(409, 'ALREADY_EXISTS', 'Cảnh này đã có tác vụ; hãy xem trạng thái trước.');
    const keyframe = approvedAsset('keyframe', shot.shot_id);
    if (!keyframe) fail(422, 'KEYFRAME_REQUIRED', 'Cần tạo và duyệt khung hình mở đầu bằng Seedream trước.');
    const prompt = `Dùng Image 1 làm khung hình đầu tiên. Giữ khuôn mặt, trang phục, ánh sáng, bối cảnh và đạo cụ nhất quán. ${shot.action}. ${shot.visual_instruction}. Không tiết lộ danh tính cô gái. Không có chữ trong hình.`;
    const validPublicUrl = keyframe.public_url && keyframe.expires_at && Date.parse(keyframe.expires_at) > Date.now() + 10 * 60_000;
    const taskId = await createSeedanceTask({ prompt, duration: shot.duration_seconds, images: [{ dataUrl: validPublicUrl ? keyframe.public_url : imageDataUrl(keyframe), role: 'first_frame' }] });
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO video_shots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(episode_id, shot_id) DO UPDATE SET task_id = excluded.task_id, status = 'queued', prompt = excluded.prompt,
      reference_asset_ids_json = excluded.reference_asset_ids_json, video_path = NULL, last_frame_path = NULL,
      error = NULL, created_at = excluded.created_at, updated_at = excluded.updated_at`)
      .run(randomUUID(), 'e2', shot.shot_id, taskId, 'queued', prompt, JSON.stringify([keyframe.id]), null, null, null, now, now);
    audit(db, 'seedance_task_created', { episode_id: 'e2', shot_id: shot.shot_id, task_id: taskId, asset_id: keyframe.id });
    return json(res, 202, { task_id: taskId, status: 'queued' });
  }

  const shotReject = path.match(/^\/api\/shots\/([^/]+)\/reject$/);
  if (req.method === 'POST' && shotReject) {
    const e = ensureEditablePlan();
    const { reason } = await bodyJson(req);
    if (typeof reason !== 'string' || reason.trim().length < 8 || reason.length > 500) fail(400, 'VALIDATION_ERROR', 'Hãy nêu lỗi hình ảnh hoặc đạo cụ, từ 8 đến 500 ký tự.');
    const row = db.prepare('SELECT * FROM video_shots WHERE episode_id = ? AND shot_id = ?').get('e2', shotReject[1]);
    if (!row || row.status !== 'succeeded') fail(409, 'INVALID_STATUS', 'Chỉ có thể đánh dấu lỗi với cảnh đã hoàn thành.');
    invalidateShots(reason.trim(), row.shot_id);
    e.plan.video_approval = 'pending';
    e.plan.publish_approval = 'pending';
    savePlan(e.plan);
    audit(db, 'seedance_shot_rejected', { episode_id: 'e2', shot_id: row.shot_id, task_id: row.task_id, reason: reason.trim(), approver_id: 'demo-creator' });
    return json(res, 200, { status: 'stale' });
  }

  const shotCheck = path.match(/^\/api\/shots\/([^/]+)\/refresh$/);
  if (req.method === 'POST' && shotCheck) {
    const row = db.prepare('SELECT * FROM video_shots WHERE episode_id = ? AND shot_id = ?').get('e2', shotCheck[1]);
    if (!row) fail(404, 'NOT_FOUND', 'Chưa có tác vụ cảnh này.');
    if (['succeeded', 'failed'].includes(row.status)) return json(res, 200, { status: row.status, video_path: row.video_path, error: row.error });
    const result = await getSeedanceTask(row.task_id);
    const status = result.status;
    if (!['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(status)) fail(502, 'PROVIDER_ERROR', 'Seedance trả trạng thái tác vụ không hợp lệ.');
    let videoPath = row.video_path;
    let lastFramePath = row.last_frame_path;
    if (status === 'succeeded') {
      if (!result.content?.video_url) fail(502, 'PROVIDER_ERROR', 'Seedance báo hoàn thành nhưng không có video.');
      const bytes = await downloadArkAsset(result.content.video_url, 100_000_000, 'video');
      mkdirSync(mediaRoot, { recursive: true });
      videoPath = `/media/${randomUUID()}.mp4`;
      writeFileSync(join(mediaRoot, basename(videoPath)), bytes, { flag: 'wx' });
      if (result.content.last_frame_url) {
        const frame = await downloadArkAsset(result.content.last_frame_url, 30_000_000, 'image');
        mkdirSync(assetRoot, { recursive: true });
        lastFramePath = `/assets/${randomUUID()}${imageMime(frame) === 'image/jpeg' ? '.jpg' : '.png'}`;
        writeFileSync(join(assetRoot, basename(lastFramePath)), frame, { flag: 'wx' });
      }
    }
    db.prepare('UPDATE video_shots SET status = ?, video_path = ?, last_frame_path = ?, error = ?, updated_at = ? WHERE id = ?').run(status, videoPath, lastFramePath, status === 'failed' ? String(result.error?.message || 'Không rõ lỗi') : null, new Date().toISOString(), row.id);
    audit(db, 'seedance_task_updated', { episode_id: 'e2', shot_id: row.shot_id, task_id: row.task_id, status });
    return json(res, 200, { status, video_path: videoPath, last_frame_path: lastFramePath });
  }

  if (req.method === 'POST' && path === '/api/comments/import') {
    const { csv } = await bodyJson(req);
    if (typeof csv !== 'string' || csv.length > 500_000) fail(400, 'VALIDATION_ERROR', 'CSV không hợp lệ hoặc quá lớn.');
    const rows = parseCsv(csv);
    if (rows.length > 1000) fail(400, 'VALIDATION_ERROR', 'Mỗi lần chỉ nhập tối đa 1000 bình luận.');
    let imported = 0;
    let skipped = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      const insert = db.prepare('INSERT OR IGNORE INTO comments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const row of rows) {
        if (row.episode_id !== 'e1' || !row.author_ref || !row.body || Number.isNaN(Date.parse(row.created_at))) {
          fail(400, 'VALIDATION_ERROR', 'CSV chỉ nhận bình luận tập e1, có tác giả, nội dung và thời gian hợp lệ.');
        }
        const author = hashAuthor(row.author_ref);
        const body = redact(row.body).slice(0, 1000);
        const key = createHash('sha256').update(`${author}|${normalizeComment(body)}|${row.created_at}`).digest('hex');
        const result = insert.run(randomUUID(), 'e1', author, body, row.language || 'vi', new Date(row.created_at).toISOString(), 'imported_csv', '[]', key);
        if (result.changes) imported += 1; else skipped += 1;
      }
      audit(db, 'comments_imported', { imported, skipped });
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return json(res, 201, { imported, skipped });
  }

  if (req.method === 'POST' && path === '/api/mind') {
    const comments = listComments(db);
    const usable = comments.filter((item) => !item.flags.includes('spam') && !item.flags.includes('duplicate'));
    const jev = providerConfig.jevKey ? await classifyWithJev(usable) : null;
    const mind = jev ? summarizeJevAudience(comments, jev.results, jev.modelVersion, 'e1') : summarizeAudience(comments, 'e1');
    const id = randomUUID();
    db.prepare('INSERT INTO audience_minds VALUES (?, ?, ?, ?)').run(id, 'e1', JSON.stringify(mind), mind.created_at);
    audit(db, 'audience_mind_created', { mind_id: id, source_mode: mind.source_mode, events: mind.window.event_count });
    return json(res, 201, { id, ...mind });
  }

  if (req.method === 'POST' && path === '/api/decisions') {
    const mind = latestMind();
    if (!mind) fail(409, 'MIND_REQUIRED', 'Cần tổng hợp ý kiến khán giả trước.');
    if (mind.window.event_count !== listComments(db).filter((c) => !c.flags.includes('spam') && !c.flags.includes('duplicate')).length) {
      fail(409, 'MIND_STALE', 'Có bình luận mới; hãy tổng hợp lại trước khi tạo lựa chọn.');
    }
    const state = currentState();
    if (episode().status === 'published') fail(409, 'ALREADY_PUBLISHED', 'Tập 2 đã phát hành.');
    if (state.version > 1) fail(409, 'EPISODE_IN_PRODUCTION', 'Tập 2 đang dựa trên mạch truyện đã chốt; chưa thể tạo quyết định mới.');
    const id = randomUUID();
    const options = makeDecisionOptions(mind, state);
    db.prepare('INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, 'show-1', mind.id, state.version, 'proposed', JSON.stringify(options), null, null, null, null, new Date().toISOString());
    audit(db, 'decision_proposed', { decision_id: id, mind_id: mind.id, base_version: state.version });
    return json(res, 201, { decision_id: id, options });
  }

  const approvalMatch = path.match(/^\/api\/decisions\/([^/]+)\/approve$/);
  if (req.method === 'POST' && approvalMatch) {
    const { option_id, rationale } = await bodyJson(req);
    const decision = db.prepare('SELECT * FROM decisions WHERE id = ?').get(approvalMatch[1]);
    if (!decision) fail(404, 'NOT_FOUND', 'Không tìm thấy quyết định.');
    if (decision.status !== 'proposed' && decision.status !== 'simulated') fail(409, 'INVALID_STATUS', 'Quyết định này đã được xử lý.');
    if (decision.base_version !== currentState().version) fail(409, 'STATE_VERSION_CONFLICT', 'Mạch truyện đã đổi; cần tạo lại lựa chọn.');
    const sourceMind = db.prepare('SELECT payload_json FROM audience_minds WHERE id = ?').get(decision.mind_id);
    const validCommentCount = listComments(db).filter((item) => !item.flags.includes('spam') && !item.flags.includes('duplicate')).length;
    if (!sourceMind || JSON.parse(sourceMind.payload_json).window.event_count !== validCommentCount) {
      fail(409, 'MIND_STALE', 'Bình luận đã thay đổi; hãy tổng hợp và tạo lại lựa chọn.');
    }
    const selected = JSON.parse(decision.options_json).find((item) => item.option_id === option_id);
    if (!selected) fail(400, 'VALIDATION_ERROR', 'Lựa chọn không tồn tại.');
    if (selected.constraints.some((item) => item.result === 'fail')) fail(422, 'HARD_RULE_FAILED', 'Lựa chọn vi phạm quy tắc cứng.');
    if (typeof rationale !== 'string' || rationale.trim().length < 8) fail(400, 'VALIDATION_ERROR', 'Hãy ghi lý do chọn hướng này, ít nhất 8 ký tự.');
    db.prepare('UPDATE decisions SET status = ?, selected_option_id = ?, rationale = ?, approver_id = ? WHERE id = ?')
      .run('approved', option_id, rationale.trim(), 'demo-creator', decision.id);
    audit(db, 'decision_approved', { decision_id: decision.id, option_id, rationale: rationale.trim(), approver_id: 'demo-creator' });
    return json(res, 200, { status: 'approved' });
  }

  const commitMatch = path.match(/^\/api\/decisions\/([^/]+)\/commit$/);
  if (req.method === 'POST' && commitMatch) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const decision = db.prepare('SELECT * FROM decisions WHERE id = ?').get(commitMatch[1]);
      if (!decision) fail(404, 'NOT_FOUND', 'Không tìm thấy quyết định.');
      if (decision.status === 'committed') { db.exec('COMMIT'); return json(res, 200, { state_version: decision.committed_version }); }
      if (decision.status !== 'approved') fail(422, 'APPROVAL_REQUIRED', 'Cần duyệt lựa chọn trước khi chốt.');
      const state = currentState();
      if (decision.base_version !== state.version) fail(409, 'STATE_VERSION_CONFLICT', 'Phiên bản truyện gốc đã thay đổi.');
      const selected = JSON.parse(decision.options_json).find((item) => item.option_id === decision.selected_option_id);
      const next = commitOption(state, selected);
      const now = new Date().toISOString();
      db.prepare('INSERT INTO world_states VALUES (?, ?, ?, ?, ?)').run('show-1', next.version, JSON.stringify(next), decision.id, now);
      db.prepare('UPDATE shows SET current_version = ? WHERE id = ?').run(next.version, 'show-1');
      db.prepare('UPDATE decisions SET status = ?, committed_version = ? WHERE id = ?').run('committed', next.version, decision.id);
      audit(db, 'state_committed', { decision_id: decision.id, from: state.version, to: next.version, diff: selected.projected_state_diff });
      db.exec('COMMIT');
      return json(res, 201, { state_version: next.version });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  if (req.method === 'POST' && path === '/api/plan') {
    const decision = db.prepare("SELECT * FROM decisions WHERE status = 'committed' ORDER BY created_at DESC LIMIT 1").get();
    if (!decision) fail(409, 'DECISION_REQUIRED', 'Cần chốt một diễn biến trước.');
    const state = currentState();
    if (decision.committed_version !== state.version) fail(409, 'STATE_VERSION_CONFLICT', 'Quyết định không khớp mạch truyện hiện tại.');
    const existing = episode();
    if (existing.plan && existing.state_version === state.version) return json(res, 200, existing.plan);
    const selected = JSON.parse(decision.options_json).find((item) => item.option_id === decision.selected_option_id);
    const plan = makeEpisodePlan(state, selected, decision.id);
    db.prepare('UPDATE episodes SET plan_json = ?, state_version = ?, decision_id = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(plan), state.version, decision.id, 'draft', 'e2');
    audit(db, 'episode_plan_created', { episode_id: 'e2', decision_id: decision.id, state_version: state.version });
    return json(res, 201, plan);
  }

  if (req.method === 'PATCH' && path === '/api/plan') {
    const { screenplay } = await bodyJson(req);
    if (typeof screenplay !== 'string' || screenplay.trim().length < 20) fail(400, 'VALIDATION_ERROR', 'Kịch bản cần ít nhất 20 ký tự.');
    const e = ensureEditablePlan();
    const plan = e.plan;
    if (plan.screenplay !== screenplay.trim()) {
      db.prepare("UPDATE visual_assets SET status = 'stale' WHERE kind = 'keyframe' AND status = 'approved'").run();
      invalidateShots('Kịch bản đã thay đổi.');
    }
    plan.screenplay = screenplay.trim();
    plan.script_approval = 'pending';
    plan.video_approval = 'pending';
    plan.publish_approval = 'pending';
    savePlan(plan);
    audit(db, 'script_edited', { episode_id: 'e2' });
    return json(res, 200, plan);
  }

  if (req.method === 'POST' && path === '/api/plan/approve-script') {
    const e = ensureEditablePlan();
    e.plan.script_approval = 'approved';
    savePlan(e.plan);
    audit(db, 'script_approved', { episode_id: 'e2', approver_id: 'demo-creator' });
    return json(res, 200, { status: 'approved' });
  }

  if (req.method === 'POST' && path === '/api/video') {
    const e = ensureEditablePlan();
    if (e.plan.script_approval !== 'approved') fail(422, 'APPROVAL_REQUIRED', 'Cần duyệt kịch bản trước khi gắn video.');
    const type = (req.headers['content-type'] || '').split(';')[0];
    if (!['video/mp4', 'video/webm'].includes(type)) fail(400, 'VALIDATION_ERROR', 'Chỉ nhận video MP4 hoặc WebM.');
    const bytes = await readBody(req, 30_000_000);
    if (bytes.length < 100) fail(400, 'VALIDATION_ERROR', 'Tệp video quá nhỏ hoặc rỗng.');
    const validHeader = type === 'video/webm'
      ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      : bytes.toString('ascii', 4, 8) === 'ftyp';
    if (!validHeader) fail(400, 'VALIDATION_ERROR', 'Tệp không có định dạng video hợp lệ.');
    mkdirSync(mediaRoot, { recursive: true });
    const extension = type === 'video/webm' ? '.webm' : '.mp4';
    const name = `${randomUUID()}${extension}`;
    writeFileSync(join(mediaRoot, name), bytes, { flag: 'wx' });
    db.prepare('UPDATE episodes SET video_path = ? WHERE id = ?').run(`/media/${name}`, 'e2');
    e.plan.video_approval = 'pending';
    e.plan.publish_approval = 'pending';
    savePlan(e.plan);
    audit(db, 'prepared_video_attached', { episode_id: 'e2', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    return json(res, 201, { video_path: `/media/${name}`, provider_mode: 'prepared_video' });
  }

  if (req.method === 'POST' && path === '/api/plan/approve-video') {
    const e = ensureEditablePlan();
    if (!e.video_path) fail(422, 'VIDEO_REQUIRED', 'Cần gắn video trước khi duyệt.');
    if (e.plan.script_approval !== 'approved') fail(422, 'APPROVAL_REQUIRED', 'Kịch bản chưa được duyệt.');
    e.plan.video_approval = 'approved';
    savePlan(e.plan);
    audit(db, 'video_approved', { episode_id: 'e2', approver_id: 'demo-creator' });
    return json(res, 200, { status: 'approved' });
  }

  if (req.method === 'POST' && path === '/api/plan/approve-publish') {
    const e = ensureEditablePlan();
    if (e.plan.script_approval !== 'approved' || e.plan.video_approval !== 'approved') {
      fail(422, 'APPROVAL_REQUIRED', 'Kịch bản và video cần được duyệt trước.');
    }
    e.plan.publish_approval = 'approved';
    savePlan(e.plan);
    audit(db, 'publish_approved', { episode_id: 'e2', approver_id: 'demo-creator' });
    return json(res, 200, { status: 'approved' });
  }

  if (req.method === 'POST' && path === '/api/publish') {
    db.exec('BEGIN IMMEDIATE');
    try {
      const e = ensurePlan();
      if (e.status === 'published') { db.exec('COMMIT'); return json(res, 200, { published_at: e.published_at }); }
      if (!e.video_path || ['script_approval', 'video_approval', 'publish_approval'].some((key) => e.plan[key] !== 'approved')) {
        fail(422, 'APPROVAL_REQUIRED', 'Thiếu video hoặc một trong ba bước duyệt.');
      }
      const now = new Date().toISOString();
      db.prepare('UPDATE episodes SET status = ?, published_at = ? WHERE id = ?').run('published', now, 'e2');
      audit(db, 'episode_published', { episode_id: 'e2', state_version: e.state_version, decision_id: e.decision_id, approver_id: 'demo-creator' });
      db.exec('COMMIT');
      return json(res, 200, { published_at: now });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  fail(404, 'NOT_FOUND', 'Không tìm thấy đường dẫn.');
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    const status = error instanceof ApiError || error instanceof ProviderError || error instanceof ProductionError ? error.status : 500;
    const code = error instanceof ApiError || error instanceof ProductionError ? error.code : error instanceof ProviderError ? 'PROVIDER_ERROR' : 'INTERNAL_ERROR';
    if (status === 500) console.error(error);
    if (!res.headersSent) json(res, status, { code, message: status === 500 ? 'Máy chủ gặp lỗi.' : error.message });
    else res.end();
  });
});

const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => console.log(`Living Drama: http://127.0.0.1:${port}`));
