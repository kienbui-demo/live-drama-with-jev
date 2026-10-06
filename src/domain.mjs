export const INTENTS = {
  confront_now: 'Đối chất ngay',
  eavesdrop: 'Nghe lén để hiểu chuyện',
  gather_evidence: 'Thu thập bằng chứng',
  keep_mystery: 'Giữ bí mật thêm',
  protect_linh: 'Bảo vệ Linh',
  other: 'Ý kiến khác',
};

const MATCHERS = [
  ['confront_now', /đối chất|hỏi thẳng|nói thẳng|tát|làm ầm|xông vào|bắt quả tang/i],
  ['eavesdrop', /nghe lén|ngồi bàn|nghe xem|theo dõi|quan sát|rình/i],
  ['gather_evidence', /bằng chứng|ghi âm|quay lại|chụp ảnh|tìm hiểu|điều tra/i],
  ['keep_mystery', /bí mật|đừng lộ|chưa tiết lộ|giữ kín|twist|bí ẩn|chưa vội/i],
  ['protect_linh', /bảo vệ linh|thương linh|tội linh|đừng để linh/i],
];

export function classifyComment(body) {
  const found = MATCHERS.filter(([, pattern]) => pattern.test(body)).map(([intent]) => intent);
  return found.length ? found : ['other'];
}

export function normalizeComment(body) {
  return body.trim().toLocaleLowerCase('vi').replace(/\s+/g, ' ');
}

export function summarizeAudience(comments, episodeId, now = new Date().toISOString()) {
  const usable = comments.filter((item) => !item.flags.includes('spam') && !item.flags.includes('duplicate'));
  if (usable.length === 0) throw new Error('Không có bình luận hợp lệ để tổng hợp.');
  const start = [...usable].map((x) => x.created_at).sort()[0];
  const end = [...usable].map((x) => x.created_at).sort().at(-1);
  const clusters = Object.entries(INTENTS).map(([intent, label]) => {
    const matching = usable.filter((item) => classifyComment(item.body).includes(intent));
    const authors = new Set(matching.map((item) => item.author_ref)).size;
    return {
      intent,
      label,
      count: matching.length,
      share: Number((matching.length / usable.length).toFixed(3)),
      confidence: matching.length === 0 ? 0 : Number(Math.min(0.94, 0.35 + Math.min(authors, 12) * 0.045).toFixed(2)),
      evidence: matching.slice(0, 3).map((item) => ({ event_id: item.id, sample_redacted: item.body })),
    };
  }).filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  return {
    schema_version: '1.0',
    episode_id: episodeId,
    source_mode: 'jev_mock',
    window: {
      start_at: start,
      end_at: end,
      event_count: usable.length,
      unique_authors: new Set(usable.map((x) => x.author_ref)).size,
    },
    clusters,
    quality: {
      spam_rate: Number(((comments.length - comments.filter((x) => !x.flags.includes('spam')).length) / comments.length).toFixed(3)),
      duplicate_rate: Number(((comments.length - comments.filter((x) => !x.flags.includes('duplicate')).length) / comments.length).toFixed(3)),
      warnings: usable.length < 10 ? ['Mẫu nhỏ, nên kiểm tra từng bình luận trước khi quyết định.'] : [],
    },
    model_version: 'keyword-demo-1',
    created_at: now,
  };
}

export function summarizeJevAudience(comments, classifications, modelVersion, episodeId, now = new Date().toISOString()) {
  const usable = comments.filter((item) => !item.flags.includes('spam') && !item.flags.includes('duplicate'));
  if (!usable.length || classifications.length !== usable.length) throw new Error('Dữ liệu Jev không đủ để tổng hợp.');
  const byId = new Map(classifications.map((item) => [item.id, item]));
  if (byId.size !== usable.length || usable.some((item) => !byId.has(item.id))) throw new Error('Bằng chứng Jev không khớp bình luận nguồn.');
  const ordered = [...usable].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const clusters = Object.entries(INTENTS).map(([intent, label]) => {
    const matching = usable.filter((item) => byId.get(item.id).intent === intent);
    return {
      intent, label, count: matching.length, share: Number((matching.length / usable.length).toFixed(3)),
      confidence: matching.length ? Number((matching.reduce((sum, item) => sum + byId.get(item.id).confidence, 0) / matching.length).toFixed(2)) : 0,
      evidence: matching.slice(0, 3).map((item) => ({ event_id: item.id, sample_redacted: item.body })),
    };
  }).filter((item) => item.count).sort((a, b) => b.count - a.count);
  return {
    schema_version: '1.0', episode_id: episodeId, source_mode: 'jev_live',
    window: { start_at: ordered[0].created_at, end_at: ordered.at(-1).created_at, event_count: usable.length, unique_authors: new Set(usable.map((item) => item.author_ref)).size },
    clusters,
    quality: { spam_rate: Number(((comments.length - comments.filter((item) => !item.flags.includes('spam')).length) / comments.length).toFixed(3)), duplicate_rate: Number(((comments.length - comments.filter((item) => !item.flags.includes('duplicate')).length) / comments.length).toFixed(3)), warnings: usable.length < 10 ? ['Mẫu nhỏ, nên kiểm tra từng bình luận trước khi quyết định.'] : [] },
    model_version: modelVersion, created_at: now,
  };
}

