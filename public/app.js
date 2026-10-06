import { uiErrorMessage } from './ui-errors.mjs';

const content = document.querySelector('#content');
const nav = document.querySelector('#nav');
const toastEl = document.querySelector('#toast');
const csvInput = document.querySelector('#csv-file');
const videoInput = document.querySelector('#video-file');

let data = null;
let view = location.hash.slice(1) || 'overview';
let search = '';
let sourceFilter = 'all';
let toastTimer;

const titles = {
  overview: 'Story overview',
  comments: 'Simulated comments',
  mind: 'Audience insights',
  decisions: 'Choose story path',
  studio: 'Produce next episode',
  visuals: 'Visual profile',
  audit: 'Decision history',
};
const scoreLabels = { audience: 'Audience fit', coherence: 'Story coherence', tension: 'Dramatic tension', policy: 'Rule compliance', feasibility: 'Production feasibility' };
const eventLabels = {
  demo_seeded: 'Demo data loaded',
  comments_imported: 'Comments imported',
  audience_mind_created: 'Audience insights summarized',
  decision_proposed: 'Story paths proposed',
  decision_approved: 'Story path approved',
  state_committed: 'Main story state updated',
  episode_plan_created: 'Episode 2 plan created',
  script_edited: 'Script edited',
  script_approved: 'Script approved',
  prepared_video_attached: 'Existing video attached',
  video_approved: 'Video approved',
  publish_approved: 'Publication approved',
  episode_published: 'Episode 2 published',
  visual_asset_generated: 'Reference image generated with Seedream',
  visual_asset_approved: 'Reference image approved',
  seedance_task_created: 'Shot submitted to Seedance',
  seedance_task_updated: 'Seedance shot progress updated',
  visuals_invalidated: 'Visuals and shots invalidated after changes',
  visual_bible_updated: 'Visual profile updated',
  seedance_shot_rejected: 'Shot revision requested',
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function date(value) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
function showToast(message, error = false) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = `toast show${error ? ' error' : ''}`;
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 4300);
}
async function api(path, options = {}) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(uiErrorMessage(result, 'Action failed'));
  return result;
}
async function post(path, body) {
  return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
}
async function refresh() {
  data = await api('/api/bootstrap');
  render();
}
function setView(next) {
  view = titles[next] ? next : 'overview';
  history.replaceState(null, '', `#${view}`);
  render();
  content.focus({ preventScroll: true });
  scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
  if (!data) return;
  document.querySelector('#page-title').textContent = titles[view];
  document.querySelector('#state-pill').textContent = `Story state v${data.state.version}`;
  document.querySelector('#comment-count').textContent = data.comments.length;
  nav.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  const screens = { overview: overview, comments, mind, decisions, visuals, studio, audit: auditScreen };
  content.innerHTML = screens[view]();
}

function status(text, kind = '') { return `<span class="status ${kind}">${esc(text)}</span>`; }
function section(title, description = '', right = '') {
  return `<div class="section-head"><div><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div>${right ? `<div class="right">${right}</div>` : ''}</div>`;
}

