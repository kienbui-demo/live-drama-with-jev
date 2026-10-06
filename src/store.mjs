import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizeComment } from './domain.mjs';

const COMMENT_GROUPS = [
  [
    'Linh nên đối chất ngay tại bàn số 7!',
    'Bắt quả tang rồi, hỏi thẳng Minh đi.',
    'Nếu là mình thì xông vào đối chất luôn.',
    'Đừng im lặng, Linh phải nói thẳng.',
    'Đối chất ngay mới đã, chờ gì nữa?',
    'Linh làm ầm lên để Minh không thể chối.',
  ],
  [
    'Khoan, Linh cứ ngồi bàn bên rồi nghe lén.',
    'Nghe xem Minh và cô gái nói gì đã.',
    'Ngồi bàn gần đó quan sát sẽ khôn hơn.',
    'Theo dõi thêm một chút, chưa nên lộ mặt.',
    'Linh nghe lén được một câu là đủ tạo cú sốc.',
    'Cứ ngồi bàn bên, Minh chưa biết Linh ở đó.',
  ],
  [
    'Bật ghi âm lại làm bằng chứng đi Linh.',
    'Phải có bằng chứng rồi mới hỏi Minh.',
    'Linh nên quay lại cảnh này.',
    'Tìm hiểu cô gái là ai trước đã.',
    'Ghi âm cuộc nói chuyện rồi tính tiếp.',
    'Chụp ảnh bàn số 7 làm bằng chứng.',
  ],
  [
    'Giữ bí mật danh tính cô gái thêm vài tập nhé.',
    'Đừng lộ twist sớm quá, đang hay.',
    'Mình thích bí ẩn này, chưa tiết lộ vội.',
    'Cứ giữ kín thân phận cô ấy để còn đoán.',
    'Bí mật này mà lộ ngay thì hết hồi hộp.',
    'Chưa vội giải thích, cho Linh tự tìm ra.',
  ],
  [
    'Thương Linh quá, mong cô ấy bình tĩnh.',
    'Bảo vệ Linh, đừng để Minh dắt mũi.',
    'Tội Linh thật sự, ánh mắt đó đau quá.',
    'Đừng để Linh chịu thêm cú sốc vô ích.',
    'Linh phải giữ bình tĩnh để bảo vệ mình.',
    'Mình đứng về phía Linh.',
  ],
  [
    'Có khi cô gái là người nhà Minh thì sao?',
    'Chi tiết chiếc nhẫn trên tay Minh lạ thật.',
    'Nhạc cuối tập làm mình nổi da gà.',
    'Bàn số 7 chắc còn nhiều chuyện.',
    'Tập sau bao giờ ra vậy?',
    'Mình nghĩ Minh đang che giấu chuyện gia đình.',
  ],
];

export const STORY_BIBLE = {
  title: 'Người phụ nữ ở bàn số 7',
  premise: 'Linh thấy chồng mình là Minh cầm tay một cô gái lạ ở nhà hàng. Điều cô thấy có phải là phản bội?',
  characters: [
    { id: 'linh', name: 'Linh', goal: 'Tìm sự thật mà không đánh mất quyền chủ động', traits: 'Tinh ý, kiềm chế cảm xúc' },
    { id: 'minh', name: 'Minh', goal: 'Giữ kín bí mật gia đình', traits: 'Lúng túng, cố bảo vệ người thân' },
    { id: 'girl', name: 'Cô gái lạ', goal: 'Được Minh thừa nhận sự thật', traits: 'Kiên quyết, khó đoán' },
  ],
  secrets: [{ id: 'girl_identity', description: 'Danh tính thật của cô gái', visibility: 'hidden', earliest_reveal_episode: 3 }],
  hard_rules: [
    'Không tiết lộ danh tính cô gái trước tập 3.',
    'Linh không biết bí mật gia đình của Minh ở cuối tập 1.',
    'Mọi tập phải có người sáng tạo duyệt trước khi phát hành.',
  ],
  arc: 'Nghi ngờ → thu thập dấu vết → đối mặt với bí mật gia đình',
  intended_payoff: 'Danh tính cô gái được tiết lộ khi sự lựa chọn của Minh đã tạo đủ hậu quả.',
};