export function makeDecisionOptions(mind, state) {
  const counts = Object.fromEntries(mind.clusters.map((item) => [item.intent, item.count]));
  const evidence = (intent) => mind.clusters.find((item) => item.intent === intent)?.evidence.map((e) => e.event_id) ?? [];
  const audience = (intent) => Math.min(95, 45 + (counts[intent] ?? 0) * 5);
  const secretHidden = state.secrets.girl_identity === 'hidden';
  return [
    {
      option_id: 'A',
      title: 'Linh đối chất Minh ngay',
      action_summary: 'Linh bước tới bàn số 7 và yêu cầu Minh giải thích.',
      expected_effect: 'Căng thẳng bùng lên ngay; Minh có thể né tránh và Linh chưa có bằng chứng.',
      risks: ['Dễ đẩy cao trào lên quá sớm.', 'Thiếu thông tin để đối chất thuyết phục.'],
      score_breakdown: { audience: audience('confront_now'), coherence: 65, tension: 68, policy: 75, feasibility: 90 },
      constraints: [{ code: 'KEEP_SECRET', result: 'warn', explanation: 'Cần giữ danh tính cô gái chưa lộ trong lời thoại.' }],
      projected_state_diff: [
        { op: 'set', path: 'characters.linh.emotional_state', value: 'đối chất, mất bình tĩnh', reason: 'Linh chọn đối mặt ngay.' },
        { op: 'set', path: 'characters.minh.alerted', value: true, reason: 'Minh biết Linh đã thấy mình.' },
      ],
      evidence_refs: evidence('confront_now'),
    },
    {
      option_id: 'B',
      title: 'Linh ngồi bàn bên và thu bằng chứng',
      action_summary: 'Linh ngồi gần, bật ghi âm và nghe cuộc trò chuyện.',
      expected_effect: 'Vẫn có căng thẳng, Linh chủ động hơn và bí mật được giữ cho tập sau.',
      risks: ['Cần dàn dựng cảnh nghe lén rõ ràng trong thời lượng ngắn.'],
      score_breakdown: { audience: Math.max(audience('gather_evidence'), audience('eavesdrop')), coherence: 92, tension: 91, policy: 94, feasibility: 83 },
      constraints: [{ code: 'KEEP_SECRET', result: 'pass', explanation: 'Cô gái vẫn chưa được xác định danh tính.' }],
      projected_state_diff: [
        { op: 'set', path: 'characters.linh.has_recording', value: true, reason: 'Linh bật ghi âm ở bàn bên.' },
        { op: 'set', path: 'characters.linh.emotional_state', value: 'nghi ngờ nhưng kiểm soát', reason: 'Linh quyết định quan sát.' },
        { op: 'set', path: 'characters.minh.alerted', value: true, reason: 'Minh thoáng nhận ra Linh ở gần.' },
        { op: 'set', path: 'narrative.tension', value: 7, reason: 'Cuộc trò chuyện làm tăng nghi vấn.' },
      ],
      evidence_refs: [...evidence('gather_evidence'), ...evidence('keep_mystery')],
    },
    {
      option_id: 'C',
      title: 'Gọi mẹ Minh để hỏi danh tính cô gái',
      action_summary: 'Linh gọi mẹ Minh và yêu cầu nói ngay cô gái là ai.',
      expected_effect: 'Có lời giải nhanh nhưng phá mốc tiết lộ bí mật đã đặt.',
      risks: ['Lộ bí mật trước thời điểm đã chốt.'],
      score_breakdown: { audience: 48, coherence: 55, tension: 35, policy: 10, feasibility: 88 },
      constraints: [{ code: 'REVEAL_WINDOW', result: secretHidden ? 'fail' : 'pass', explanation: secretHidden ? 'Hồ sơ câu chuyện cấm tiết lộ danh tính trước tập 3.' : 'Bí mật đã được phép tiết lộ.' }],
      projected_state_diff: [{ op: 'reveal', path: 'secrets.girl_identity', value: 'public', reason: 'Mẹ Minh tiết lộ danh tính.' }],
      evidence_refs: evidence('other'),
    },
  ];
}

