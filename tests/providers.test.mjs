import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ARK_API_KEY = 'test-only-key';
process.env.JEV_API_KEY = 'test-only-key';
process.env.SEEDREAM_MODEL = 'dola-seedream-5-0-pro-260628';
process.env.SEEDREAM_TIMEOUT_MS = '300000';
const { classifyWithJev, routeViewerWithJev, routeViewerBatchWithJev, createSeedanceTask, generateSeedreamImage, getSeedanceTask, generateProductionText } = await import('../src/providers.mjs');

test('lỗi mạng ModelArk được báo rõ thay vì lỗi máy chủ chung', async () => {
  const original = global.fetch;
  global.fetch = async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('blocked'), { code: 'EACCES' }) }); };
  try { await assert.rejects(generateProductionText('Trả JSON.', 'Thử kết nối.'), (error) => error.status === 503 && /bị chặn kết nối/.test(error.message)); }
  finally { global.fetch = original; }
});

test('hợp đồng Seedream: nhận URL công khai và lưu bản ảnh tại máy', async () => {
  const original = global.fetch;
  const originalTimeout = AbortSignal.timeout;
  const calls = [];
  const timeouts = [];
  AbortSignal.timeout = (ms) => { timeouts.push(ms); return originalTimeout(ms); };
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(100)]);
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/images/generations')) return new Response(JSON.stringify({ data: [{ url: 'https://demo.volces.com/image.png' }] }), { status: 200 });
    return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });
  };
  try {
    const result = await generateSeedreamImage('Một nhân vật hư cấu');
    assert.equal(result.url, 'https://demo.volces.com/image.png');
    assert.deepEqual(result.bytes, png);
    const request = JSON.parse(calls[0].options.body);
    assert.equal(request.response_format, 'url');
    assert.equal(request.model, 'dola-seedream-5-0-pro-260628');
    assert.deepEqual(request.optimize_prompt_options, { mode: 'fast' });
    assert.deepEqual(timeouts, [300_000, 180_000]);
  } finally { global.fetch = original; AbortSignal.timeout = originalTimeout; }
});

test('hợp đồng Seedance: tạo tác vụ bằng URL ảnh và đọc trạng thái', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify(options.method === 'POST' ? { id: 'cgt-123' } : { id: 'cgt-123', status: 'running' }), { status: 200 });
  };
  try {
    const id = await createSeedanceTask({ prompt: 'Linh bước tới bàn.', duration: 12, images: [{ dataUrl: 'https://demo.volces.com/image.png', role: 'first_frame' }] });
    assert.equal(id, 'cgt-123');
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.content[1].image_url.url, 'https://demo.volces.com/image.png');
    assert.equal(payload.content[1].role, 'first_frame');
    assert.equal(payload.return_last_frame, true);
    assert.equal((await getSeedanceTask(id)).status, 'running');
    assert.match(calls[1].url, /\/contents\/generations\/tasks\/cgt-123$/);
  } finally { global.fetch = original; }
});

test('hợp đồng Jev: phân loại có mã bình luận và độ tin cậy', async () => {
  const original = global.fetch;
  global.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'jev-latest');
    assert.equal(payload.state.comments[0].id, 'c1');
    assert.equal(payload.questions.comment_0.type, 'choice');
    return new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { comment_0: { type: 'choice', choice: 'eavesdrop', confidence: 0.84, probabilities: { eavesdrop: 0.9, other: 0.1 } } } }), { status: 200 });
  };
  try {
    const result = await classifyWithJev([{ id: 'c1', body: 'Linh nên nghe lén.' }]);
    assert.deepEqual(result.results, [{ id: 'c1', intent: 'eavesdrop', confidence: 0.84 }]);
    assert.equal(result.modelVersion, 'jev-1.13.0');
  } finally { global.fetch = original; }
});

test('lỗi kết nối Jev được báo rõ thay vì lỗi máy chủ chung', async () => {
  const original = global.fetch;
  global.fetch = async () => {
    throw new TypeError('fetch failed', { cause: new AggregateError([Object.assign(new Error('blocked'), { code: 'EACCES' })], 'blocked') });
  };
  try {
    await assert.rejects(routeViewerWithJev('Nếu nhân vật không lấy nhẫn?', [{ id: 'branch-1', title: 'Hướng khác', synopsis: 'Không lấy nhẫn.' }]), (error) => error.status === 503 && /bị chặn kết nối ra Jev/.test(error.message));
  } finally { global.fetch = original; }
});

test('Jev phân tích nhiều bình luận trong một yêu cầu và giữ đúng mã từng bình luận', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls += 1;
    const payload = JSON.parse(options.body);
    assert.equal(payload.state.comments.length, 3);
    assert.equal(Object.keys(payload.questions).length, 3);
    return new Response(JSON.stringify({ answers: {
      route_0: { type: 'choice', choice: 'branch-1', confidence: 0.91 },
      route_1: { type: 'choice', choice: 'other', confidence: 0.8 },
      route_2: { type: 'choice', choice: 'branch-1', confidence: 0.71 },
    } }), { status: 200 });
  };
  try {
    const result = await routeViewerBatchWithJev([
      { id: 'comment-1', message: 'Xem hướng khác.' },
      { id: 'comment-2', message: 'Ánh sáng đẹp.' },
      { id: 'comment-3', message: 'Tôi chọn nhánh này.' },
    ], [{ id: 'branch-1', title: 'Hướng khác', synopsis: 'Câu chuyện đổi hướng.' }]);
    assert.equal(calls, 1);
    assert.deepEqual(result.map((item) => item.id), ['comment-1', 'comment-2', 'comment-3']);
    assert.deepEqual(result.map((item) => item.choice), ['branch-1', 'other', 'branch-1']);
  } finally { global.fetch = original; }
});