function overview() {
  const { show, state, episodes, mind, decision } = data;
  return `
    <div class="hero"><div class="hero-content"><span class="eyebrow">SAMPLE STORY / INTERACTIVE SHORT DRAMA</span><h2>${esc(show.title)}</h2><p>${esc(show.bible.premise)}</p></div><span class="hero-badge">The secret remains hidden</span></div>
    <div class="grid-3 mt">
      <div class="metric"><span class="label">Sample comments</span><strong>${data.comments.length}</strong><small>From episode 1 and imported CSV files</small></div>
      <div class="metric"><span class="label">Story version</span><strong>v${state.version}</strong><small>Every committed change is recorded</small></div>
      <div class="metric"><span class="label">Episode 2 progress</span><strong>${episodes[1].status === 'published' ? 'Published' : decision?.status === 'committed' ? 'In production' : 'Awaiting a choice'}</strong><small>The creator makes the final decision</small></div>
    </div>
    ${section('Story production loop', 'Every step from audience feedback to the next episode can be reviewed.')}
    <div class="two-col"><div class="card"><div class="timeline">
      ${[
        ['01', 'Episode 1 · Discovery', 'Linh sees Minh at table 7.', 'published'],
        ['02', 'Audience comments', `${data.comments.length} comments are ready to review and summarize.`, 'comments'],
        ['03', 'Audience insights', mind ? `${mind.clusters.length} evidence-backed insight groups.` : 'Not summarized yet.', 'mind'],
        ['04', 'Choose a story path', decision ? `${decision.options.length} options; status: ${decision.status}.` : 'No options created yet.', 'decisions'],
        ['05', 'Episode 2 · The Next Table', episodes[1].status === 'published' ? 'Published.' : 'Awaiting script, video, and approvals.', 'studio'],
      ].map((item) => `<div class="timeline-item"><span class="timeline-num">${item[0]}</span><div><h3>${esc(item[1])}</h3><p>${esc(item[2])}</p></div></div>`).join('')}
    </div><div class="inline-actions mt"><button class="btn primary" data-view="comments">View comments →</button><button class="btn" data-view="audit">View history</button></div></div>
    <div><div class="card mb"><h3>Current story facts</h3><div class="fact-list">
      <div class="fact"><span class="symbol">●</span><span>Linh: ${esc(state.characters.linh.emotional_state)}${state.characters.linh.has_recording ? '; has a recording' : ''}.</span></div>
      <div class="fact"><span class="symbol">●</span><span>Minh: ${esc(state.characters.minh.emotional_state)}${state.characters.minh.alerted ? '; noticed Linh' : '; has not seen Linh'}.</span></div>
      <div class="fact"><span class="symbol">●</span><span>Girl’s identity: ${state.secrets.girl_identity === 'hidden' ? 'still secret' : 'revealed'}.</span></div>
      <div class="fact"><span class="symbol">●</span><span>Setting: ${esc(state.continuity.location)}.</span></div>
    </div></div><div class="callout"><strong>Continuity rule:</strong> New episode scripts must build on the committed story version. Experimental branches do not change official story facts.</div></div></div>
    ${section('Story profile', 'Constraints every option must respect.')}
    <div class="grid-3">${show.bible.characters.map((character) => `<div class="card"><h3>${esc(character.name)}</h3><p><strong>Goal:</strong> ${esc(character.goal)}</p><p><strong>Personality:</strong> ${esc(character.traits)}</p></div>`).join('')}</div>
    <div class="secret mt"><strong>Creator-only secret:</strong> ${esc(show.bible.secrets[0].description)}. Do not reveal before episode ${show.bible.secrets[0].earliest_reveal_episode}.</div>
  `;
}

function commentMarkup(list) {
  if (!list.length) return `<div class="empty"><h3>No comments found</h3><p>Try another search term or filter.</p></div>`;
  return list.map((comment) => `<article class="comment"><div class="comment-avatar">${esc(comment.author_ref.slice(0, 2).toUpperCase())}</div><div class="comment-main"><div class="comment-meta"><strong>${esc(comment.author_ref)}</strong><span>·</span><span>${esc(date(comment.created_at))}</span><span class="comment-source">${comment.source === 'seeded' ? 'Simulated' : 'Imported CSV'}</span></div><div class="comment-body">${esc(comment.body)}</div></div></article>`).join('');
}
function filteredComments() {
  return data.comments.filter((comment) => (sourceFilter === 'all' || comment.source === sourceFilter)
    && (!search || comment.body.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))));
}
function comments() {
  return `
    <div class="callout mb"><strong>Simulated data:</strong> These comments were prepared to test the product flow. You can also import a CSV file with <code>episode_id, author_ref, body, language, created_at</code> columns; author references are hashed before storage.</div>
    ${section('Feedback after episode 1', `${data.comments.length} comments · review each one before summarizing.`, `<button class="btn" data-action="import-csv">Import CSV</button><button class="btn primary" data-action="run-mind">Summarize insights →</button>`)}
    <div class="comment-toolbar"><input id="comment-search" class="search" type="search" placeholder="Search comments..." value="${esc(search)}" aria-label="Search comments"><select id="source-filter" class="select" aria-label="Filter by source"><option value="all" ${sourceFilter === 'all' ? 'selected' : ''}>All sources</option><option value="seeded" ${sourceFilter === 'seeded' ? 'selected' : ''}>Simulated comments</option><option value="imported_csv" ${sourceFilter === 'imported_csv' ? 'selected' : ''}>Imported CSV</option></select></div>
    <div class="split mb"><span id="result-count" class="muted tiny">Showing ${filteredComments().length} comments</span>${status('Episode 1 · Published', 'good')}</div>
    <div id="comment-list" class="comment-list">${commentMarkup(filteredComments())}</div>
  `;
}

