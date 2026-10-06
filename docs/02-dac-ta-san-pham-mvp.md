# Đặc tả chức năng và dữ liệu Living Drama MVP

Trạng thái: đặc tả mục tiêu; bản chạy thử tại máy đã thực hiện một phần, xem `README.md`
Nguồn yêu cầu: `Living_Drama_PRD_Vi.docx`, phiên bản 1.0 (tệp nguồn riêng, không đưa lên Git)
Đọc cùng: `docs/01-kien-truc-he-thong.md`

Bộ định nghĩa dữ liệu: `docs/03-hop-dong-du-lieu.schema.json`. Mỗi đối tượng được tham chiếu bằng `$ref`, ví dụ `#/$defs/audienceMind`. Cần nối bộ kiểm theo chuẩn JSON Schema vào máy chủ trước khi nhận dữ liệu từ nhà cung cấp thật; hiện mã chỉ kiểm các quy tắc cốt lõi trong nghiệp vụ.

## 1. Phạm vi và từ ngữ

Bản đầu phục vụ một câu chuyện mẫu **Người phụ nữ ở bàn số 7**, ba tập, 30–100 bình luận mẫu hoặc nhập CSV, một người sáng tạo, tối đa ba lựa chọn diễn biến và một luồng tạo video có thể dùng video dự phòng. Mục tiêu là trình diễn trọn vòng từ phản hồi sau tập 1 đến tập 2 được duyệt và phát hành, rồi mở lựa chọn cho tập 4.

| Từ trong mã | Nghĩa trong sản phẩm |
| --- | --- |
| `StoryBible` | Hồ sơ nền tảng của câu chuyện |
| `WorldState` | Các sự thật đã chốt về thế giới truyện tại một phiên bản |
| `canon` | Mạch truyện chính thức đã được người sáng tạo chốt |
| `AudienceMind` | Bức tranh tổng hợp ý kiến khán giả, có bằng chứng và độ tin cậy |
| `StoryDecision` | Quyết định chọn hướng diễn biến cho tập kế |
| `branch` | Nhánh thử nghiệm chưa làm đổi mạch chính |
| `StateDiff` | Danh sách thay đổi cụ thể giữa hai phiên bản truyện |
| `EpisodePlan` | Kế hoạch nội dung và cảnh quay của một tập |

Các tên tiếng Anh trong khối mã là tên trường kỹ thuật; giao diện cho người dùng hiển thị bằng tiếng Việt.

## 2. Quy tắc nghiệp vụ không được vi phạm

1. Chỉ người sáng tạo được duyệt quyết định, kịch bản, video và phát hành.
2. Luật cứng hoặc quy định an toàn bị vi phạm (`fail`) thì không thể duyệt quyết định.
3. Nhánh thử nghiệm không làm đổi phiên bản truyện chính. Chỉ quyết định đã duyệt mới được chốt thành phiên bản mới.
4. Mọi tập được gắn với một phiên bản truyện chính thức. Phiên bản đã lỗi thời thì không thể phát hành.
5. Mỗi quyết định được duyệt cần lý do, bằng chứng và phần thay đổi dự kiến. Các kết quả có ít bằng chứng phải thể hiện độ tin cậy thấp.
6. Bí mật `hidden` không đi vào lời thoại, chỉ dẫn hình ảnh, video hoặc dữ liệu công khai trước khi có phép `reveal` được duyệt.
7. Một câu chuyện chỉ có một tập đang sản xuất dựa trên phiên bản truyện mới nhất trong MVP. Tập tiếp theo chỉ được khởi động sau khi tập này phát hành hoặc có quyết định điều chỉnh được ghi rõ.
8. Mọi lần chốt phiên bản hoặc phát hành phải ghi người thực hiện, thời gian và các tham chiếu đầu vào/đầu ra.

## 3. Hợp đồng dữ liệu

### 3.1 Quy ước chung

