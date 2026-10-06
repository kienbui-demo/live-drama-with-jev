// Adjust these thresholds to control when the branch invitation appears.
export const VIEWER_REVEAL_THRESHOLD = Object.freeze({
  minMatchingComments: 5,
  minShareOfAnalyzed: 0.25,
  minLeadOverNext: 2,
});

export function viewerPromptSignal(branches, currentBranchId, comments, threshold = VIEWER_REVEAL_THRESHOLD) {
  const analyzed = comments.filter((comment) => comment.status === 'matched' || comment.status === 'other').length;
  const alternatives = branches.filter((branch) => branch.id !== currentBranchId);
  const ranked = alternatives.map((branch) => ({
    branch,
    votes: comments.filter((comment) => comment.status === 'matched' && comment.branchId === branch.id).length,
  })).sort((a, b) => b.votes - a.votes);
  const top = ranked[0];
  if (!top) return null;
  const share = analyzed ? top.votes / analyzed : 0;
  const lead = top.votes - (ranked[1]?.votes || 0);
  return { ...top, analyzed, share, lead, eligible: top.votes >= threshold.minMatchingComments && share >= threshold.minShareOfAnalyzed && lead >= threshold.minLeadOverNext };
}

export function decideViewerPrompt(branches, currentBranchId, comments, threshold = VIEWER_REVEAL_THRESHOLD) {
  const signal = viewerPromptSignal(branches, currentBranchId, comments, threshold);
  return signal?.eligible ? signal : null;
}

export function branchPremise(branch) {
  return String(branch?.synopsis || '').replace(/^(?:Giả định|Premise):\s*/i, '').split(/[.;!?]/)[0].trim();
}

export function branchTeaser(branch) {
  const premise = branchPremise(branch);
  if (!premise || premise.length > 130) return `Curious how “${branch.title}” would unfold?`;
  return /^(?:nếu|if)\b/i.test(premise) ? `Curious what would happen ${premise}?` : `Curious what would happen if ${premise}?`;
}

export function buildSimulatedComments(branches, batchNumber, random = Math.random) {
  if (!branches.length) return [];
  const shuffled = [...branches];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const selected = shuffled.slice(0, 4);
  while (selected.length < 4) selected.push(shuffled[Math.floor(random() * shuffled.length)]);
  const templates = [
    (branch) => `I want to see how “${branch.title}” plays out.`,
    (branch) => `I'm curious about “${branch.title}”: ${(branchPremise(branch).split(',')[0] || branch.title).slice(0, 110)}.`,
    (branch) => `How would the ending change if the story followed “${branch.title}”?`,
    (branch) => `Does anyone want to see how the characters handle “${branch.title}”?`,
  ];
  const neutral = [
    'The lighting and setting in this scene look beautiful.',
    'I can’t wait to see what the character does next.',
    'The soundtrack fits this scene perfectly.',
    'The acting in this scene is captivating.',
  ];
  return [...selected.map((branch, index) => ({ branchId: branch.id, text: templates[(index + batchNumber - 1) % templates.length](branch) })), { branchId: null, text: neutral[(batchNumber - 1) % neutral.length] }];
}