function mind() {
  const mind = data.mind;
  if (!mind) return `<div class="empty"><h3>No summary yet</h3><p>Open the comments and run the summary step to see insight groups, supporting comments, and confidence levels.</p><button class="btn primary" data-view="comments">View comments →</button></div>`;
  return `
    <div class="callout mb"><strong>${mind.source_mode === 'jev_live' ? 'Live Jev:' : 'Simulated Jev mode:'}</strong> ${mind.source_mode === 'jev_live' ? `Results from model ${esc(mind.model_version)}. Each comment is assigned a primary intent; confidence is averaged across the group.` : 'The demo identifies keywords in comments. These are not results from the live Jev service.'}</div>
    <div class="grid-3"><div class="metric"><span class="label">Valid responses</span><strong>${mind.window.event_count}</strong><small>Since ${esc(date(mind.window.start_at))}</small></div><div class="metric"><span class="label">Commenters</span><strong>${mind.window.unique_authors}</strong><small>Counted by author ID</small></div><div class="metric"><span class="label">Insight groups</span><strong>${mind.clusters.length}</strong><small>A comment may belong to several groups</small></div></div>
    ${section('Insight groups', 'Shares are based on valid comments; groups may overlap.', `<button class="btn" data-action="run-mind">Summarize again</button><button class="btn primary" data-action="generate-decision">Generate story paths →</button>`)}
    <div class="cluster-grid">${mind.clusters.map((cluster) => `<article class="cluster"><div class="split"><h3>${esc(cluster.label)}</h3><span class="number">${Math.round(cluster.share * 100)}%</span></div><div class="bar"><span style="width:${Math.round(cluster.share * 100)}%"></span></div><div class="split"><span class="tiny muted">${cluster.count} comments</span><span class="tiny muted">Confidence ${Math.round(cluster.confidence * 100)}%</span></div><div class="evidence"><span>Supporting comments</span>${cluster.evidence.map((item) => `<p>“${esc(item.sample_redacted)}”</p>`).join('')}</div></article>`).join('')}</div>
    ${mind.quality.warnings.map((warning) => `<div class="callout mt">${esc(warning)}</div>`).join('')}
  `;
}

function decisions() {
  const decision = data.decision;
  if (!decision) return `<div class="empty"><h3>No story paths yet</h3><p>The system needs audience insights and the current story version to propose paths for the next episode.</p><button class="btn primary" data-action="generate-decision" ${!data.mind ? 'disabled' : ''}>Generate paths →</button>${!data.mind ? '<p>Summarize the comments first.</p>' : ''}</div>`;
  const selected = decision.options.find((option) => option.option_id === decision.selected_option_id);
  return `
    <div class="callout mb"><strong>Scores are advisory:</strong> The creator weighs audience feedback against continuity, secrets, and production feasibility. Options that violate hard rules cannot be approved.</div>
    <div class="split mb"><div>${status(`Status: ${decision.status}`, decision.status === 'committed' ? 'good' : 'warn')} <span class="tiny muted">Based on story state v${decision.base_version}</span></div><button class="btn" data-action="generate-decision" ${decision.status === 'approved' || decision.status === 'committed' ? 'disabled' : ''}>Regenerate options</button></div>
    <div class="option-grid">${decision.options.map((option) => {
      const failed = option.constraints.some((item) => item.result === 'fail');
      return `<article class="option ${option.option_id === 'B' ? 'recommended' : ''}"><div class="option-top"><span class="option-letter">${esc(option.option_id)}</span>${option.option_id === 'B' ? status('Suggested', 'good') : failed ? status('Rule violation', 'bad') : status('Available', 'warn')}</div><h3>${esc(option.title)}</h3><p>${esc(option.action_summary)}</p><p><strong>Impact:</strong> ${esc(option.expected_effect)}</p><div class="score-table">${Object.entries(option.score_breakdown).map(([key, score]) => `<div class="score-row"><span>${esc(scoreLabels[key])}</span><strong>${score}</strong></div>`).join('')}</div><div class="diff"><strong>Projected changes</strong><br>${option.projected_state_diff.map((change) => esc(change.reason)).join('<br>')}</div><small>${esc(option.constraints.map((item) => item.explanation).join(' '))}</small>${decision.status === 'proposed' ? `<button class="btn ${option.option_id === 'B' ? 'primary' : ''} full" data-action="approve-option" data-option="${esc(option.option_id)}" ${failed ? 'disabled' : ''}>Choose path ${esc(option.option_id)}</button>` : selected?.option_id === option.option_id ? status('Selected', 'good') : ''}</article>`;
    }).join('')}</div>
    ${decision.status === 'proposed' ? `<div class="card mt"><label class="form-label" for="decision-rationale">Reason for this choice — required</label><textarea id="decision-rationale" class="text-area" placeholder="For example: Keep the tension and gather evidence without revealing the girl’s secret yet."></textarea></div>` : ''}
    ${selected ? `<div class="card mt"><h3>Creator’s decision</h3><p><strong>Selected:</strong> ${esc(selected.title)}<br><strong>Reason:</strong> ${esc(decision.rationale)}</p>${decision.status === 'approved' ? `<button class="btn primary" data-action="commit">Commit to story state →</button>` : `<div class="inline-actions">${status(`Story state v${decision.committed_version} created`, 'good')}<button class="btn dark" data-view="studio">Produce episode 2 →</button></div>`}</div>` : ''}
  `;
}