- Mã định danh là chuỗi opaque; không suy ra ý nghĩa từ mã.
- Thời gian theo ISO 8601 UTC. Các số `share` và `confidence` nằm trong `[0, 1]`; điểm chấm nằm trong `[0, 100]`.
- Mọi cấu trúc có `schema_version`. Giá trị liệt kê được quản lý phiên bản; không âm thầm thêm giá trị mà ứng dụng chưa hiểu.
- Dữ liệu thô từ nhà cung cấp phải được chuyển sang các cấu trúc dưới đây trước khi đi vào quy tắc nghiệp vụ.
- `created_at`, `updated_at`, `actor_id`, `correlation_id` là trường nền cho bản ghi và sự kiện cần truy vết.

### 3.2 Hồ sơ câu chuyện

```ts
type Visibility = 'hidden' | 'creator_only' | 'public';

interface StoryBible {
  schema_version: '1.0';
  show_id: string;
  title: string;
  premise: string;               // Tối đa 500 ký tự trong MVP
  characters: CharacterSpec[];    // Ít nhất 2
  secrets: SecretSpec[];          // Ít nhất 1
  hard_rules: string[];
  arc: {
    current_stage: string;
    intended_payoffs: Array<{
      thread_id: string;
      target_episode?: number;
      description: string;
    }>;
    planned_ending?: string;
  };
  creator_policy: {
    tone: string;
    prohibited_content: string[];
    requires_manual_approval: true;
    target_duration_seconds: { min: 30; max: 45 };
  };
  visual_bible_ref?: string;
}

interface CharacterSpec {
  id: string;
  name: string;
  public_facts: string[];
  private_facts: string[];
  goals: string[];
  traits: string[];
  relationship_refs: string[];
  visual_ref_ids: string[];
}

interface SecretSpec {
  id: string;
  description: string;
  holders: string[];
  visibility: Visibility;
  reveal_eligibility: string;
  payoff_window?: { earliest_episode?: number; latest_episode?: number };
}
```

Hệ thống giữ các phiên bản của hồ sơ câu chuyện. Thay luật cứng, bí mật hoặc kết thúc dự kiến sau khi đã phát hành cần lịch sử thay đổi và kiểm ảnh hưởng lên các kế hoạch tập đang mở.

Hồ sơ hình ảnh được lưu riêng để có thể cập nhật ảnh tham chiếu mà không sửa lịch sử nội dung:

```ts
interface VisualBible {
  schema_version: '1.0';
  visual_bible_id: string;
  show_id: string;
  version: number;
  frame_ratio: string;
  color_palette: string[];
  lighting_rules: string[];
  camera_rules: string[];
  characters: Array<{
    character_id: string;
    appearance: string;
    voice_note?: string;
    approved_reference_asset_ids: string[];
    costume_refs: Array<{ id: string; description: string; asset_ids: string[] }>;
  }>;
  locations: Array<{
    id: string;
    description: string;
    time_of_day: string;
    approved_reference_asset_ids: string[];
  }>;
  props: Array<{
    id: string;
    description: string;
    approved_reference_asset_ids: string[];
  }>;
}
```

Ảnh tham chiếu phải được người sáng tạo duyệt trước khi dùng. Mỗi tài sản lưu mã, đường dẫn nội bộ, loại tệp, nguồn, quyền sử dụng và mã băm để tránh dùng nhầm ảnh đã thay đổi.

### 3.3 Phiên bản thế giới truyện

```ts
interface WorldState {
  schema_version: '1.0';
  show_id: string;
  version: number;
  parent_version: number | null;
  source_decision_id?: string;
  created_at: string;
  current_episode: number;
  arc_stage: string;
  characters: Array<{
    id: string;
    known_fact_ids: string[];
    emotional_state: string;
    relationship_states: Record<string, string>;
    current_costume_ref?: string;
  }>;
  facts: Array<{
    id: string;
    text: string;
    visibility: Visibility;
    source_episode_id?: string;
  }>;
  secrets: Array<{
    id: string;
    visibility: Visibility;
    revealed_in_episode_id?: string;
  }>;
  open_threads: Array<{
    id: string;
    question: string;
    owner_character_id?: string;
    planned_payoff_episode?: number;
  }>;
  continuity: {
    location_ref_ids: string[];
    prop_states: Array<{
      prop_id: string;
      holder_character_id?: string;
      location_ref_id?: string;
      condition: string;
    }>;
  };
}
```

