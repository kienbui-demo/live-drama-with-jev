import { branchTeaser, buildSimulatedComments, decideViewerPrompt, viewerPromptSignal, VIEWER_REVEAL_THRESHOLD } from './viewer-policy.mjs';
import { uiErrorMessage } from './ui-errors.mjs';

const select = document.querySelector('#viewer-project');
const content = document.querySelector('#viewer-content');
const toast = document.querySelector('#viewer-toast');
let project = null;
let activePointId = '';
let activeBranchId = '';
let shotIndex = 0;
let showChoices = false;
let comments = [];
let sessionToken = 0;
let simulationBatch = 0;
let analysisRunning = false;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const point = () => project?.points.find((item) => item.id === activePointId) || project?.points[0];
const branch = () => point()?.branches.find((item) => item.id === activeBranchId) || point()?.branches[0];
const clock = (seconds) => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
const commentId = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
  const digit = Math.floor(Math.random() * 16);
  return (char === 'x' ? digit : (digit & 3) | 8).toString(16);
});

function notice(value, error = false) {
  toast.textContent = value;
  toast.className = `toast show${error ? ' error' : ''}`;
  setTimeout(() => { toast.className = 'toast'; }, 5000);
}
async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(uiErrorMessage(value));
  return value;
}
const promptDecision = () => decideViewerPrompt(point()?.branches || [], branch()?.id, comments);
const suggestedAlternative = () => promptDecision()?.branch;
function teaser() {
  const alternative = suggestedAlternative();
  return alternative ? branchTeaser(alternative) : '';
}
function choiceMarkup() {
  const current = branch();
  const alternatives = point().branches.filter((item) => item.id !== current.id);
  return alternatives.length ? alternatives.map((item) => `<button type="button" class="choice-card" data-choose-branch="${esc(item.id)}"><span class="choice-label">ALTERNATE PATH</span><strong>${esc(item.title)}</strong><span>${esc(item.synopsis)}</span><em>Watch this version →</em></button>`).join('') : '<p class="empty-choice">No alternate path has been published for this branch point yet.</p>';
}
function renderPage() {
  if (!project) {
    content.innerHTML = '<div class="viewer-empty"><h1>No show available yet</h1><p>The producer needs to publish at least one branch with all its videos.</p></div>';
    return;
  }
  const currentPoint = point();
  content.innerHTML = `<div class="watch-layout">
    <section class="watch-main" aria-label="Show and alternate paths">
      <div class="watch-heading"><div><span class="watch-kicker">NOW PLAYING · ${esc(currentPoint.episode)}</span><h1>${esc(project.title)}</h1><p>Watch the story first. When you get curious about another direction, you can explore a version prepared in advance.</p></div>${project.points.length > 1 ? `<label class="point-selector">Branch point <select id="viewer-point">${project.points.map((item) => `<option value="${esc(item.id)}" ${item.id === currentPoint.id ? 'selected' : ''}>${esc(item.episode)} · ${esc(item.question)}</option>`).join('')}</select></label>` : ''}</div>
      <div id="player-region"></div>
      <div class="watch-branch-banner" id="watch-branch-banner" ${promptDecision() ? '' : 'hidden'}><div><span class="watch-kicker">CURIOUS?</span><h2 id="teaser-heading">${esc(teaser())}</h2><p>This question comes from a published branch summary; its video was produced in advance.</p></div><button type="button" id="open-choices" class="purple-button">Explore another path →</button></div>
      <div class="watch-caveat">This demo has videos from branch points, but not complete original episodes leading up to them. “Now playing” is the first published branch, not necessarily the original script.</div>
    </section>
    <aside class="watch-sidebar" aria-label="Comments and Jev recommendations">
      <div class="jev-panel"><div class="jev-title"><strong id="jev-status">✧ Jev is waiting</strong><span id="classified-count">0 classified</span></div><div class="jev-progress"><span id="jev-progress-fill"></span></div><p>Jev analyzes comments only when you press the button below. A suggestion appears when an alternate path has at least ${VIEWER_REVEAL_THRESHOLD.minMatchingComments} comments, represents ${Math.round(VIEWER_REVEAL_THRESHOLD.minShareOfAnalyzed * 100)}% of classified comments, and leads the next path by ${VIEWER_REVEAL_THRESHOLD.minLeadOverNext} comments.</p><div id="jev-leader" class="jev-leader">No analysis yet.</div><div class="jev-list-head"><span>TRENDING PATHS</span><span>COMMENTS</span></div><div id="direction-list"></div></div>
      <div class="chat-panel"><div class="chat-heading"><strong>Viewer comments</strong><span id="chat-count"></span></div><div id="chat-feed" class="chat-feed" aria-live="polite"></div><div class="chat-actions"><button type="button" id="simulate-comments" class="demo-button">+ Add 5 simulated comments</button><button type="button" id="analyze-comments" class="demo-button analyze-button">✧ Analyze with Jev</button><small>Simulation does not call AI. Jev classifies all comments in this viewing session and may incur charges.</small></div><form id="comment-form" class="comment-form"><label class="sr-only" for="viewer-message">Your comment</label><input id="viewer-message" maxlength="500" placeholder="What would you like to see happen if…" required><button type="submit" aria-label="Send comment">↑</button></form></div>
    </aside>
  </div>`;
  renderPlayer();
  updateSidebar();
}
function renderPlayer(autoplay = false) {
  const current = branch();
  const shot = current?.shots[shotIndex];
  const holder = document.querySelector('#player-region');
  if (!holder || !shot) return;
  holder.innerHTML = `<div class="video-stage"><video id="viewer-video" playsinline preload="metadata" src="${esc(shot.video_path)}"></video><div class="video-shade"></div><button type="button" id="play-center" class="play-center" aria-label="Play video with sound"><span>▶</span> Play video</button><div id="branch-prompt" class="branch-prompt" ${showChoices && promptDecision() ? '' : 'hidden'}><div class="prompt-top"><span>STORY BRANCH POINT</span><button type="button" id="close-choices" aria-label="Close choices">×</button></div><h2 id="prompt-heading">${esc(teaser())}</h2><p>To try another path, choose one of the videos prepared below.</p><div class="choice-list">${choiceMarkup()}</div><button type="button" id="replay-current" class="replay-button">↺ Replay current path</button></div></div>
    <div class="player-console"><div class="player-controls"><button type="button" id="play-toggle" aria-label="Play or pause">▶</button><span id="time-readout">0:00 / ${clock(shot.duration_seconds)}</span><input id="seek" type="range" min="0" max="1000" value="0" aria-label="Seek video"><button type="button" id="sound-toggle" aria-label="Mute or unmute">♫</button><button type="button" id="next-shot" ${shotIndex === current.shots.length - 1 ? 'disabled' : ''}>Next shot →</button></div><div class="player-meta"><span>Shot ${shotIndex + 1}/${current.shots.length} · ${esc(current.title)}</span><span>${esc(point().episode)} · ${current.shots.length} shots</span></div></div>`;
  const video = document.querySelector('#viewer-video');
  video.addEventListener('loadedmetadata', updateTime);
  video.addEventListener('timeupdate', updateTime);
  video.addEventListener('play', updatePlayState);
  video.addEventListener('pause', updatePlayState);
  video.addEventListener('ended', () => {
    if (shotIndex < current.shots.length - 1) goShot(shotIndex + 1, true);
    else { showChoices = Boolean(promptDecision()); document.querySelector('#branch-prompt').hidden = !showChoices; updatePlayState(); }
  });
  video.addEventListener('error', () => notice('Could not load this shot. Please reload the page.', true));
  if (autoplay) playVideo();
}
function updateTime() {
  const video = document.querySelector('#viewer-video');
  if (!video) return;
  const duration = Number.isFinite(video.duration) ? video.duration : branch()?.shots[shotIndex]?.duration_seconds || 0;
  document.querySelector('#time-readout').textContent = `${clock(video.currentTime)} / ${clock(duration)}`;
  document.querySelector('#seek').value = duration ? String(Math.round(video.currentTime / duration * 1000)) : '0';
}
function updatePlayState() {
  const video = document.querySelector('#viewer-video');
  if (!video) return;
  document.querySelector('#play-toggle').textContent = video.paused ? '▶' : 'Ⅱ';
  document.querySelector('#play-center').hidden = !video.paused || showChoices;
  document.querySelector('#sound-toggle').textContent = video.muted ? '♩' : '♫';
}
async function playVideo() {
  const video = document.querySelector('#viewer-video');
  if (!video) return;
  try { await video.play(); } catch { updatePlayState(); }
}
function goShot(index, autoplay = false) {
  shotIndex = Math.max(0, Math.min(index, branch().shots.length - 1));
  showChoices = false;
  renderPlayer(autoplay);
}
function chooseBranch(id) {
  if (!point()?.branches.some((item) => item.id === id)) return;
  activeBranchId = id;
  shotIndex = 0;
  showChoices = false;
  renderPlayer(true);
  updateSidebar();
  document.querySelector('.video-stage')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  notice(`Now watching “${branch().title}”.`);
}
function updateSidebar() {
  const list = document.querySelector('#direction-list');
  if (!list || !point()) return;
  const matched = comments.filter((item) => item.status === 'matched');
  const classified = comments.filter((item) => item.status === 'matched' || item.status === 'other');
  const counts = new Map(point().branches.map((item) => [item.id, matched.filter((comment) => comment.branchId === item.id).length]));
  const max = Math.max(1, ...counts.values());
  const decision = promptDecision();
  const signal = viewerPromptSignal(point().branches, branch()?.id, comments);
  document.querySelector('#jev-status').textContent = analysisRunning ? '✧ Jev is analyzing' : '✧ Jev comment analysis';
  document.querySelector('#classified-count').textContent = `${classified.length}/${comments.length} classified`;
  document.querySelector('#jev-progress-fill').style.width = `${comments.length ? classified.length / comments.length * 100 : 0}%`;
  document.querySelector('#jev-leader').textContent = decision ? `Enough interest: ${decision.branch.title} · ${decision.votes}/${decision.analyzed} comments, leads by ${decision.lead}` : signal?.votes ? `Leading: ${signal.branch.title} · ${signal.votes}/${signal.analyzed} comments, leads by ${signal.lead}. Threshold not met yet.` : 'Jev has not identified a leading path yet.';
  const suggestion = teaser();
  document.querySelector('#watch-branch-banner').hidden = !decision;
  if (!decision && showChoices) showChoices = false;
  if (document.querySelector('#branch-prompt')) document.querySelector('#branch-prompt').hidden = !showChoices || !decision;
  if (document.querySelector('#teaser-heading')) document.querySelector('#teaser-heading').textContent = suggestion;
  if (document.querySelector('#prompt-heading')) document.querySelector('#prompt-heading').textContent = suggestion;
  list.innerHTML = point().branches.map((item, index) => `<div class="direction"><div><span>${index + 1}</span><strong>${esc(item.title)}</strong><b>${counts.get(item.id)}</b></div><i style="width:${Math.max(3, counts.get(item.id) / max * 100)}%"></i></div>`).join('');
  const feed = document.querySelector('#chat-feed');
  feed.innerHTML = comments.length ? comments.map((item) => {
    const matchedBranch = point().branches.find((choice) => choice.id === item.branchId);
    const verdict = item.status === 'matched' ? `Jev → ${matchedBranch?.title || 'Matching path'}` : item.status === 'other' ? 'Jev → No matching video' : item.status === 'loading' ? 'Jev is classifying…' : 'Not analyzed by Jev';
    return `<div class="chat-entry"><div><strong>${esc(item.author)}</strong>${item.simulated ? '<span>SIMULATED</span>' : ''}</div><p>${esc(item.text)}</p><small>${esc(verdict)}</small></div>`;
  }).join('') : '<p class="chat-empty">No comments yet. Add your own or generate five simulated comments.</p>';
  document.querySelector('#chat-count').textContent = `${comments.length} comments`;
  document.querySelector('#simulate-comments').disabled = analysisRunning;
  const analyze = document.querySelector('#analyze-comments');
  analyze.disabled = analysisRunning || !comments.length;
  analyze.textContent = analysisRunning ? 'Jev is analyzing…' : `✧ Analyze ${comments.length} comments with Jev · may incur charges`;
  document.querySelector('#viewer-message').disabled = analysisRunning;
  document.querySelector('#comment-form button').disabled = analysisRunning;
  feed.scrollTop = feed.scrollHeight;
  updatePlayState();
}
function addComment(text, author, simulated) {
  comments.push({ id: commentId(), author, text, simulated, status: 'pending', branchId: null });
  updateSidebar();
}
function addFiveSimulatedComments() {
  if (!project || analysisRunning) return;
  simulationBatch += 1;
  const samples = buildSimulatedComments(point().branches, simulationBatch);
  for (let index = 0; index < samples.length; index += 1) comments.push({ id: commentId(), author: `simulated_viewer_${simulationBatch}_${index + 1}`, text: samples[index].text, simulated: true, status: 'pending', branchId: null });
  updateSidebar();
  notice('Added five simulated comments. Jev has not been called.');
}
async function analyzeComments() {
  if (!project || !comments.length || analysisRunning) return;
  const token = sessionToken;
  const projectId = project.id;
  const pointId = point().id;
  const snapshot = comments.map((item) => ({ id: item.id, message: item.text, simulated: item.simulated }));
  const previous = comments.map((item) => ({ status: item.status, branchId: item.branchId }));
  analysisRunning = true;
  comments.forEach((item) => { item.status = 'loading'; item.branchId = null; });
  updateSidebar();
  try {
    const value = await api(`/api/watch/projects/${projectId}/route-batch`, 'POST', { point_id: pointId, comments: snapshot });
    if (token !== sessionToken || project?.id !== projectId || point()?.id !== pointId) return;
    if (!Array.isArray(value.results) || value.results.length !== snapshot.length) throw new Error('Jev did not return a result for every comment.');
    const byId = new Map(value.results.map((item) => [item.id, item]));
    if (byId.size !== snapshot.length || snapshot.some((item) => !byId.has(item.id))) throw new Error('Jev results do not match this viewing session’s comments.');
    comments.forEach((item) => { const result = byId.get(item.id); item.status = result.branch_id ? 'matched' : 'other'; item.branchId = result.branch_id; });
    notice(promptDecision() ? 'Jev found enough interest in an alternate path. The invitation is now visible.' : 'Jev finished analyzing; no path has met the suggestion threshold yet.');
  } catch (error) {
    if (token !== sessionToken) return;
    comments.forEach((item, index) => { item.status = previous[index].status; item.branchId = previous[index].branchId; });
    notice(error.message, true);
  } finally {
    if (token === sessionToken) { analysisRunning = false; updateSidebar(); }
  }
}
async function load(id) {
  sessionToken += 1;
  project = id ? await api(`/api/watch/projects/${id}`) : null;
  activePointId = project?.points[0]?.id || '';
  activeBranchId = point()?.branches[0]?.id || '';
  shotIndex = 0;
  showChoices = false;
  comments = [];
  simulationBatch = 0;
  analysisRunning = false;
  renderPage();
}
async function init() {
  const projects = await api('/api/watch/projects');
  select.innerHTML = `<option value="">${projects.length ? 'Select a show' : 'No published shows'}</option>${projects.map((item) => `<option value="${esc(item.id)}">${esc(item.title)}</option>`).join('')}`;
  const id = new URL(location.href).searchParams.get('project') || projects[0]?.id || '';
  if (projects.some((item) => item.id === id)) { select.value = id; await load(id); }
  else renderPage();
}
document.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-choose-branch]');
  if (choice) return chooseBranch(choice.dataset.chooseBranch);
  if (event.target.closest('#play-center') || event.target.closest('#play-toggle')) {
    const video = document.querySelector('#viewer-video');
    if (video.paused) playVideo(); else video.pause();
  } else if (event.target.closest('#next-shot')) goShot(shotIndex + 1, true);
  else if (event.target.closest('#sound-toggle')) { const video = document.querySelector('#viewer-video'); video.muted = !video.muted; updatePlayState(); }
  else if (event.target.closest('#open-choices') && promptDecision()) { showChoices = true; document.querySelector('#branch-prompt').hidden = false; document.querySelector('#viewer-video').pause(); updatePlayState(); document.querySelector('.video-stage').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  else if (event.target.closest('#close-choices')) { showChoices = false; document.querySelector('#branch-prompt').hidden = true; updatePlayState(); }
  else if (event.target.closest('#replay-current')) goShot(0, true);
  else if (event.target.closest('#simulate-comments')) addFiveSimulatedComments();
  else if (event.target.closest('#analyze-comments')) analyzeComments();
});
document.addEventListener('input', (event) => {
  if (event.target.id !== 'seek') return;
  const video = document.querySelector('#viewer-video');
  if (Number.isFinite(video.duration)) video.currentTime = Number(event.target.value) / 1000 * video.duration;
});
document.addEventListener('submit', async (event) => {
  if (event.target.id !== 'comment-form') return;
  event.preventDefault();
  const input = document.querySelector('#viewer-message');
  const value = input.value.trim();
  if (!value || !project || analysisRunning) return;
  input.value = '';
  addComment(value, 'you', false);
  notice('Comment added. Press the Jev button to analyze the entire viewing session.');
});
select.addEventListener('change', () => { load(select.value).catch((error) => notice(error.message, true)); });
document.addEventListener('change', (event) => {
  if (event.target.id !== 'viewer-point') return;
  sessionToken += 1;
  activePointId = event.target.value;
  activeBranchId = point()?.branches[0]?.id || '';
  shotIndex = 0;
  showChoices = false;
  comments = [];
  simulationBatch = 0;
  analysisRunning = false;
  renderPage();
});
init().catch((error) => { content.innerHTML = `<div class="viewer-empty">${esc(error.message)}</div>`; });