function studio() {
  const e = data.episodes.find((item) => item.id === 'e2');
  const plan = e.plan;
  if (!plan) return `<div class="empty"><h3>No episode 2 plan yet</h3><p>Once the creator commits a story path, the system builds an outline, script, and shot plan from the new story version.</p><button class="btn primary" data-action="create-plan" ${data.decision?.status !== 'committed' ? 'disabled' : ''}>Create episode 2 plan →</button>${data.decision?.status !== 'committed' ? '<p>Approve and commit a story path first.</p>' : ''}</div>`;
  const states = [plan.script_approval, plan.video_approval, plan.publish_approval];
  return `
    <div class="steps"><span class="step ${states[0] === 'approved' ? 'done' : 'current'}">1. Script ${states[0] === 'approved' ? '✓' : ''}</span><span class="step ${states[1] === 'approved' ? 'done' : states[0] === 'approved' ? 'current' : ''}">2. Video ${states[1] === 'approved' ? '✓' : ''}</span><span class="step ${states[2] === 'approved' ? 'done' : states[1] === 'approved' ? 'current' : ''}">3. Publication approval ${states[2] === 'approved' ? '✓' : ''}</span><span class="step ${e.status === 'published' ? 'done' : ''}">4. Publish ${e.status === 'published' ? '✓' : ''}</span></div>
    <div class="two-col"><div>
      <div class="card mb"><div class="split"><h3>Episode 2 · The Next Table</h3>${status(`Based on story state v${plan.canonical_state_version}`, 'good')}</div><p><strong>Goal:</strong> ${esc(plan.narrative_goal)}</p><p><strong>Cliffhanger:</strong> ${esc(plan.cliffhanger)}</p><div class="shot-list">${plan.shot_plan.map((shot, index) => `<div class="shot"><strong>Shot ${index + 1}<br>${shot.duration_seconds}s</strong><span>${esc(shot.action)}</span></div>`).join('')}</div></div>
      <div class="card"><div class="split"><h3>Script</h3>${status(plan.script_approval === 'approved' ? 'Approved' : 'Awaiting approval', plan.script_approval === 'approved' ? 'good' : 'warn')}</div><label class="form-label" for="screenplay">Edit dialogue and shots before approval</label><textarea id="screenplay" class="text-area script">${esc(plan.screenplay)}</textarea><div class="inline-actions mt"><button class="btn" data-action="save-script">Save changes</button><button class="btn dark" data-action="approve-script" ${plan.script_approval === 'approved' ? 'disabled' : ''}>Approve script</button></div></div>
    </div><div>
      <div class="card mb"><div class="split"><h3>Video draft</h3>${status(e.video_path ? 'Complete episode available' : 'No complete episode yet', e.video_path ? 'good' : 'warn')}</div><div class="video-box">${e.video_path ? `<video controls preload="metadata" src="${esc(e.video_path)}"></video>` : `<div><strong>Awaiting visuals</strong><p>Generate each shot with Seedance, or use a demo or existing video.</p></div>`}</div><p class="tiny muted">Seedance creates three separate shots (12 + 13 + 12 seconds). Once complete, the browser assembles them into a WebM episode without audio.</p><div class="inline-actions"><button class="btn" data-view="visuals">Manage visuals and shots →</button><button class="btn" data-action="make-demo-video" ${plan.script_approval !== 'approved' ? 'disabled' : ''}>Create demo video</button><button class="btn" data-action="upload-video" ${plan.script_approval !== 'approved' ? 'disabled' : ''}>Attach existing video</button><button class="btn dark" data-action="approve-video" ${!e.video_path || plan.video_approval === 'approved' ? 'disabled' : ''}>Approve video</button></div></div>
      <div class="card"><h3>Publish</h3><p>The system checks the script, video, approvals, and story version before publishing the episode.</p><div class="inline-actions"><button class="btn" data-action="approve-publish" ${plan.script_approval !== 'approved' || plan.video_approval !== 'approved' || plan.publish_approval === 'approved' ? 'disabled' : ''}>Approve publication</button><button class="btn primary" data-action="publish" ${plan.publish_approval !== 'approved' || e.status === 'published' ? 'disabled' : ''}>${e.status === 'published' ? 'Published' : 'Publish episode 2'}</button></div>${e.published_at ? `<p class="tiny muted">Published ${esc(date(e.published_at))}</p>` : ''}</div>
    </div></div>
  `;
}