`WorldState` lưu sự thật cần cho tập sau, không lưu toàn bộ kịch bản. `version` chỉ tăng khi chốt một quyết định; bản chụp cũ không đổi. Hành động `reveal` phải thay cả trạng thái bí mật và tập được phép công bố.

### 3.4 Phản hồi và bức tranh ý kiến khán giả

```ts
type AudienceSource = 'seeded' | 'imported_csv';
type AudienceIntent =
  | 'confront_now'
  | 'eavesdrop'
  | 'gather_evidence'
  | 'protect_linh'
  | 'keep_mystery'
  | 'reveal_now'
  | 'other';

interface AudienceEvent {
  schema_version: '1.0';
  event_id: string;
  episode_id: string;
  source: AudienceSource;
  author_ref: string;           // Mã đã băm, không phải tên thô
  body_redacted: string;
  language: string;
  created_at: string;
  flags: Array<'spam' | 'duplicate' | 'toxic' | 'low_quality'>;
}

interface AudienceMind {
  schema_version: '1.0';
  mind_id: string;
  episode_id: string;
  source_mode: 'jev_live' | 'jev_mock';
  window: {
    start_at: string;
    end_at: string;
    event_count: number;
    unique_authors: number;
  };
  clusters: Array<{
    intent: AudienceIntent;
    count: number;
    share: number;
    confidence: number;
    evidence: Array<{ event_id: string; sample_redacted: string }>;
    impact_tags: Array<'pacing' | 'character_action' | 'secret_timing' | 'tone'>;
  }>;
  quality: {
    spam_rate: number;
    duplicate_rate: number;
    warnings: string[];
  };
  model_version: string;
  created_at: string;
}
```

`share` được tính trên số phản hồi hợp lệ trong cửa sổ; các nhóm ý kiến có thể chồng lấn nên tổng `share` có thể vượt 1. Giao diện phải nói rõ điều này. Mỗi nhóm trong demo cần ít nhất hai mẫu bằng chứng nếu có đủ dữ liệu. Không suy ra “đa số khán giả” từ mẫu quá nhỏ hoặc chất lượng thấp.

### 3.5 Quyết định và nhánh thử nghiệm

```ts
type DecisionStatus = 'proposed' | 'simulated' | 'approved' | 'rejected' | 'committed';
type ConstraintResult = 'pass' | 'warn' | 'fail';

interface StateOperation {
  op: 'set' | 'append' | 'resolve' | 'reveal';
  path: string;                 // Đường dẫn thuộc danh sách cho phép
  value?: unknown;
  reason: string;
}

interface StoryDecision {
  schema_version: '1.0';
  decision_id: string;
  show_id: string;
  mind_id: string;
  base_state_version: number;
  status: DecisionStatus;
  options: Array<{
    option_id: string;
    action_summary: string;
    expected_effect: string;
    risks: string[];
    score_breakdown: Record<
      'audience' | 'coherence' | 'tension' | 'policy' | 'feasibility', number
    >;
    constraints: Array<{
      code: string;
      result: ConstraintResult;
      explanation: string;
    }>;
    projected_state_diff: StateOperation[];
    evidence_refs: string[];
  }>;
  selected_option_id?: string;
  rationale?: string;
  approver_id?: string;
  committed_state_version?: number;
}
```

Tạo 2–3 lựa chọn trong MVP; mỗi lựa chọn cần hành động, tác động dự kiến, rủi ro, điểm từng mặt, kiểm ràng buộc và phần thay đổi dự kiến. Trọng số gợi ý từ PRD: phù hợp khán giả 25%, nhất quán truyện 25%, giá trị kịch tính 20%, phù hợp quy định người sáng tạo 20%, khả năng sản xuất 10%. Điểm không phải lệnh tự chọn. `StateOperation.path` dùng danh sách đường dẫn cho phép; không thực thi đường dẫn tùy ý do mô hình tạo.

