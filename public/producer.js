const root = document.querySelector('#project-content');
const select = document.querySelector('#project-select');
const toast = document.querySelector('#producer-toast');
let project = null;
let projects = [];
let selectedId = localStorage.getItem('living-drama-producer-project') || '';
let activePointId = '';
let activeStep = 0;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
import { uiErrorMessage } from './ui-errors.mjs';

const status = (value) => ({ draft: 'Draft', approved: 'Approved', published: 'Published', pending: 'Awaiting approval', queued: 'Queued', running: 'Generating', completed: 'Completed', interrupted: 'Interrupted', succeeded: 'Completed', failed: 'Failed', cancelled: 'Cancelled' })[value] || value;
function message(value, error = false) { toast.textContent = value; toast.className = `toast show${error ? ' error' : ''}`; setTimeout(() => { toast.className = 'toast'; }, 5000); }
async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(uiErrorMessage(value, `Request failed (${response.status})`));
  return value;
}
const base = () => `/api/production/projects/${project.id}`;
const stepKey = (id) => `living-drama-producer-step-${id}`;
function suggestedStep() { return !project ? 1 : project.visual_locked_at ? 4 : project.story_approved ? 3 : 2; }
function stepAvailable(step) { return step === 1 || step === 2 && Boolean(project) || step === 3 && Boolean(project?.analysis) || step === 4 && Boolean(project?.visual_locked_at); }
function setActiveStep(step, scroll = false) {
  activeStep = stepAvailable(step) ? step : suggestedStep();
  document.querySelectorAll('[data-step-panel]').forEach((panel) => { panel.hidden = Number(panel.dataset.stepPanel) !== activeStep; });
  document.querySelectorAll('.workflow-tabs [data-step]').forEach((button) => {
    const number = Number(button.dataset.step);
    button.disabled = !stepAvailable(number);
    button.classList.toggle('active', number === activeStep);
    button.setAttribute('aria-selected', String(number === activeStep));
    button.tabIndex = number === activeStep ? 0 : -1;
  });
  if (project) localStorage.setItem(stepKey(project.id), String(activeStep));
  if (scroll) document.querySelector('.workflow-tabs')?.scrollIntoView({ block: 'start' });
}
async function reload(id = selectedId) {
  const previousId = selectedId;
  projects = await api('/api/production/projects');
  if (!projects.some((item) => item.id === id)) id = projects[0]?.id || '';
  selectedId = id;
  localStorage.setItem('living-drama-producer-project', id);
  select.innerHTML = `<option value="">${projects.length ? 'Select a project' : 'No projects yet'}</option>${projects.map((item) => `<option value="${esc(item.id)}">${esc(item.title)} · ${esc(item.filename)}</option>`).join('')}`;
  select.value = id;
  project = id ? await api(`/api/production/projects/${id}`) : null;
  if (previousId !== id || !activeStep) activeStep = Number(localStorage.getItem(stepKey(id))) || suggestedStep();
  if (project) {
    const remembered = localStorage.getItem(`living-drama-point-${id}`);
    const points = project.analysis?.branch_points || [];
    activePointId = previousId === id && points.some((point) => point.id === activePointId) ? activePointId : points.some((point) => point.id === remembered) ? remembered : points.some((point) => point.id === project.selected_point_id) ? project.selected_point_id : points[0]?.id || '';
  } else activePointId = '';
  render();
  setActiveStep(activeStep);
}
const activeBranchSet = () => project?.branch_sets?.[activePointId];
const activeBranches = () => activeBranchSet()?.branches || [];
function visualAssets(item) { return project.assets.filter((asset) => asset.kind === 'production_visual' && asset.subject_id === item.id); }
function keyframeAssets(branch, shot) { return project.assets.filter((asset) => asset.kind === 'production_keyframe' && asset.subject_id === `${branch.draft_id}:${branch.id}:${shot.id}`); }
function renderVisual(item) {
  const assets = visualAssets(item);
  return `<div class="production-item" data-visual="${esc(item.id)}"><div class="split"><h3>${esc(item.name)}</h3><span class="status">${item.kind === 'character' ? 'Character' : item.kind === 'location' ? 'Setting' : 'Prop'}</span></div>
    <label class="form-label">Fixed identity</label><textarea class="text-area" data-field="identity" ${project.visual_locked_at ? 'readonly' : ''}>${esc(item.identity)}</textarea>
    ${item.kind === 'character' ? `<label class="form-label">Costume and allowed variations</label><textarea class="text-area" data-field="costume" ${project.visual_locked_at ? 'readonly' : ''}>${esc(item.costume)}</textarea>` : ''}
    <label class="form-label">Seedream image prompt</label><textarea class="text-area" data-field="visual_prompt" ${project.visual_locked_at ? 'readonly' : ''}>${esc(item.visual_prompt)}</textarea>
    ${assets.map((asset) => `<div class="subtle"><span class="status ${asset.status === 'approved' ? 'good' : 'warn'}">${esc(status(asset.status))}</span><img src="${esc(asset.path)}" alt="Image of ${esc(item.name)}">${asset.status === 'pending' && !project.visual_locked_at ? `<div class="inline-actions"><button class="btn small dark" data-action="approve-visual" data-asset="${esc(asset.id)}">Approve this image</button></div>` : ''}</div>`).join('')}
    ${!project.visual_locked_at ? `<button class="btn small" data-action="generate-visual" data-visual="${esc(item.id)}">Generate reference image</button>` : ''}
  </div>`;
}
function renderShot(branch, shot) {
  const assets = keyframeAssets(branch, shot);
  const primaryAsset = assets.find((asset) => asset.status === 'pending' && !shot.task_id)
    || assets.find((asset) => asset.id === shot.keyframe_asset_id)
    || assets[0];
  const archivedAssets = assets.filter((asset) => asset.id !== primaryAsset?.id);
  const renderKeyframe = (asset) => `<div class="subtle keyframe-preview"><span class="status ${asset.status === 'approved' ? 'good' : 'warn'}">Keyframe: ${esc(status(asset.status))}</span><img src="${esc(asset.path)}" alt="Shot keyframe">${asset.status === 'pending' && !shot.task_id ? `<div class="inline-actions"><button class="btn small dark" data-action="approve-keyframe" data-branch="${esc(branch.id)}" data-shot="${esc(shot.id)}" data-asset="${esc(asset.id)}">Approve keyframe</button></div>` : ''}</div>`;
  const hasVideo = Boolean(shot.video_path);
  return `<div class="shot-card" data-shot="${esc(shot.id)}"><div class="split"><strong>Shot ${esc(shot.id.split('-')[1])}</strong><span class="status ${shot.status === 'succeeded' ? 'good' : ''}">${esc(status(shot.status))}</span></div>
    ${branch.status === 'draft' ? `<label class="form-label">Shot reference images (hold Ctrl to select multiple; up to 8, including a setting)</label><select class="select" data-field="visual_ids" multiple size="6">${project.visuals.map((visual) => `<option value="${esc(visual.id)}" ${shot.visual_ids.includes(visual.id) ? 'selected' : ''}>${visual.kind === 'character' ? 'Character' : visual.kind === 'location' ? 'Setting' : 'Prop'} · ${esc(visual.name)}</option>`).join('')}</select>` : `<p class="tiny muted">Reference images: ${esc(shot.visual_ids.map((id) => project.visuals.find((item) => item.id === id)?.name || id).join(' · '))}</p>`}
    <label class="form-label">Action · ${shot.duration_seconds} seconds</label><textarea class="text-area" data-field="action" ${branch.status !== 'draft' ? 'readonly' : ''}>${esc(shot.action)}</textarea>
    <label class="form-label">Seedream keyframe prompt</label><textarea class="text-area" data-field="image_prompt" ${branch.status !== 'draft' ? 'readonly' : ''}>${esc(shot.image_prompt)}</textarea>
    <label class="form-label">Seedance video prompt</label><textarea class="text-area" data-field="video_prompt" ${branch.status !== 'draft' ? 'readonly' : ''}>${esc(shot.video_prompt)}</textarea>
    ${hasVideo ? `<div class="subtle video-preview"><span class="status good">Video completed</span><video controls preload="metadata" ${primaryAsset ? `poster="${esc(primaryAsset.path)}"` : ''} src="${esc(shot.video_path)}"></video></div>${assets.length ? `<details class="keyframe-history"><summary>View ${assets.length} keyframe images</summary>${assets.map(renderKeyframe).join('')}</details>` : ''}` : `${primaryAsset ? renderKeyframe(primaryAsset) : ''}${archivedAssets.length ? `<details class="keyframe-history"><summary>View ${archivedAssets.length} other keyframes</summary>${archivedAssets.map(renderKeyframe).join('')}</details>` : ''}`}
    ${branch.status === 'approved' ? `<div class="inline-actions">${!shot.task_id ? `<button class="btn small" data-action="keyframe" data-branch="${esc(branch.id)}" data-shot="${esc(shot.id)}">Generate keyframe</button>` : ''}${!hasVideo ? `<button class="btn small primary" data-action="video" data-branch="${esc(branch.id)}" data-shot="${esc(shot.id)}" ${!shot.keyframe_asset_id || shot.task_id && !['failed', 'cancelled'].includes(shot.status) ? 'disabled' : ''}>${shot.task_id && ['failed', 'cancelled'].includes(shot.status) ? 'Regenerate video' : shot.task_id ? 'Generating video' : 'Generate video'}</button>` : ''}${shot.task_id && ['queued', 'running'].includes(shot.status) ? `<button class="btn small" data-action="refresh-video" data-branch="${esc(branch.id)}" data-shot="${esc(shot.id)}">Check progress</button>` : ''}</div>` : ''}
    ${shot.error ? `<p class="secret">${esc(shot.error)}</p>` : ''}
  </div>`;
}
function renderBranch(branch) {
  return `<div class="branch-card" data-branch="${esc(branch.id)}"><div class="split"><div><span class="eyebrow">OPTION ${esc(branch.id.match(/branch-(\d+)$/)?.[1] || '')}</span><h3>${esc(branch.title)}</h3><p class="tiny muted">${branch.shots.length} shots · approximately ${branch.shots.reduce((sum, shot) => sum + shot.duration_seconds, 0)} seconds</p></div><span class="status ${branch.status === 'published' ? 'good' : ''}">${esc(status(branch.status))}</span></div>
    <label class="form-label">Branch title</label><input class="search" data-field="title" value="${esc(branch.title)}" ${branch.status !== 'draft' ? 'readonly' : ''}>
    <label class="form-label">Story and consequences</label><textarea class="text-area" data-field="synopsis" ${branch.status !== 'draft' ? 'readonly' : ''}>${esc(branch.synopsis)}</textarea>
    <details class="shot-details"><summary>View and edit ${branch.shots.length} shots</summary>${branch.shots.map((shot) => renderShot(branch, shot)).join('')}</details>
    <div class="inline-actions">${branch.status === 'draft' ? `<button class="btn" data-action="save-branch" data-branch="${esc(branch.id)}">Save changes</button><button class="btn dark" data-action="approve-branch" data-branch="${esc(branch.id)}">Approve branch and shots</button>` : ''}${branch.status === 'approved' ? `<button class="btn primary" data-action="publish-branch" data-branch="${esc(branch.id)}" ${branch.shots.some((shot) => shot.status !== 'succeeded' || !shot.video_path) ? 'disabled' : ''}>Publish branch</button>` : ''}</div>
  </div>`;
}
function renderBranchWorkshop() {
  const points = project.analysis.branch_points;
  const active = points.find((point) => point.id === activePointId);
  const set = activeBranchSet();
  const branches = activeBranches();
  const job = project.draft_jobs?.find((item) => item.point_id === activePointId);
  const canRedraft = branches.every((branch) => branch.status === 'draft' && branch.shots.every((shot) => !shot.keyframe_asset_id && !shot.task_id));
  const episodes = [...new Set(points.map((point) => point.episode))];
  return `<section class="card mt step-panel" id="branch-workshop" data-step-panel="4" role="tabpanel"><h2>4. Branch points and options</h2><p class="prose">The script has <strong>${points.length} branch points</strong> across ${episodes.length} episodes. Each branch point asks a “what if” question and can have 2–3 story options. Select a point on the left to draft or review its options.</p>
    <div class="branch-workshop-layout"><nav class="point-list" aria-label="Branch points by episode">${episodes.map((episode) => `<div class="point-group"><h3>${esc(episode)}</h3>${points.filter((point) => point.episode === episode).map((point) => { const found = project.branch_sets?.[point.id]?.branches || []; const published = found.filter((branch) => branch.status === 'published').length; const running = project.draft_jobs?.some((item) => item.point_id === point.id && item.status === 'running'); return `<button type="button" class="point-choice ${point.id === activePointId ? 'active' : ''}" data-point-id="${esc(point.id)}" aria-current="${point.id === activePointId ? 'true' : 'false'}"><span>${esc(point.question)}</span><small>${running ? '⏳ ModelArk is drafting' : found.length ? `${found.length} options${published ? ` · ${published} published` : ''}` : 'No options drafted'}</small></button>`; }).join('')}</div>`).join('')}</nav>
    <div class="point-content">${active ? `<div class="point-summary"><span class="eyebrow">SELECTED BRANCH POINT · ${esc(active.episode)}</span><h3>${esc(active.question)}</h3><p><strong>Moment:</strong> ${esc(active.moment)}</p><p><strong>Original script:</strong> ${esc(active.original_outcome)}</p><p><strong>Option scope:</strong> ${set?.legacy ? 'Scope of older drafts is not clearly defined' : esc(set?.scope_end || `From this moment to the end of ${active.episode}`)}</p></div>
    ${set?.legacy ? '<div class="callout mt">Three earlier drafts were preserved. They may extend into later episodes; review them before approval. Newly drafted options will end with this episode.</div>' : ''}
    <div class="inline-actions"><button class="btn primary" data-action="draft-branches" data-point="${esc(active.id)}" ${job?.status === 'running' || branches.length && !canRedraft ? 'disabled' : ''}>${job?.status === 'running' ? 'ModelArk is drafting options…' : branches.length ? 'Redraft this point’s options' : 'Draft 2–3 options for this point'}</button></div>
    ${job?.status === 'running' ? `<div class="draft-progress mt" role="status"><strong>ModelArk is drafting.</strong> You can reload or switch to another branch point; the job continues on the server. Started: ${esc(new Date(job.created_at).toLocaleTimeString('en-US'))}. This page checks for results every few seconds.</div>` : ''}
    ${job && ['failed', 'interrupted'].includes(job.status) ? `<div class="secret mt">The previous draft ${job.status === 'interrupted' ? 'was interrupted when the server restarted' : 'failed'}: ${esc(uiErrorMessage({ message: job.error, code: 'PROVIDER_ERROR' }, 'Unknown cause'))}. Any earlier drafts were preserved. You can retry.</div>` : ''}
    ${branches.length && !canRedraft ? '<p class="tiny muted">An option has been approved or production has started, so this set cannot be overwritten.</p>' : ''}
    ${job?.status === 'running' ? '' : branches.length ? `<h3 class="mt">${branches.length} options for this branch point</h3>${branches.map(renderBranch).join('')}` : '<div class="empty mt"><p>No options have been drafted for this branch point. Other points remain separate.</p></div>'}</div></div></section>` : '<p class="muted">The story profile has no branch points yet.</p>'}</section>`;
}
function render() {
  if (!project) { root.innerHTML = ''; setActiveStep(1); return; }
  const analysis = project.analysis;
  root.innerHTML = `<section class="card mt step-panel" id="producer-project-overview" data-step-panel="1"><div class="split"><div><span class="eyebrow">PROJECT / ${esc(project.filename)}</span><h2>${esc(project.title)}</h2></div><span class="status">Visual profile v${project.visual_version}</span></div>
    <details><summary>View original script · ${project.script_text.length.toLocaleString('en-US')} characters</summary><pre class="script-preview">${esc(project.script_text)}</pre></details></section>
    <section class="card mt step-panel" id="producer-step-2" data-step-panel="2" role="tabpanel"><div class="split"><h2>2. Analyze the story</h2><span class="status ${project.story_approved ? 'good' : 'warn'}">${project.story_approved ? 'Approved' : 'Not approved'}</span></div>
      <p class="prose">The text model reads the script and extracts episodes, characters, settings, props, story rules, and branch points. The result is a draft for the producer to review.</p>
      <div class="inline-actions"><button class="btn primary" data-action="analyze" ${project.visual_locked_at ? 'disabled' : ''}>${analysis ? 'Analyze again' : 'Analyze with ModelArk'}</button>${analysis && !project.story_approved ? '<button class="btn dark" data-action="approve-story">Approve story profile</button>' : ''}</div>
      ${analysis ? `<div class="subtle"><h3>Summary</h3><p class="prose">${esc(analysis.synopsis)}</p><p class="prose"><strong>Visual style:</strong> ${esc(analysis.visual_style)}</p><div class="production-grid"><div><h3>Episodes in the script</h3>${analysis.episodes.map((item) => `<p class="prose"><strong>${esc(item.title)}</strong> — ${esc(item.summary)}</p>`).join('')}</div><div><h3>Story rules</h3>${analysis.rules.map((rule) => `<p class="prose">• ${esc(rule)}</p>`).join('')}</div></div>${analysis.unresolved.length ? `<div class="secret"><strong>Producer input needed:</strong> ${analysis.unresolved.map(esc).join(' · ')}</div>` : ''}<p class="tiny muted">${analysis.characters.length} characters · ${analysis.locations.length} settings · ${analysis.props.length} props · ${analysis.branch_points.length} branch points</p></div>` : ''}
      ${analysis && !project.story_approved ? `<div class="subtle"><h3>Review and edit before approval</h3><label class="form-label">Summary</label><textarea id="story-synopsis" class="text-area">${esc(analysis.synopsis)}</textarea><label class="form-label">Story rules (one per line)</label><textarea id="story-rules" class="text-area">${esc(analysis.rules.join('\n'))}</textarea><label class="form-label">Unresolved questions (one per line)</label><textarea id="story-unresolved" class="text-area">${esc(analysis.unresolved.join('\n'))}</textarea><h3 class="mt">Suggested branch points</h3>${analysis.branch_points.map((point) => `<div class="production-item mt" data-point="${esc(point.id)}"><label class="form-label">Episode</label><input class="search" data-field="episode" value="${esc(point.episode)}"><label class="form-label">Moment</label><textarea class="text-area" data-field="moment">${esc(point.moment)}</textarea><label class="form-label">What-if question</label><textarea class="text-area" data-field="question">${esc(point.question)}</textarea><label class="form-label">Original outcome</label><textarea class="text-area" data-field="original_outcome">${esc(point.original_outcome)}</textarea></div>`).join('')}<button class="btn dark mt" data-action="save-story">Save edited story profile</button></div>` : ''}
    </section>
    ${analysis ? `<section class="card mt step-panel" id="producer-step-3" data-step-panel="3" role="tabpanel"><div class="split"><h2>3. Review and lock visuals</h2><span class="status ${project.visual_locked_at ? 'good' : 'warn'}">${project.visual_locked_at ? 'Locked' : 'Unlocked'}</span></div><p class="prose">Character, setting, and prop images must be generated, approved, and locked before drafting story options. Unlocking visuals discards all unpublished option sets; visuals cannot be unlocked after publication.</p>
      ${project.story_approved ? `<label class="form-label" for="visual-style">Shared visual style</label><textarea id="visual-style" class="text-area" ${project.visual_locked_at ? 'readonly' : ''}>${esc(analysis.visual_style)}</textarea><div class="production-grid">${project.visuals.map(renderVisual).join('')}</div><div class="inline-actions">${!project.visual_locked_at ? '<button class="btn" data-action="save-visuals">Save visual descriptions</button><button class="btn primary" data-action="lock-visuals">Lock approved visuals</button>' : '<button class="btn" data-action="unlock-visuals">Unlock to edit (discard all option sets)</button>'}</div>` : '<p class="muted">Approve the story profile to start creating visuals.</p>'}</section>` : ''}
    ${project.visual_locked_at ? renderBranchWorkshop() : ''}
    ${project.viewer_intents.length ? `<section class="card mt step-panel" data-step-panel="4"><h2>Viewer ideas</h2><p class="prose">Ideas that do not match an existing branch stay here for the producer to consider in a future production.</p>${project.viewer_intents.map((item) => `<p class="prose"><span class="status ${item.choice === 'other' ? 'warn' : 'good'}">${item.choice === 'other' ? 'No matching branch' : esc(item.choice)}</span> ${esc(item.message)} <small class="muted">${Math.round(item.confidence * 100)}% · ${esc(item.created_at)}</small></p>`).join('')}</section>` : ''}
    ${project.model_runs.length ? `<section class="card mt step-panel" data-step-panel="2"><details><summary>Model call history (${project.model_runs.length})</summary>${project.model_runs.map((run) => `<p class="tiny muted">${esc(run.type)} · ${esc(run.model)} · ${esc(run.at)}${run.usage ? ` · ${esc(JSON.stringify(run.usage))}` : ''}</p>`).join('')}</details></section>` : ''}`;
  setActiveStep(activeStep);
}
function collectVisuals() {
  return project.visuals.map((item) => {
    const el = root.querySelector(`[data-visual="${item.id}"]`);
    return { id: item.id, identity: el.querySelector('[data-field="identity"]').value, costume: el.querySelector('[data-field="costume"]')?.value || '', visual_prompt: el.querySelector('[data-field="visual_prompt"]').value };
  });
}
function collectStory() {
  return { synopsis: document.querySelector('#story-synopsis').value, rules: document.querySelector('#story-rules').value.split('\n').map((item) => item.trim()).filter(Boolean), unresolved: document.querySelector('#story-unresolved').value.split('\n').map((item) => item.trim()).filter(Boolean),
    branch_points: project.analysis.branch_points.map((point) => { const el = root.querySelector(`[data-point="${point.id}"]`); return { id: point.id, episode: el.querySelector('[data-field="episode"]').value, moment: el.querySelector('[data-field="moment"]').value, question: el.querySelector('[data-field="question"]').value, original_outcome: el.querySelector('[data-field="original_outcome"]').value }; }) };
}
function collectBranch(id) {
  const el = root.querySelector(`[data-branch="${id}"]`);
  const branch = activeBranches().find((item) => item.id === id);
  return { title: el.querySelector('[data-field="title"]').value, synopsis: el.querySelector('[data-field="synopsis"]').value,
    shots: branch.shots.map((shot) => { const row = el.querySelector(`[data-shot="${shot.id}"]`); return { action: row.querySelector('[data-field="action"]').value, image_prompt: row.querySelector('[data-field="image_prompt"]').value, video_prompt: row.querySelector('[data-field="video_prompt"]').value, visual_ids: [...row.querySelector('[data-field="visual_ids"]').selectedOptions].map((option) => option.value) }; }) };
}
function unsavedVisuals() {
  if (document.querySelector('#visual-style')?.value !== project.analysis.visual_style) return true;
  return collectVisuals().some((item, index) => item.identity !== project.visuals[index].identity || item.visual_prompt !== project.visuals[index].visual_prompt || (item.costume || '') !== (project.visuals[index].costume || ''));
}
function unsavedBranch(id) {
  if (!root.querySelector(`[data-branch="${id}"]`)) return false;
  const incoming = collectBranch(id);
  const old = activeBranches().find((item) => item.id === id);
  return incoming.title !== old.title || incoming.synopsis !== old.synopsis || incoming.shots.some((shot, index) => shot.action !== old.shots[index].action || shot.image_prompt !== old.shots[index].image_prompt || shot.video_prompt !== old.shots[index].video_prompt || shot.visual_ids.join(',') !== old.shots[index].visual_ids.join(','));
}
async function runShotAction(url, action, button) {
  const projectId = project.id;
  const { branch: branchId, shot: shotId, asset: assetId } = button.dataset;
  const path = `${url}/branches/${branchId}/shots/${shotId}`;
  const endpoint = action === 'approve-keyframe' ? `${path}/keyframes/${assetId}/approve` : `${path}/${action === 'refresh-video' ? 'refresh' : action}`;
  // The action button also has data-shot; target its containing card, not the button itself.
  const row = button.closest('.shot-card[data-shot]');
  await api(endpoint, 'POST');
  if (selectedId !== projectId) { message('A job in another project has finished. Open that project to see the result.'); return; }
  project = await api(`/api/production/projects/${projectId}`);
  if (selectedId !== projectId) return;
  const branch = Object.values(project.branch_sets).flatMap((set) => set.branches).find((item) => item.id === branchId);
  const shot = branch?.shots.find((item) => item.id === shotId);
  if (row?.isConnected && shot) row.outerHTML = renderShot(branch, shot);
  const publishButton = [...root.querySelectorAll('[data-action="publish-branch"]')].find((item) => item.dataset.branch === branchId);
  if (publishButton && branch) publishButton.disabled = branch.shots.some((item) => item.status !== 'succeeded' || !item.video_path);
  const notices = {
    keyframe: 'Keyframe generated. Review and approve it in this shot.',
    'approve-keyframe': 'Keyframe approved. You can now generate this shot’s video.',
    video: 'Shot submitted to Seedance. Its status is shown here.',
    'refresh-video': shot?.status === 'succeeded' ? branch?.shots.every((item) => item.status === 'succeeded' && item.video_path) ? 'All branch videos are ready. You can publish the branch.' : 'Video completed and is available in this shot.' : `Video status: ${status(shot?.status || 'queued')}.`,
  };
  message(notices[action]);
}
async function run(button) {
  const action = button.dataset.action;
  if (action === 'import') {
    const file = document.querySelector('#script-file').files[0];
    const title = document.querySelector('#project-title').value.trim();
    if (!file || !title) throw new Error('Enter a show title and select a script file.');
    if (!/\.(md|txt)$/i.test(file.name) || file.size > 300_000) throw new Error('Only .md or .txt files up to 300 KB are supported.');
    const created = await api('/api/production/projects', 'POST', { title, filename: file.name, script_text: await file.text() });
    await reload(created.id); setActiveStep(2, true); message('Script imported. Analyze it to build the story profile.'); return;
  }
  if (!project) return;
  const url = base();
  const paid = ['analyze', 'generate-visual', 'draft-branches', 'keyframe', 'video'];
  if (paid.includes(action) && !confirm('This action calls a paid AI service and may incur charges. Continue?')) return;
  if (['keyframe', 'approve-keyframe', 'video', 'refresh-video'].includes(action)) return runShotAction(url, action, button);
  if (action === 'analyze') await api(`${url}/analyze`, 'POST');
  else if (action === 'save-story') await api(`${url}/story`, 'PATCH', collectStory());
  else if (action === 'approve-story') { if (JSON.stringify(collectStory()) !== JSON.stringify({ synopsis: project.analysis.synopsis, rules: project.analysis.rules, unresolved: project.analysis.unresolved, branch_points: project.analysis.branch_points })) throw new Error('Save your story profile changes before approval.'); await api(`${url}/approve-story`, 'POST'); }
  else if (action === 'save-visuals') await api(`${url}/visuals`, 'PATCH', { visual_style: document.querySelector('#visual-style').value, visuals: collectVisuals() });
  else if (action === 'lock-visuals') { if (unsavedVisuals()) throw new Error('Save visual descriptions before locking them.'); await api(`${url}/lock-visuals`, 'POST'); }
  else if (action === 'unlock-visuals') { if (!confirm('Unlocking will discard every unpublished option set across all branch points. Continue?')) return; await api(`${url}/unlock-visuals`, 'POST'); }
  else if (action === 'generate-visual') { if (unsavedVisuals()) throw new Error('Save visual changes before generating an image.'); await api(`${url}/visuals/${button.dataset.visual}/generate`, 'POST'); }
  else if (action === 'approve-visual') await api(`${url}/assets/${button.dataset.asset}/approve`, 'POST');
  else if (action === 'draft-branches') { if (activeBranches().length && !confirm('Redrafting replaces the options for the selected branch point only. Continue?')) return; const job = await api(`${url}/draft-branches`, 'POST', { point_id: activePointId }); await reload(project.id); message(job.already_running ? 'The job is still running; this page will update automatically.' : 'ModelArk accepted the job. You can reload without losing progress.'); return; }
  else if (action === 'save-branch') await api(`${url}/branches/${button.dataset.branch}`, 'PATCH', collectBranch(button.dataset.branch));
  else if (action === 'approve-branch') { if (unsavedBranch(button.dataset.branch)) throw new Error('Save branch changes before approval.'); await api(`${url}/branches/${button.dataset.branch}/approve`, 'POST'); }
  else if (action === 'publish-branch') await api(`${url}/branches/${button.dataset.branch}/publish`, 'POST');
  await reload(project.id);
  if (action === 'approve-story') setActiveStep(3, true);
  if (action === 'lock-visuals') setActiveStep(4, true);
  if (action === 'unlock-visuals') setActiveStep(3, true);
  message('Action completed.');
}
document.addEventListener('click', async (event) => {
  const tabButton = event.target.closest('.workflow-tabs [data-step]');
  if (tabButton) { if (!tabButton.disabled) setActiveStep(Number(tabButton.dataset.step), true); return; }
  const pointButton = event.target.closest('[data-point-id]');
  if (pointButton) {
    if (activeBranches().some((item) => item.status === 'draft' && unsavedBranch(item.id)) && !confirm('You have unsaved changes at this branch point. Switch and discard them?')) return;
    activePointId = pointButton.dataset.pointId;
    localStorage.setItem(`living-drama-point-${project.id}`, activePointId);
    render();
    document.querySelector('#branch-workshop')?.scrollIntoView({ block: 'start' });
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const originalLabel = button.textContent;
  if (['generate-visual', 'keyframe'].includes(button.dataset.action)) button.textContent = 'Seedream is generating an image; this may take 2–3 minutes…';
  button.disabled = true;
  try { await run(button); } catch (error) { message(error.message, true); }
  finally { button.disabled = false; button.textContent = originalLabel; }
});
document.querySelector('.workflow-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const available = [...document.querySelectorAll('.workflow-tabs [data-step]')].filter((button) => !button.disabled);
  const current = available.findIndex((button) => Number(button.dataset.step) === activeStep);
  if (current < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length;
  setActiveStep(Number(available[next].dataset.step));
  available[next].focus();
});
let pollingDraftJobs = false;
setInterval(async () => {
  if (pollingDraftJobs || !project?.draft_jobs?.some((job) => job.status === 'running')) return;
  pollingDraftJobs = true;
  try {
    const latest = await api(base());
    const changed = project.draft_jobs.some((job) => job.status === 'running' && latest.draft_jobs.find((item) => item.id === job.id)?.status !== 'running');
    if (changed) {
      const dirty = activeBranches().some((item) => item.status === 'draft' && unsavedBranch(item.id));
      if (dirty) { message('The job has finished. Save or discard your current edits, then reload.'); project.draft_jobs = latest.draft_jobs; }
      else { project = latest; render(); message('ModelArk finished; results and status have been updated.'); }
    } else if (latest.draft_jobs.length !== project.draft_jobs.length) { project.draft_jobs = latest.draft_jobs; render(); }
  } catch (error) { message(`Could not check progress: ${error.message}`, true); }
  finally { pollingDraftJobs = false; }
}, 3000);
select.addEventListener('change', () => { reload(select.value).catch((error) => message(error.message, true)); });
api('/api/bootstrap').then((result) => { document.querySelector('#model-label').textContent = result.integrations.byteplus_ready ? result.integrations.text_model : 'ModelArk key missing'; });
reload().catch((error) => { root.innerHTML = `<div class="empty mt">${esc(error.message)}</div>`; });