function visuals() {
  const e = data.episodes.find((item) => item.id === 'e2');
  const visual = data.visual_bible;
  const ready = e.plan?.script_approval === 'approved';
  const keyReady = data.integrations.byteplus_ready;
  const assetCard = (asset, label, id) => `<div class="card"><h3>${esc(label)}</h3>${asset ? `<img class="asset-preview" src="${esc(asset.path)}" alt="Reference image of ${esc(label)}"><p class="tiny muted">${esc(asset.source)} · ${esc(date(asset.created_at))}</p>${status(asset.status === 'approved' ? 'Approved' : 'Awaiting approval', asset.status === 'approved' ? 'good' : 'warn')}${asset.status === 'pending' ? `<button class="btn mt" data-action="approve-asset" data-id="${esc(asset.id)}">Approve image</button>` : ''}` : '<p>No image yet.</p>'}<div class="mt"><button class="btn" data-action="generate-asset" data-kind="character" data-subject="${esc(id)}" ${!ready || !keyReady ? 'disabled' : ''}>Generate with Seedream</button></div></div>`;
  const asset = (kind, id) => data.assets.find((item) => item.kind === kind && item.subject_id === id);
  return `<div class="callout mb"><strong>Visual continuity workflow:</strong> approve each character image → generate and approve each shot’s opening keyframe → Seedance uses that keyframe as its first frame. The previous shot’s final frame is passed to Seedream for the next shot. Each generation may incur charges.</div>
    ${!ready ? '<div class="callout mb">Create and approve the episode 2 script first.</div>' : !keyReady ? '<div class="callout mb">ARK_API_KEY is missing. Add it to .env and restart the server.</div>' : ''}
    ${section(`Visual profile v${visual.version}`, 'Fixed descriptions for generating characters and shots. Saving changes requires approved visuals and shots to be regenerated.')}
    <div class="card mb"><label class="form-label" for="visual-style">Shared style</label><textarea id="visual-style" class="text-area">${esc(visual.style)}</textarea><label class="form-label" for="visual-location">Setting</label><textarea id="visual-location" class="text-area">${esc(visual.location)}</textarea><label class="form-label" for="visual-props">Props</label><textarea id="visual-props" class="text-area">${esc(visual.props)}</textarea>${data.show.bible.characters.map((person) => `<h3>${esc(person.name)}</h3><label class="form-label" for="appearance-${esc(person.id)}">Appearance</label><textarea id="appearance-${esc(person.id)}" class="text-area">${esc(visual.characters[person.id].appearance)}</textarea><label class="form-label" for="costume-${esc(person.id)}">Costume</label><textarea id="costume-${esc(person.id)}" class="text-area">${esc(visual.characters[person.id].costume)}</textarea>`).join('')}<button class="btn dark mt" data-action="save-visual-bible" ${e.status === 'published' ? 'disabled' : ''}>Save visual profile</button></div>
    ${section('Characters', 'Approve character images before generating shots.')}
    <div class="grid-3">${data.show.bible.characters.map((person) => assetCard(asset('character', person.id), person.name, person.id)).join('')}</div>
    ${e.plan ? `${section('Keyframes and shot videos', 'Review each image and video before assembling the episode.')}
    <div class="grid-3">${e.plan.shot_plan.map((shot, index) => {
      const frame = asset('keyframe', shot.shot_id);
      const clip = data.video_shots.find((item) => item.shot_id === shot.shot_id);
      return `<div class="card"><h3>Shot ${esc(shot.shot_id)}</h3><p>${esc(shot.action)}</p>${frame ? `<img class="asset-preview" src="${esc(frame.path)}" alt="Opening keyframe for shot ${index + 1}">${status(frame.status === 'approved' ? 'Keyframe approved' : frame.status === 'stale' ? 'Keyframe needs regeneration' : 'Keyframe awaiting approval', frame.status === 'approved' ? 'good' : 'warn')}${frame.status === 'pending' ? `<button class="btn mt" data-action="approve-asset" data-id="${esc(frame.id)}">Approve keyframe</button>` : ''}` : '<p>No opening keyframe yet.</p>'}<div class="inline-actions mt"><button class="btn" data-action="generate-asset" data-kind="keyframe" data-subject="${esc(shot.shot_id)}" ${!ready || !keyReady || (clip && !['stale', 'failed', 'cancelled'].includes(clip.status)) ? 'disabled' : ''}>Generate Seedream keyframe</button><button class="btn dark" data-action="create-shot" data-shot="${esc(shot.shot_id)}" ${!frame || frame.status !== 'approved' || (clip && !['stale', 'failed', 'cancelled'].includes(clip.status)) || !keyReady ? 'disabled' : ''}>Generate Seedance shot</button></div>${clip ? `<p class="tiny muted">Job: ${esc(clip.status)} · ${esc(clip.task_id)}</p>${clip.video_path && clip.status === 'succeeded' ? `<video class="clip-preview" controls src="${esc(clip.video_path)}"></video><button class="btn" data-action="reject-shot" data-shot="${esc(shot.shot_id)}">Reject / regenerate shot</button>` : ''}${['queued', 'running'].includes(clip.status) ? `<button class="btn" data-action="refresh-shot" data-shot="${esc(shot.shot_id)}">Check progress</button>` : ''}${clip.error ? `<p class="tiny">${esc(clip.error)}</p>` : ''}` : ''}</div>`;
    }).join('')}</div><div class="card mt"><h3>Assemble episode</h3><p>Three completed shots will play in sequence and be recorded as a roughly 37-second WebM video.</p><button class="btn primary" data-action="assemble-shots" ${data.video_shots.filter((item) => item.status === 'succeeded').length === e.plan.shot_plan.length ? '' : 'disabled'}>Assemble shots into episode</button></div>` : ''}`;
}