export const INITIAL_STATE = {
  schema_version: '1.0',
  show_id: 'show-1',
  version: 1,
  parent_version: 0,
  current_episode: 1,
  characters: {
    linh: { emotional_state: 'bàng hoàng, nghi ngờ', has_recording: false },
    minh: { emotional_state: 'căng thẳng', alerted: false },
    girl: { emotional_state: 'kiên quyết' },
  },
  secrets: { girl_identity: 'hidden' },
  narrative: { tension: 5, open_threads: ['Minh có phản bội Linh không?', 'Cô gái là ai?'] },
  continuity: {
    location: 'Nhà hàng, bàn số 7, buổi tối',
    costumes: { linh: 'Áo khoác đen', minh: 'Sơ mi tối màu' },
    props: { phone_linh: 'Linh cầm điện thoại; chưa có bản ghi âm' },
  },
};

export function openStore(filePath = process.env.LIVING_DRAMA_DB || join(process.cwd(), 'data', 'living-drama.sqlite')) {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS shows (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, bible_json TEXT NOT NULL,
      current_version INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS world_states (
      show_id TEXT NOT NULL, version INTEGER NOT NULL, snapshot_json TEXT NOT NULL,
      decision_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY(show_id, version)
    );
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY, show_id TEXT NOT NULL, number INTEGER NOT NULL,
      title TEXT NOT NULL, summary TEXT NOT NULL, status TEXT NOT NULL,
      state_version INTEGER, decision_id TEXT, plan_json TEXT, video_path TEXT,
      published_at TEXT
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY, episode_id TEXT NOT NULL, author_ref TEXT NOT NULL,
      body TEXT NOT NULL, language TEXT NOT NULL, created_at TEXT NOT NULL,
      source TEXT NOT NULL, flags_json TEXT NOT NULL, dedup_key TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS audience_minds (
      id TEXT PRIMARY KEY, episode_id TEXT NOT NULL, payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY, show_id TEXT NOT NULL, mind_id TEXT NOT NULL,
      base_version INTEGER NOT NULL, status TEXT NOT NULL, options_json TEXT NOT NULL,
      selected_option_id TEXT, rationale TEXT, approver_id TEXT,
      committed_version INTEGER, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY, show_id TEXT NOT NULL, event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visual_assets (
      id TEXT PRIMARY KEY, show_id TEXT NOT NULL, kind TEXT NOT NULL,
      subject_id TEXT NOT NULL, prompt TEXT NOT NULL, path TEXT NOT NULL,
      source TEXT NOT NULL, status TEXT NOT NULL, sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL, public_url TEXT, expires_at TEXT
    );
    CREATE TABLE IF NOT EXISTS video_shots (
      id TEXT PRIMARY KEY, episode_id TEXT NOT NULL, shot_id TEXT NOT NULL,
      task_id TEXT NOT NULL, status TEXT NOT NULL, prompt TEXT NOT NULL,
      reference_asset_ids_json TEXT NOT NULL, video_path TEXT,
      last_frame_path TEXT, error TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, UNIQUE(episode_id, shot_id)
    );
    CREATE TABLE IF NOT EXISTS visual_bibles (
      show_id TEXT NOT NULL, version INTEGER NOT NULL, payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL, PRIMARY KEY(show_id, version)
    );
    CREATE TABLE IF NOT EXISTS production_projects (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, filename TEXT NOT NULL,
      script_text TEXT NOT NULL, payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS production_draft_jobs (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, point_id TEXT NOT NULL,
      status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_running_draft_per_point
      ON production_draft_jobs(project_id, point_id) WHERE status = 'running';
    CREATE TABLE IF NOT EXISTS viewer_intents (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, message TEXT NOT NULL,
      choice TEXT NOT NULL, confidence REAL NOT NULL, created_at TEXT NOT NULL,
      point_id TEXT
    );
  `);
  const assetColumns = db.prepare('PRAGMA table_info(visual_assets)').all().map((row) => row.name);
  if (!assetColumns.includes('public_url')) db.exec('ALTER TABLE visual_assets ADD COLUMN public_url TEXT');
  if (!assetColumns.includes('expires_at')) db.exec('ALTER TABLE visual_assets ADD COLUMN expires_at TEXT');
  const intentColumns = db.prepare('PRAGMA table_info(viewer_intents)').all().map((row) => row.name);
  if (!intentColumns.includes('point_id')) db.exec('ALTER TABLE viewer_intents ADD COLUMN point_id TEXT');
  if (!db.prepare('SELECT 1 FROM shows WHERE id = ?').get('show-1')) seedStore(db);
  if (!db.prepare('SELECT 1 FROM visual_bibles WHERE show_id = ?').get('show-1')) {
    const visual = {
      version: 1,
      style: 'Phim tâm lý điện ảnh, hiện thực, màu ấm trầm, tỉ lệ 16:9, ánh đèn vàng nhà hàng buổi tối.',
      location: 'Nhà hàng nhỏ, bàn số 7 cạnh cửa sổ, đèn treo ánh vàng, nội thất gỗ tối.',
      props: 'Điện thoại của Linh màu đen, dùng để ghi âm; bố trí bàn ghế không đổi giữa các cảnh.',
      characters: {
        linh: { appearance: 'Phụ nữ Việt khoảng 30 tuổi, tóc đen ngang vai, nét mặt sắc sảo.', costume: 'Áo khoác đen.' },
        minh: { appearance: 'Nam giới Việt khoảng 32 tuổi, tóc đen ngắn, dáng cao gầy.', costume: 'Sơ mi tối màu.' },
        girl: { appearance: 'Phụ nữ Việt trẻ khoảng 25 tuổi, tóc dài đen, thần thái kiên quyết.', costume: 'Áo kem nhạt.' },
      },
    };
    db.prepare('INSERT INTO visual_bibles VALUES (?, ?, ?, ?)').run('show-1', 1, JSON.stringify(visual), new Date().toISOString());
  }
  return db;
}

export function audit(db, eventType, payload) {
  db.prepare('INSERT INTO audit_events VALUES (?, ?, ?, ?, ?)')
    .run(randomUUID(), 'show-1', eventType, JSON.stringify(payload), new Date().toISOString());
}

export function seedStore(db) {
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO shows VALUES (?, ?, ?, ?, ?)').run('show-1', STORY_BIBLE.title, JSON.stringify(STORY_BIBLE), 1, now);
    db.prepare('INSERT INTO world_states VALUES (?, ?, ?, ?, ?)').run('show-1', 1, JSON.stringify(INITIAL_STATE), null, now);
    const insertEpisode = db.prepare('INSERT INTO episodes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    insertEpisode.run('e1', 'show-1', 1, 'Phát hiện', 'Linh thấy Minh cầm tay một cô gái lạ ở bàn số 7.', 'published', 1, null, null, null, now);
    insertEpisode.run('e2', 'show-1', 2, 'Bàn bên cạnh', 'Diễn biến sẽ được chọn từ phản hồi khán giả.', 'draft', null, null, null, null, null);
    insertEpisode.run('e3', 'show-1', 3, 'Tin nhắn lạ', 'Tập mẫu trong kế hoạch câu chuyện; chưa sản xuất.', 'planned', null, null, null, null, null);
    const insertComment = db.prepare('INSERT INTO comments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    let index = 0;
    for (const group of COMMENT_GROUPS) {
      for (const body of group) {
        index += 1;
        const author = `fan-${String(index).padStart(2, '0')}`;
        const createdAt = new Date(Date.now() - (COMMENT_GROUPS.length * 6 - index) * 60_000).toISOString();
        const dedupKey = createHash('sha256').update(`${author}|${normalizeComment(body)}|${createdAt}`).digest('hex');
        insertComment.run(`c-${String(index).padStart(3, '0')}`, 'e1', author, body, 'vi', createdAt, 'seeded', '[]', dedupKey);
      }
    }
    audit(db, 'demo_seeded', { comments: index, state_version: 1 });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function listComments(db) {
  return db.prepare('SELECT * FROM comments WHERE episode_id = ? ORDER BY created_at DESC').all('e1')
    .map((row) => ({ ...row, flags: JSON.parse(row.flags_json) }));
}

export function hashAuthor(author) {
  return createHash('sha256').update(author).digest('hex').slice(0, 16);
}
