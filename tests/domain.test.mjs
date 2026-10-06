import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyComment, commitOption, makeDecisionOptions, makeEpisodePlan, summarizeAudience, summarizeJevAudience } from '../src/domain.mjs';
import { INITIAL_STATE } from '../src/store.mjs';

const comments = [
  { id: '1', body: 'Linh nên ghi âm làm bằng chứng', author_ref: 'a', flags: [], created_at: '2026-01-01T00:00:00Z' },
  { id: '2', body: 'Ngồi bàn bên nghe lén đi', author_ref: 'b', flags: [], created_at: '2026-01-01T00:01:00Z' },
  { id: '3', body: 'Đừng lộ bí mật quá sớm', author_ref: 'c', flags: [], created_at: '2026-01-01T00:02:00Z' },
  { id: '4', body: 'spam đối chất', author_ref: 'd', flags: ['spam'], created_at: '2026-01-01T00:03:00Z' },
];

test('tổng hợp chỉ dùng phản hồi hợp lệ và giữ bằng chứng', () => {
  const mind = summarizeAudience(comments, 'e1');
  assert.equal(mind.window.event_count, 3);
  assert.equal(mind.window.unique_authors, 3);
  assert.equal(mind.clusters.find((x) => x.intent === 'gather_evidence').evidence[0].event_id, '1');
  assert.equal(mind.clusters.some((x) => x.intent === 'confront_now'), false);
  assert.ok(mind.quality.spam_rate > 0);
});

test('từ khóa có thể thuộc nhiều nhóm ý kiến', () => {
  assert.deepEqual(classifyComment('Nghe lén rồi ghi âm làm bằng chứng'), ['eavesdrop', 'gather_evidence']);
});

test('Jev thật chỉ tổng hợp kết quả có bằng chứng khớp từng bình luận', () => {
  const rows = [
    { id: '1', intent: 'gather_evidence', confidence: 0.9 },
    { id: '2', intent: 'eavesdrop', confidence: 0.8 },
    { id: '3', intent: 'keep_mystery', confidence: 0.7 },
  ];
  const mind = summarizeJevAudience(comments, rows, 'jev-1.13.0', 'e1');
  assert.equal(mind.source_mode, 'jev_live');
  assert.equal(mind.window.event_count, 3);
  assert.equal(mind.clusters.find((item) => item.intent === 'gather_evidence').confidence, 0.9);
  assert.throws(() => summarizeJevAudience(comments, rows.slice(1), 'jev-1.13.0', 'e1'));
});

test('quy tắc cứng chặn tiết lộ bí mật và nhánh thử không đổi bản gốc', () => {
  const mind = summarizeAudience(comments, 'e1');
  const options = makeDecisionOptions(mind, INITIAL_STATE);
  assert.equal(options.length, 3);
  assert.equal(options.find((x) => x.option_id === 'C').constraints[0].result, 'fail');
  assert.throws(() => commitOption(INITIAL_STATE, options.find((x) => x.option_id === 'C')));
  const next = commitOption(INITIAL_STATE, options.find((x) => x.option_id === 'B'));
  assert.equal(INITIAL_STATE.version, 1);
  assert.equal(INITIAL_STATE.characters.linh.has_recording, false);
  assert.equal(next.version, 2);
  assert.equal(next.parent_version, 1);
  assert.equal(next.characters.linh.has_recording, true);
  assert.equal(next.secrets.girl_identity, 'hidden');
  const plan = makeEpisodePlan(next, options.find((x) => x.option_id === 'B'), 'decision-1');
  assert.equal(plan.canonical_state_version, 2);
  assert.equal(plan.shot_plan.reduce((sum, shot) => sum + shot.duration_seconds, 0), 37);
  assert.match(plan.screenplay, /ghi âm/);
});