function auditScreen() {
  return `
    <div class="callout mb"><strong>Audit trail:</strong> Each story commit and publication step records its time, action, and related data. Episode 2 appears here only after the steps have actually happened.</div>
    ${section('Timeline', `${data.audit.length} recent events.`)}
    <div class="audit-list">${data.audit.map((event) => `<article class="audit-item"><time>${esc(date(event.created_at))}</time><div><strong>${esc(eventLabels[event.event_type] || event.event_type)}</strong><p>${esc(auditDescription(event))}</p></div></article>`).join('')}</div>
  `;
}
function auditDescription(event) {
  const p = event.payload;
  if (event.event_type === 'demo_seeded') return `${p.comments} sample comments, story state v${p.state_version}.`;
  if (event.event_type === 'comments_imported') return `Added ${p.imported} comments; skipped ${p.skipped} duplicates.`;
  if (event.event_type === 'audience_mind_created') return `${p.events} responses; source: ${p.source_mode === 'jev_mock' ? 'simulated Jev' : 'live Jev'}.`;
  if (event.event_type === 'decision_approved') return `Selected path ${p.option_id}. Reason: ${p.rationale}`;
  if (event.event_type === 'state_committed') return `Story state v${p.from} → v${p.to}; ${p.diff?.length || 0} changes.`;
  if (event.event_type === 'episode_published') return `Episode ${p.episode_id} based on story state v${p.state_version}.`;
  if (p.episode_id) return `Episode ${p.episode_id}.`;
  if (p.decision_id) return `Decision ${p.decision_id.slice(0, 8)}…`;
  return 'Saved to story history.';
}