Nhánh thử nghiệm giữ `base_state_version` và thay đổi dự kiến. Khi phiên bản gốc đổi, nhánh xung đột chuyển sang `stale`; muốn dùng lại phải mô phỏng trên phiên bản mới.

### 3.6 Kế hoạch tập và video

```ts
type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type VideoJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

interface EpisodePlan {
  schema_version: '1.0';
  plan_id: string;
  episode_id: string;
  show_id: string;
  canonical_state_version: number;
  decision_id?: string;
  narrative_goal: string;
  cliffhanger: string;
  beat_sheet: string[];
  screenplay: string;
  shot_plan: Array<{
    shot_id: string;
    duration_seconds: number;
    action: string;
    dialogue?: string;
    character_ids: string[];
    location_ref_id: string;
    prop_ids: string[];
    costume_ref_ids: string[];
    reference_asset_ids: string[];
    visual_instruction: string;
  }>;
  prompt_bundle_version: string;
  script_approval: ApprovalStatus;
  video_approval: ApprovalStatus;
  publish_approval: ApprovalStatus;
}

interface VideoJob {
  job_id: string;
  plan_id: string;
  provider_mode: 'seedance_live' | 'prepared_video';
  status: VideoJobStatus;
  idempotency_key: string;
  provider_job_ref?: string;
  output_asset_id?: string;
  error_code?: string;
  attempt_count: number;
}

interface VideoGenerationRequest {
  schema_version: '1.0';
  request_id: string;
  plan_id: string;
  visual_bible_version: number;
  prompt_bundle_version: string;
  shots: EpisodePlan['shot_plan'];
  reference_asset_ids: string[];
  output: { aspect_ratio: string; target_duration_seconds: number };
  idempotency_key: string;
}
```

Tổng thời lượng các cảnh của một kế hoạch MVP nằm trong 30–45 giây. `reference_asset_ids` và `visual_instruction` phải cùng phiên bản hồ sơ hình ảnh. Video Job trả về video nháp, không tự duyệt. Tập chỉ phát hành khi ba cổng duyệt đều `approved`, phiên bản truyện vẫn hợp lệ và tất cả liên kết quyết định/trạng thái đều khớp.

## 4. Giao diện lập trình nội bộ

Bảng dưới là hợp đồng mục tiêu, chưa phải toàn bộ đường dẫn của bản chạy thử. Bản chạy thử hiện dùng `/api/...`; các đường dẫn thực tế được liệt kê trong `README.md`. Khi mở rộng, chuẩn hóa về `/api/v1/...`. Lỗi mục tiêu trả `{ code, message, correlation_id, details? }`; `correlation_id` và khóa chống lặp cho mọi yêu cầu ghi chưa được áp dụng đầy đủ.

