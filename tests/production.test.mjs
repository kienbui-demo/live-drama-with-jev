import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ARK_API_KEY = 'test-only-key';
process.env.JEV_API_KEY = 'test-only-key';
process.env.SEEDREAM_MODEL = 'dola-seedream-5-0-pro-260628';
process.env.TEXT_TIMEOUT_MS = '300000';
const { openStore } = await import('../src/store.mjs');
const { productionCreate, productionGet, productionAnalyze, productionSaveStory, productionApproveStory, productionSaveVisuals, productionGenerateVisual, productionApproveVisual, productionLockVisuals, productionQueueDraft, productionFinishDraftJob, productionDraftBranches, productionApproveBranch, productionGenerateKeyframe, productionApproveKeyframe, productionCreateVideo, productionRefreshVideo, productionPublishBranch, productionViewerGet, productionViewerRoute, productionViewerRouteBatch } = await import('../src/production.mjs');

test('kịch bản → ModelArk → khóa hình ảnh → nhánh → Seedance → phát hành', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'living-production-'));
  const db = openStore(join(dir, 'test.sqlite'));
  const originalFetch = global.fetch;
  const calls = [];
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(100)]);
  const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.alloc(100)]);
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/chat/completions')) {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'deepseek-v4-1-flash-260910');
      assert.deepEqual(body.thinking, { type: 'enabled' });
      assert.equal(body.reasoning_effort, 'medium');
      assert.equal(body.max_tokens, 24_000);
      const analysis = { synopsis: 'Lan tìm lại bức thư thất lạc.', visual_style: 'Phim hiện thực màu ấm.', rules: ['Lan không biết người gửi đến cảnh cuối.'], episodes: [{ title: 'Tập 1', summary: 'Lan tìm thấy thư.' }], characters: [{ name: 'Lan', identity: 'Tóc ngắn, áo xanh.', costume: 'Áo xanh.', visual_prompt: 'Tạo chân dung Lan.' }], locations: [{ name: 'Quán cà phê', identity: 'Bàn gỗ bên cửa.', visual_prompt: 'Tạo quán cà phê.' }], props: [{ name: 'Bức thư', identity: 'Phong bì vàng.', visual_prompt: 'Tạo phong bì vàng.' }], branch_points: [{ episode: 'Tập 1', moment: 'Khi Lan nhặt thư', question: 'Nếu Lan mở thư?', original_outcome: 'Lan cất thư.' }, { episode: 'Tập 1', moment: 'Khi Lan rời quán', question: 'Nếu Lan quay lại?', original_outcome: 'Lan đi tiếp.' }], unresolved: ['Chưa có tập 2.'] };
      const branches = { branches: [{ title: 'Mở thư', synopsis: 'Lan đọc thư nhưng chưa biết người gửi.', shots: [{ action: 'Lan mở thư.', image_prompt: 'Lan bên bàn gỗ.', video_prompt: 'Máy quay tiến gần.', visual_ids: ['visual-1', 'visual-2', 'visual-3'], duration_seconds: 8 }] }, { title: 'Cất thư', synopsis: 'Lan giữ thư để đọc sau.', shots: [{ action: 'Lan cất thư.', image_prompt: 'Lan bên bàn gỗ.', video_prompt: 'Máy quay theo tay Lan.', visual_ids: ['visual-1', 'visual-2', 'visual-3'], duration_seconds: 8 }] }] };
      return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: JSON.stringify(body.messages[1].content.includes('visual_ids') ? branches : analysis) } }], usage: { total_tokens: 100 } }), { status: 200 });
    }
    if (String(url).includes('typesafe.ai')) {
      const body = JSON.parse(options.body);
      if (body.questions.route) {
        assert.equal(body.questions.route.type, 'choice');
        return new Response(JSON.stringify({ model: 'jev-test', answers: { route: { type: 'choice', choice: 'item-1-branch-1', confidence: 0.82 } } }), { status: 200 });
      }
      assert.equal(body.state.comments.length, 2);
      return new Response(JSON.stringify({ model: 'jev-test', answers: {
        route_0: { type: 'choice', choice: 'item-1-branch-1', confidence: 0.92 },
        route_1: { type: 'choice', choice: 'other', confidence: 0.88 },
      } }), { status: 200 });
    }
    if (String(url).endsWith('/images/generations')) return new Response(JSON.stringify({ data: [{ url: 'https://demo.volces.com/image.png' }] }), { status: 200 });
    if (String(url).endsWith('/contents/generations/tasks')) return new Response(JSON.stringify({ id: 'cgt-test' }), { status: 200 });
    if (String(url).includes('/contents/generations/tasks/')) return new Response(JSON.stringify({ status: 'succeeded', content: { video_url: 'https://demo.volces.com/video.mp4' } }), { status: 200 });
    if (String(url).endsWith('/image.png')) return new Response(png, { status: 200 });
    if (String(url).endsWith('/video.mp4')) return new Response(mp4, { status: 200 });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    let p = productionCreate(db, { title: 'Bức thư', filename: 'full.md', script_text: 'Tập 1. Lan đến quán cà phê. Cô nhặt một bức thư bên bàn gỗ. Cô chưa biết người gửi. Lan quyết định cất thư rồi rời quán. Hết tập.' });
    assert.equal(p.analysis, null);
    p = await productionAnalyze(db, p.id);
    assert.equal(p.analysis.unresolved[0], 'Chưa có tập 2.');
    assert.equal(p.visuals.length, 3);
    p = productionSaveStory(db, p.id, { synopsis: 'Lan tìm bức thư và cân nhắc mở nó.', rules: p.analysis.rules, unresolved: p.analysis.unresolved, branch_points: p.analysis.branch_points });
    assert.match(p.analysis.synopsis, /cân nhắc/);
    assert.throws(() => productionLockVisuals(db, p.id), /duyệt câu chuyện/);
    p = productionApproveStory(db, p.id);
    for (const visual of p.visuals) {
      p = await productionGenerateVisual(db, join(dir, 'assets'), p.id, visual.id);
      const pending = p.assets.find((asset) => asset.subject_id === visual.id && asset.status === 'pending');
      p = productionApproveVisual(db, p.id, pending.id);
    }
    p = productionLockVisuals(db, p.id);
    assert.ok(p.visual_locked_at);
    assert.throws(() => productionSaveVisuals(db, p.id, { visual_style: 'phim mới', visuals: [] }), /đã khóa/);
    const job = productionQueueDraft(db, p.id, 'item-1');
    assert.equal(job.status, 'running');
    assert.equal(productionQueueDraft(db, p.id, 'item-1').already_running, true);
    assert.equal(productionGet(db, p.id).draft_jobs[0].status, 'running');
    p = await productionDraftBranches(db, p.id, p.analysis.branch_points[0].id);
    productionFinishDraftJob(db, job.id);
    assert.equal(productionGet(db, p.id).draft_jobs[0].status, 'completed');
    assert.equal(p.branches.length, 2);
    assert.equal(p.branch_sets['item-1'].scope_end, 'Kết thúc Tập 1');
    assert.deepEqual(p.branches[0].shots[0].visual_ids, ['visual-1', 'visual-2', 'visual-3']);
    p = productionApproveBranch(db, p.id, 'item-1-branch-1');
    p = await productionGenerateKeyframe(db, join(dir, 'assets'), p.id, 'item-1-branch-1', 'shot-1');
    const keyframe = p.assets.find((asset) => asset.kind === 'production_keyframe' && asset.status === 'pending');
    p = productionApproveKeyframe(db, p.id, 'item-1-branch-1', 'shot-1', keyframe.id);
    p = await productionCreateVideo(db, join(dir, 'assets'), p.id, 'item-1-branch-1', 'shot-1');
    assert.equal(p.branches[0].shots[0].status, 'queued');
    const videoCall = calls.find((call) => call.url.endsWith('/contents/generations/tasks'));
    assert.equal(JSON.parse(videoCall.options.body).content[1].image_url.url, 'https://demo.volces.com/image.png');
    p = await productionRefreshVideo(db, join(dir, 'media'), p.id, 'item-1-branch-1', 'shot-1');
    assert.equal(p.branches[0].shots[0].status, 'succeeded');
    p = productionPublishBranch(db, p.id, 'item-1-branch-1');
    assert.equal(p.branches[0].status, 'published');
    assert.equal(productionGet(db, p.id).branches[0].status, 'published');
    assert.equal(productionViewerGet(db, p.id).branches.length, 1);
    p = await productionDraftBranches(db, p.id, 'item-2');
    assert.equal(p.branch_sets['item-1'].branches[0].status, 'published');
    assert.equal(p.branch_sets['item-2'].branches.length, 2);
    assert.equal((await productionViewerRoute(db, p.id, 'Tôi muốn xem Lan mở thư.', 'item-1')).branch_id, 'item-1-branch-1');
    assert.equal(productionGet(db, p.id).viewer_intents.length, 1);
    assert.equal(productionGet(db, p.id).viewer_intents[0].point_id, 'item-1');
    const simulatedRoute = await productionViewerRoute(db, p.id, 'Tôi muốn xem Lan mở thư.', 'item-1', true);
    assert.equal(simulatedRoute.branch_id, 'item-1-branch-1');
    assert.equal(simulatedRoute.queued_for_producer, false);
    assert.equal(productionGet(db, p.id).viewer_intents.length, 1, 'Bình luận mô phỏng không được lưu như ý tưởng khán giả thật');
    const sessionComments = [
      { id: '00000000-0000-4000-8000-000000000001', message: 'Tôi muốn xem Lan mở thư.', simulated: true },
      { id: '00000000-0000-4000-8000-000000000002', message: 'Tôi muốn xem hướng khác.', simulated: false },
    ];
    const batch = await productionViewerRouteBatch(db, p.id, 'item-1', sessionComments);
    assert.deepEqual(batch.results.map((item) => item.branch_id), ['item-1-branch-1', null]);
    assert.equal(batch.results[0].queued_for_producer, false);
    assert.equal(batch.results[1].queued_for_producer, true);
    assert.equal(productionGet(db, p.id).viewer_intents.length, 2, 'Chỉ bình luận thật được lưu');
    await productionViewerRouteBatch(db, p.id, 'item-1', sessionComments);
    assert.equal(productionGet(db, p.id).viewer_intents.length, 2, 'Phân tích lại phiên xem không nhân đôi ý tưởng');
  } finally {
    global.fetch = originalFetch;
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bản nháp cũ vẫn được gắn với đúng điểm rẽ khi đọc dự án', () => {
  const dir = mkdtempSync(join(tmpdir(), 'living-production-legacy-'));
  const db = openStore(join(dir, 'test.sqlite'));
  try {
    const created = productionCreate(db, { title: 'Bản cũ', filename: 'script.md', script_text: 'Một kịch bản đủ dài để tạo dự án thử nghiệm và kiểm tra quá trình chuyển dữ liệu các phương án cũ sang cấu trúc mới.' });
    const payload = { analysis: { branch_points: [{ id: 'item-1' }] }, selected_point_id: 'item-1', branches: [{ id: 'branch-1', title: 'Giữ nguyên' }], model_runs: [] };
    db.prepare('UPDATE production_projects SET payload_json = ? WHERE id = ?').run(JSON.stringify(payload), created.id);
    const restored = productionGet(db, created.id);
    assert.equal(restored.branch_sets['item-1'].legacy, true);
    assert.equal(restored.branch_sets['item-1'].branches[0].title, 'Giữ nguyên');
    assert.equal(restored.branches[0].id, 'branch-1');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