function drawDemoFrame(ctx, elapsed) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const scene = Math.min(2, Math.floor(elapsed / 12));
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#151e1b');
  gradient.addColorStop(0.6, '#372b26');
  gradient.addColorStop(1, '#0b1010');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(230,178,113,${0.04 + Math.sin(elapsed * 0.8 + i) * 0.015})`;
    ctx.ellipse(105 + i * 160, 120 + (i % 2) * 35, 95, 140, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#0e1412';
  ctx.fillRect(0, 390, w, 150);
  ctx.fillStyle = '#534032';
  ctx.beginPath(); ctx.ellipse(565, 375, 360, 72, 0, 0, Math.PI * 2); ctx.fill();
  const people = [
    { x: 270, color: '#22272a', head: '#b58b72' },
    { x: 585, color: '#28312f', head: '#b4977e' },
    { x: 745, color: '#473b35', head: '#bd987d' },
  ];
  people.forEach((person, index) => {
    ctx.fillStyle = person.color;
    ctx.beginPath(); ctx.ellipse(person.x, 325, 70, 120, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = person.head;
    ctx.beginPath(); ctx.ellipse(person.x, 220, 40, 48, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = index === 0 ? '#161615' : '#24211f';
    ctx.beginPath(); ctx.ellipse(person.x, 195, 43, 28, 0, Math.PI, Math.PI * 2); ctx.fill();
  });
  if (scene > 0) {
    ctx.fillStyle = '#a9b6b0';
    ctx.fillRect(310, 310, 42, 76);
    ctx.fillStyle = '#a9473f';
    ctx.beginPath(); ctx.arc(331, 341, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#d8b889';
  ctx.font = '600 17px Arial';
  ctx.fillText('THE WOMAN AT TABLE 7', 48, 57);
  ctx.fillStyle = '#e9e4d9';
  ctx.font = '32px Georgia';
  const captions = [
    'Linh chooses the next table.',
    'The phone begins recording.',
    '“You haven’t told her?”',
  ];
  ctx.fillText(captions[scene], 48, 465);
  ctx.fillStyle = '#c4b9a6';
  ctx.font = '15px Arial';
  ctx.fillText(`SHOT ${scene + 1} / 3  •  DEMO VIDEO`, 50, 500);
  ctx.fillStyle = '#b54b37';
  ctx.fillRect(0, h - 5, w * Math.min(1, elapsed / 36), 5);
}

async function makeDemoVideo(button) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('This browser cannot create a demo video. Attach an MP4 or WebM instead.');
  }
  const mime = ['video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error('This browser cannot record WebM. Attach an existing video instead.');
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(12);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 850_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const completed = new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Could not create the demo video.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });
  const started = performance.now();
  drawDemoFrame(ctx, 0);
  recorder.start(1000);
  const timer = setInterval(() => {
    const elapsed = (performance.now() - started) / 1000;
    drawDemoFrame(ctx, elapsed);
    button.textContent = `Rendering ${Math.min(36, Math.floor(elapsed))}/36 seconds`;
    if (elapsed >= 36) { clearInterval(timer); recorder.stop(); stream.getTracks().forEach((track) => track.stop()); }
  }, 80);
  const blob = await completed;
  await api('/api/video', { method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: blob });
}

async function assembleShots(button) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error('This browser cannot assemble shots.');
  const mime = ['video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error('This browser cannot record WebM.');
  const ordered = data.episodes.find((item) => item.id === 'e2').plan.shot_plan.map((shot) => data.video_shots.find((item) => item.shot_id === shot.shot_id));
  if (ordered.some((item) => item?.status !== 'succeeded' || !item.video_path)) throw new Error('Complete all three shots before assembly.');
  const canvas = document.createElement('canvas');
  canvas.width = 960; canvas.height = 540;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const completed = new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Could not record the assembled video.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });
  recorder.start(1000);
  try {
    for (const [index, shot] of ordered.entries()) {
      button.textContent = `Assembling shot ${index + 1}/${ordered.length}`;
      const video = document.createElement('video');
      video.src = shot.video_path;
      video.muted = true;
      video.playsInline = true;
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = () => reject(new Error(`Could not read shot ${index + 1}.`));
      });
      await video.play();
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error(`Shot ${index + 1} took too long to play.`)), 25_000);
        function draw() {
          if (video.ended) { clearTimeout(deadline); video.removeAttribute('src'); video.load(); resolve(); return; }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          requestAnimationFrame(draw);
        }
        draw();
      });
    }
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
  }
  const blob = await completed;
  await api('/api/video', { method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: blob });
}

async function perform(action, target) {
  if (action === 'import-csv') return csvInput.click();
  if (action === 'upload-video') return videoInput.click();
  if (action === 'make-demo-video') { await makeDemoVideo(target); showToast('Created a 36-second demo video and attached it to episode 2.'); }
  if (action === 'assemble-shots') { await assembleShots(target); showToast('Assembled the three Seedance shots into an episode.'); setView('studio'); }
  if (action === 'save-visual-bible') {
    const previous = data.visual_bible;
    const payload = {
      style: document.querySelector('#visual-style').value,
      location: document.querySelector('#visual-location').value,
      props: document.querySelector('#visual-props').value,
      characters: Object.fromEntries(Object.keys(previous.characters).map((id) => [id, {
        appearance: document.querySelector(`#appearance-${id}`).value,
        costume: document.querySelector(`#costume-${id}`).value,
      }])),
    };
    const unchanged = payload.style === previous.style && payload.location === previous.location && payload.props === previous.props
      && Object.keys(previous.characters).every((id) => payload.characters[id].appearance === previous.characters[id].appearance && payload.characters[id].costume === previous.characters[id].costume);
    if (unchanged) { target.disabled = false; showToast('No changes to the visual profile.'); return; }
    if (!confirm('Saving a new visual profile will require approved images and shots to be regenerated. Continue?')) { target.disabled = false; return; }
    await api('/api/visual-bible', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    showToast('Saved a new visual profile version.');
  }
  if (action === 'generate-asset') {
    if (!confirm('Generating an image with Seedream may incur charges. Continue?')) { target.disabled = false; return; }
    await post('/api/visual-assets', { kind: target.dataset.kind, subject_id: target.dataset.subject });
    showToast('Seedream generated an image; please review and approve it.');
  }
  if (action === 'approve-asset') { await post(`/api/visual-assets/${target.dataset.id}/approve`); showToast('Reference image approved.'); }
  if (action === 'create-shot') {
    if (!confirm('Generating a shot with Seedance may incur charges. Continue?')) { target.disabled = false; return; }
    await post(`/api/shots/${target.dataset.shot}`);
    showToast('Seedance accepted the request. Check progress in a few minutes.');
  }
  if (action === 'refresh-shot') { const result = await post(`/api/shots/${target.dataset.shot}/refresh`); showToast(`Shot status: ${result.status}.`); }
  if (action === 'reject-shot') {
    const reason = prompt('Describe the appearance, setting, or prop issue to fix:');
    if (reason === null) { target.disabled = false; return; }
    await post(`/api/shots/${target.dataset.shot}/reject`, { reason });
    showToast('Shot marked for regeneration.');
  }
  if (action === 'run-mind') { await post('/api/mind'); showToast(data.integrations.jev_ready ? 'Jev classified and summarized the comments.' : 'Comments summarized in simulation mode.'); setView('mind'); }
  if (action === 'generate-decision') { await post('/api/decisions'); showToast('Generated three story paths to compare.'); setView('decisions'); }
  if (action === 'approve-option') {
    const rationale = document.querySelector('#decision-rationale')?.value || '';
    await post(`/api/decisions/${data.decision.id}/approve`, { option_id: target.dataset.option, rationale });
    showToast(`Approved path ${target.dataset.option}.`);
  }
  if (action === 'commit') { await post(`/api/decisions/${data.decision.id}/commit`); showToast('Created a new story state version.'); }
  if (action === 'create-plan') { await post('/api/plan'); showToast('Episode 2 plan created.'); }
  if (action === 'save-script') {
    await api('/api/plan', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screenplay: document.querySelector('#screenplay').value }) });
    showToast('Script saved; approvals must be completed again.');
  }
  if (action === 'approve-script') { await post('/api/plan/approve-script'); showToast('Script approved.'); }
  if (action === 'approve-video') { await post('/api/plan/approve-video'); showToast('Video approved.'); }
  if (action === 'approve-publish') { await post('/api/plan/approve-publish'); showToast('Publication approved.'); }
  if (action === 'publish') { await post('/api/publish'); showToast('Episode 2 published in the demo.'); }
  await refresh();
}

