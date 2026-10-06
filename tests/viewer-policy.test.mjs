import test from 'node:test';
import assert from 'node:assert/strict';
import { branchTeaser, buildSimulatedComments, decideViewerPrompt, VIEWER_REVEAL_THRESHOLD } from '../public/viewer-policy.mjs';

const branches = [
  { id: 'base', title: 'Nhánh gốc', synopsis: 'Giả định: Fanny tìm thấy chiếc nhẫn.' },
  { id: 'alternative', title: 'Bóng tối không lời khai', synopsis: 'Giả định: Fanny mãi mãi không biết Elinor đã lấy nhẫn; cô ta chỉ phát hiện sau đó.' },
  { id: 'third', title: 'Nhân chứng im lặng', synopsis: 'Giả định: John nhìn thấy Elinor rời phòng.' },
];
const votes = (id, count) => Array.from({ length: count }, () => ({ status: id === 'other' ? 'other' : 'matched', branchId: id === 'other' ? null : id }));

test('lời mời cần đủ lượt, đủ tỷ lệ và dẫn trước nhánh khác', () => {
  assert.deepEqual(VIEWER_REVEAL_THRESHOLD, { minMatchingComments: 5, minShareOfAnalyzed: 0.25, minLeadOverNext: 2 });
  assert.equal(decideViewerPrompt(branches, 'base', []), null);
  assert.equal(decideViewerPrompt(branches, 'base', [...votes('alternative', 3), ...votes('third', 1), ...votes('other', 1)]), null);
  assert.equal(decideViewerPrompt(branches, 'base', [...votes('alternative', 5), ...votes('third', 4), ...votes('other', 11)]), null, 'Dẫn trước 1 ý kiến là chưa đủ');
  assert.equal(decideViewerPrompt(branches, 'base', [...votes('alternative', 5), ...votes('third', 2), ...votes('other', 14)]), null, 'Tỷ lệ dưới 25% là chưa đủ');
  const decision = decideViewerPrompt(branches, 'base', [...votes('alternative', 21), ...votes('third', 5), ...votes('other', 14)]);
  assert.equal(decision.branch.id, 'alternative');
  assert.equal(decision.votes, 21);
  assert.equal(decision.lead, 16);
  assert.equal(decision.share, 21 / 40);
  assert.equal(decideViewerPrompt(branches, 'alternative', [...votes('alternative', 21), ...votes('third', 5), ...votes('other', 14)]), null, 'Không gợi ý lại diễn biến đang xem');
});

test('mỗi lượt mô phỏng có 5 bình luận và không cố định 3 phiếu cho một nhánh', () => {
  const samples = buildSimulatedComments(branches, 1, () => 0.4);
  assert.equal(samples.length, 5);
  assert.equal(samples.filter((item) => item.branchId === null).length, 1);
  for (const branch of branches) assert.ok(samples.some((item) => item.branchId === branch.id));
  assert.ok(Math.max(...branches.map((branch) => samples.filter((item) => item.branchId === branch.id).length)) <= 2);
});

test('the teaser uses the branch summary premise and preserves story names', () => {
  assert.equal(branchTeaser(branches[1]), 'Curious what would happen if Fanny mãi mãi không biết Elinor đã lấy nhẫn?');
});