| Phương thức và đường dẫn | Chức năng | Kết quả chính |
| --- | --- | --- |
| `POST /shows` | Tạo hồ sơ câu chuyện, tạo `v0` | `201 { show_id, state_version: 0 }` |
| `GET /shows/:showId` | Tóm tắt câu chuyện và trạng thái | `200` |
| `PATCH /shows/:showId/story-bible` | Lưu phiên bản mới của hồ sơ câu chuyện | `200 { bible_version }` |
| `GET /shows/:showId/visual-bible` | Xem hồ sơ hình ảnh hiện hành | `200 VisualBible` |
| `PATCH /shows/:showId/visual-bible` | Lưu phiên bản hồ sơ hình ảnh mới | `200 { visual_bible_version }` |
| `GET /shows/:showId/states/:version` | Đọc bản chụp truyện | `200 WorldState` |
| `GET /shows/:showId/states/:a/diff/:b` | So sánh hai phiên bản | `200 { operations[] }` |
| `POST /episodes/:episodeId/audience-events/import` | Nhập CSV hoặc dữ liệu mẫu | `202 { import_job_id }` |
| `GET /episodes/:episodeId/audience-events` | Xem phản hồi đã lọc | `200 { items[], total }` |
| `POST /episodes/:episodeId/audience-minds` | Chạy Jev | `202 { job_id }` |
| `GET /episodes/:episodeId/audience-minds/latest` | Xem kết quả và bằng chứng | `200 AudienceMind` |
| `POST /shows/:showId/decisions` | Tạo lựa chọn diễn biến | `202 { job_id }` |
| `GET /decisions/:decisionId` | Xem lựa chọn, điểm và cảnh báo | `200 StoryDecision` |
| `POST /decisions/:decisionId/options/:optionId/simulate` | Thử một nhánh | `200 { projected_state_diff, constraint_checks }` |
| `POST /decisions/:decisionId/approve` | Duyệt lựa chọn kèm lý do | `200 { status: 'approved' }` |
| `POST /decisions/:decisionId/commit` | Chốt phiên bản truyện mới | `201 { state_version }` |
| `POST /episodes/:episodeId/plans` | Tạo kế hoạch tập từ phiên bản chốt | `202 { job_id }` |
| `PATCH /plans/:planId` | Người sáng tạo sửa kế hoạch/kịch bản | `200 EpisodePlan` |
| `POST /plans/:planId/approve-script` | Duyệt kịch bản | `200` |
| `POST /plans/:planId/video-jobs` | Gửi tạo video hoặc gắn bản dự phòng | `202 { video_job_id }` |
| `GET /video-jobs/:jobId` | Xem trạng thái và video nháp | `200 VideoJob` |
| `POST /plans/:planId/approve-video` | Duyệt video | `200` |
| `POST /episodes/:episodeId/approve-publish` | Duyệt phát hành sau khi script và video đã duyệt | `200` |
| `POST /episodes/:episodeId/publish` | Phát hành trong môi trường demo | `200 { published_at }` |
| `GET /episodes/:episodeId` | Xem tập và video đã phát hành | `200` |
| `GET /episodes/:episodeId/audit` | Xem chuỗi truy vết | `200 { plan, decision, mind, evidence, state, approvals }` |

Nhập CSV yêu cầu các cột `episode_id, author_ref, body, language, created_at`. Người nhập có thể không có `event_id`; hệ thống cấp mã mới. Không chấp nhận `episode_id` không khớp tập đang nhập. Dòng sai được báo riêng; không làm mất các dòng hợp lệ.

Mã lỗi chính: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `STATE_VERSION_CONFLICT` (409), `HARD_RULE_FAILED` (422), `PLAN_STALE` (409), `APPROVAL_REQUIRED` (422), `PROVIDER_UNAVAILABLE` (503), `PROVIDER_OUTPUT_INVALID` (502).

## 5. Trạng thái và cổng duyệt

```text
Quyết định: đề xuất → thử nhánh → duyệt hoặc từ chối → chốt vào truyện
Kịch bản: nháp → chỉnh sửa → duyệt
Video: chờ → đang tạo → thành công hoặc lỗi → duyệt
Tập: đang soạn → sẵn sàng → phát hành
```

- Từ `rejected` không thể chuyển sang `committed`; tạo quyết định mới nếu muốn sửa nội dung.
- Thay `screenplay` hoặc `shot_plan` sau duyệt đặt lại `script_approval` và `video_approval` về `pending`.
- Đổi video sau duyệt đặt lại `video_approval` và `publish_approval` về `pending`.
- Duyệt phát hành yêu cầu kịch bản và video đã duyệt; thao tác phát hành vẫn kiểm lại toàn bộ điều kiện trong một giao dịch.
- Đổi phiên bản truyện hiện hành sau khi tạo kế hoạch đặt kế hoạch vào trạng thái cần xem lại; không tự dùng bản cũ để phát hành.
- Nhấn lại nút chốt hoặc phát hành với cùng khóa chống lặp trả lại cùng kết quả, không tạo bản ghi thứ hai.

## 6. Lớp kết nối nhà cung cấp

### Jev