document.addEventListener('click', async (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) { setView(viewButton.dataset.view); return; }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton || actionButton.disabled) return;
  actionButton.disabled = true;
  try { await perform(actionButton.dataset.action, actionButton); }
  catch (error) { showToast(error.message, true); actionButton.disabled = false; }
});

content.addEventListener('input', (event) => {
  if (event.target.id !== 'comment-search') return;
  search = event.target.value;
  document.querySelector('#comment-list').innerHTML = commentMarkup(filteredComments());
  document.querySelector('#result-count').textContent = `Showing ${filteredComments().length} comments`;
});
content.addEventListener('change', (event) => {
  if (event.target.id !== 'source-filter') return;
  sourceFilter = event.target.value;
  document.querySelector('#comment-list').innerHTML = commentMarkup(filteredComments());
  document.querySelector('#result-count').textContent = `Showing ${filteredComments().length} comments`;
});
csvInput.addEventListener('change', async () => {
  const file = csvInput.files[0];
  if (!file) return;
  try {
    const result = await post('/api/comments/import', { csv: await file.text() });
    showToast(`Imported ${result.imported} comments; skipped ${result.skipped} duplicates.`);
    await refresh();
  } catch (error) { showToast(error.message, true); }
  csvInput.value = '';
});
videoInput.addEventListener('change', async () => {
  const file = videoInput.files[0];
  if (!file) return;
  try {
    if (file.size > 30_000_000) throw new Error('Videos must be under 30 MB in this demo.');
    await api('/api/video', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    showToast('Existing video attached to episode 2.');
    await refresh();
  } catch (error) { showToast(error.message, true); }
  videoInput.value = '';
});
window.addEventListener('hashchange', () => { view = titles[location.hash.slice(1)] ? location.hash.slice(1) : 'overview'; render(); });

refresh().catch((error) => { content.innerHTML = `<div class="empty"><h3>Could not connect to the server</h3><p>${esc(error.message)}</p></div>`; });