const ALLOWED_PATHS = new Set([
  'characters.linh.emotional_state',
  'characters.linh.has_recording',
  'characters.minh.alerted',
  'narrative.tension',
  'secrets.girl_identity',
]);

export function commitOption(state, option) {
  if (option.constraints.some((item) => item.result === 'fail')) throw new Error('Lựa chọn vi phạm quy tắc cứng.');
  const next = structuredClone(state);
  for (const change of option.projected_state_diff) {
    if (!ALLOWED_PATHS.has(change.path)) throw new Error(`Thay đổi không được phép: ${change.path}`);
    if (change.op === 'reveal' && change.path === 'secrets.girl_identity' && next.secrets.girl_identity === 'hidden') {
      throw new Error('Bí mật chưa đến thời điểm được phép tiết lộ.');
    }
    if (change.op !== 'set' && change.op !== 'reveal') throw new Error(`Phép thay đổi chưa hỗ trợ: ${change.op}`);
    const segments = change.path.split('.');
    let target = next;
    for (const segment of segments.slice(0, -1)) target = target[segment];
    target[segments.at(-1)] = change.value;
  }
  next.version = state.version + 1;
  next.parent_version = state.version;
  next.current_episode = state.current_episode + 1;
  next.narrative.open_threads = [...new Set([...state.narrative.open_threads, 'Minh đang che giấu điều gì?'])];
  return next;
}

export function makeEpisodePlan(state, option, decisionId) {
  const isB = option.option_id === 'B';
  const beats = isB
    ? ['Linh chọn bàn gần Minh thay vì đối chất.', 'Linh bật ghi âm khi Minh và cô gái tranh cãi.', 'Cô gái nói: “Anh chưa kể với chị ấy sao?”; Minh thấy Linh.']
    : ['Linh tiếp cận Minh.', 'Minh lúng túng trước câu hỏi của Linh.', 'Cuộc nói chuyện dừng ở một câu hỏi mới.'];
  return {
    schema_version: '1.0',
    episode_id: 'e2',
    canonical_state_version: state.version,
    decision_id: decisionId,
    narrative_goal: isB ? 'Linh chủ động thu bằng chứng nhưng chưa biết danh tính cô gái.' : 'Linh buộc Minh phản ứng trước sự hiện diện của mình.',
    cliffhanger: isB ? 'Cô gái: “Anh chưa kể với chị ấy sao?” Minh quay đầu và nhìn thấy Linh.' : 'Minh hỏi Linh: “Em đã nghe được bao nhiêu?”',
    beat_sheet: beats,
    screenplay: beats.map((beat, index) => `CẢNH ${index + 1}: ${beat}`).join('\n\n'),
    shot_plan: [
      { shot_id: 's1', duration_seconds: 12, action: beats[0], character_ids: ['linh', 'minh'], location_ref_id: 'restaurant_7', prop_ids: ['phone_linh'], costume_ref_ids: ['linh_black_coat', 'minh_dark_shirt'], reference_asset_ids: [], visual_instruction: 'Nhà hàng buổi tối, ánh vàng dịu, góc quay gần Linh.' },
      { shot_id: 's2', duration_seconds: 13, action: beats[1], character_ids: ['linh', 'minh', 'girl'], location_ref_id: 'restaurant_7', prop_ids: ['phone_linh'], costume_ref_ids: ['linh_black_coat', 'minh_dark_shirt'], reference_asset_ids: [], visual_instruction: 'Giữ nguyên vị trí bàn và trang phục, cận cảnh điện thoại.' },
      { shot_id: 's3', duration_seconds: 12, action: beats[2], character_ids: ['linh', 'minh', 'girl'], location_ref_id: 'restaurant_7', prop_ids: ['phone_linh'], costume_ref_ids: ['linh_black_coat', 'minh_dark_shirt'], reference_asset_ids: [], visual_instruction: 'Cận mặt Minh rồi cắt sang Linh; không để lộ danh tính cô gái.' },
    ],
    prompt_bundle_version: 'demo-1',
    script_approval: 'pending',
    video_approval: 'pending',
    publish_approval: 'pending',
  };
}