Đầu vào: phản hồi đã làm sạch, bộ nhóm ý kiến phiên bản hóa, mã tập, cửa sổ thời gian và quy định an toàn. Đầu ra: `AudienceMind` hoặc lỗi có mã. Bộ kiểm tra phía máy chủ xác nhận trường bắt buộc, giá trị số, mã ý định, mã bằng chứng và tập nguồn. Nếu đầu ra sai cấu trúc, tác vụ thất bại và không cho bộ quyết định dùng kết quả đó. Bản giả lập phải đi qua cùng bộ kiểm tra.

### Mô hình viết

Đầu vào gồm phiên bản truyện đã chốt, lựa chọn được duyệt, mục tiêu tập, những sự thật được phép dùng và tài sản hình ảnh liên quan. Đầu ra gồm tóm tắt, dàn ý, kịch bản và kế hoạch cảnh. Trước khi lưu, hệ thống kiểm đúng cấu trúc, thời lượng, mã tham chiếu và việc bí mật bị lộ. Người sáng tạo sửa và duyệt bản kết quả.

### Seedance

Đầu vào của lớp kết nối: kế hoạch cảnh đã duyệt, chỉ dẫn hình ảnh, mã ảnh tham chiếu và khóa chống lặp. Đầu ra chuẩn: mã tác vụ nhà cung cấp, trạng thái, mã video hoặc lỗi. Cách gọi, cơ chế theo dõi trạng thái và giới hạn ảnh tham chiếu phải xác nhận từ tài liệu nhà cung cấp; không ghi giả định API vào lõi sản phẩm. Chế độ video chuẩn bị sẵn tạo cùng `VideoJob` để phần còn lại của hệ thống hoạt động thống nhất.

## 7. Màn hình và thao tác

| Màn hình | Thông tin bắt buộc | Thao tác chính |
| --- | --- | --- |
| Tổng quan | Các tập, phiên bản truyện, tiến độ | Mở tập hoặc tạo tập |
| Hồ sơ câu chuyện | Tiền đề, nhân vật, bí mật, luật cứng, hồ sơ hình ảnh | Sửa và lưu bản nháp |
| Thế giới truyện | Sự thật, cảm xúc nhân vật, câu hỏi còn mở, so sánh phiên bản | Xem phần thay đổi |
| Hộp thư phản hồi | Bình luận, tập nguồn, cờ spam, trạng thái | Nhập và chạy tổng hợp |
| Ý kiến khán giả | Các nhóm ý kiến, số lượng, tỷ trọng, độ tin cậy, mẫu bằng chứng | Xem bằng chứng |
| Bảng lựa chọn | 2–3 hướng, điểm từng mặt, lỗi luật cứng, phần thay đổi dự kiến | Thử, duyệt, từ chối |
| Không gian làm tập | Tóm tắt, dàn ý, kịch bản, cảnh quay | Tạo, sửa, duyệt |
| Tác vụ video | Tiến độ, bản nháp, lỗi, cách thử lại | Xem, thử lại, duyệt |
| Lịch sử | Bằng chứng → quyết định → phiên bản truyện → tập | Lần theo nguyên nhân |

## 8. Kịch bản chấp nhận

| Mã | Điều kiện kiểm tra | Kết quả phải đạt |
| --- | --- | --- |
| AC-01 | Tạo câu chuyện từ hồ sơ hợp lệ | Có `v0`, hai nhân vật, một bí mật, luật cứng, lịch sử tạo |
| AC-02 | Nhập bình luận và chạy Jev | Có ít nhất ba nhóm ý kiến; mỗi nhóm có số lượng, tỷ trọng, độ tin cậy và ít nhất hai mẫu khi dữ liệu cho phép |
| AC-03 | Tạo quyết định từ ý kiến + truyện | Có 2–3 lựa chọn, điểm từng mặt, kết quả kiểm luật, thay đổi dự kiến |
| AC-04 | Cố duyệt lựa chọn vi phạm luật cứng | Bị chặn; giao diện giải thích lỗi; không tạo phiên bản truyện mới |
| AC-05 | Duyệt và chốt lựa chọn B | Phiên bản mới chỉ đọc, có lý do, bằng chứng, người duyệt và phần thay đổi |
| AC-06 | Tạo tập 2 từ phiên bản đã chốt | Linh có ghi âm, Minh đã cảnh giác, danh tính cô gái vẫn chưa lộ |
| AC-07 | Tạo video thành công hoặc thất bại | Trạng thái và lỗi/thử lại thấy được; có thể gắn video dự phòng |
| AC-08 | Xem tập 2 đã phát hành | Lần được tập → kế hoạch → quyết định → ý kiến → bằng chứng → phiên bản truyện |
| AC-09 | Đổi phiên bản truyện sau khi tạo kế hoạch | Kế hoạch cũ bị chặn phát hành và được báo cần xem lại |
| AC-10 | Kết quả Jev sai cấu trúc hoặc thiếu bằng chứng | Tác vụ báo lỗi; không phát quyết định từ dữ liệu chưa kiểm tra |
| AC-11 | Video đổi ngoại hình hoặc đạo cụ chính | Người sáng tạo đánh dấu lỗi và yêu cầu tạo lại riêng cảnh hoặc dùng bản dự phòng |

## 9. Chỉ tiêu vận hành bản demo

- Tổng hợp 100 bình luận dưới 60 giây; đề xuất diễn biến dưới 30 giây; tải màn hình trạng thái dưới 2 giây trong môi trường demo.
- Toàn bộ các lần chạy demo đi từ bình luận đến tập 2 được duyệt.
- Từ lúc nhập bình luận đến kịch bản đã duyệt dưới 10 phút; thời gian sinh video được tính riêng vì là tác vụ chờ.
- 100% quyết định đã duyệt có bằng chứng, lý do và phần thay đổi.
- 100% tập đã phát hành gắn đúng phiên bản truyện; không phát hành từ kế hoạch lỗi thời.
- Không mất phiên bản truyện nếu Jev, LLM hoặc Seedance lỗi; thử lại không nhân đôi tác vụ hoặc bản chụp.

## 10. Dữ liệu trình diễn và thứ tự triển khai

**Dữ liệu mẫu.** Tập 1: Linh thấy Minh cầm tay cô gái lạ; bí mật về cô gái chưa lộ. Phản hồi có cả ý muốn đối chất, theo dõi, thu bằng chứng và giữ bí mật. Tập 2: người sáng tạo duyệt hướng Linh ngồi gần để ghi âm; phiên bản mới ghi `Linh has_recording` và `Minh alerted`, bí mật vẫn ẩn. Tập 3 kết ở tin nhắn lạ và mở hai nhánh cho tập 4. Các tỷ lệ trong dữ liệu demo phải tính từ chính tệp mẫu, không cố định bằng số minh họa trong PRD.

**Thứ tự triển khai đề xuất:**

1. Hồ sơ câu chuyện, phiên bản truyện, luật cứng và so sánh thay đổi.
2. Nhập bình luận, Jev giả lập cùng bộ kiểm đầu ra, giao diện ý kiến khán giả.
3. Tạo lựa chọn, thử nhánh, duyệt và chốt bằng giao dịch.
4. Tạo kịch bản, hồ sơ hình ảnh, kế hoạch cảnh và các cổng duyệt.
5. Tác vụ video, video dự phòng, phát hành và lịch sử truy vết.
6. Thay Jev/LLM/Seedance giả lập bằng kết nối thật theo khả năng truy cập đã xác nhận.

## 11. Điều kiện hoàn tất và việc còn mở

MVP hoàn tất khi chạy được kịch bản chấp nhận AC-01 đến AC-11, trình diễn ba tập và lần ngược được tập đã phát hành đến phản hồi và thay đổi truyện. Chế độ giả lập hoặc video chuẩn bị sẵn được coi là hợp lệ cho demo khi được đánh dấu rõ; chúng không phải bằng chứng rằng nhà cung cấp thật đã tích hợp.

Cần chốt trước khi bắt đầu kết nối thật: tài liệu và quyền truy cập Jev, Seedance, nhà cung cấp LLM; bộ nhóm ý kiến cố định; nguồn ảnh/video tham chiếu; chính sách nội dung; người chịu trách nhiệm duyệt; môi trường chạy và ngân sách.
