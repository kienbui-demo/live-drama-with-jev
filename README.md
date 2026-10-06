# Living Drama

An interactive short-drama prototype. Producers turn a complete script into approved story branches and pre-produced videos. Viewers watch a branch, leave comments, and can explore another path when Jev detects enough interest in that direction. The videos are prepared ahead of time: Jev selects among available paths rather than generating video during playback.

## What the demo shows

- **Production studio (`/producer`)** — import a `.md` or `.txt` script, analyze its story with a ModelArk text model, review and approve the story profile, generate and lock character/setting/prop references with Seedream, draft branch options and shot prompts, then generate keyframes and videos with Seedream and Seedance. Each branch is published only after its shots are ready.
- **Viewer experience (`/viewer`)** — watch published shots, add five simulated comments per click or write a comment, then explicitly ask Jev to classify all comments in the viewing session. A contextual invitation to explore another pre-produced branch appears only when an alternate path meets the configurable interest thresholds in `public/viewer-policy.mjs`.
- **Legacy local demo (`/`)** — a separate sample-story workflow for comments, audience insights, decisions, visuals, and episode planning. It is not the same project store as the production studio.

The interface is in English. Uploaded scripts, AI-generated story material, and viewer comments retain their original language.

## Requirements and local setup

- Node.js 24 or newer; no npm dependencies are required.
- Optional API credentials for paid AI operations: BytePlus ModelArk (`ARK_API_KEY`) and TypeSafe AI Jev (`JEV_API_KEY`). The production flow requires ModelArk and Seedream/Seedance access; Jev is used when the viewer analysis button is pressed.

In PowerShell:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Edit .env locally; never commit or paste real API keys into the repository.
npm test
npm start
```

Open `http://127.0.0.1:4173/producer` or `http://127.0.0.1:4173/viewer`. Set `PORT` in `.env` if 4173 is occupied. The server listens on `127.0.0.1` only. `npm start` enables the operating system certificate store for outbound ModelArk requests.

`ARK_API_KEY` is shared by the text model, Seedream, and Seedance. Defaults and timeouts are documented in `.env.example`. The text model is `deepseek-v4-1-flash-260910` with `reasoning_effort=medium`. Seedream uses fast prompt optimization and can take several minutes. Provider calls may incur charges; the UI asks for confirmation before generation or analysis.

## Production walkthrough

1. Import a complete script in the production studio. Review the generated story profile and its proposed branch points before approval.
2. Generate, inspect, and approve character, setting, and prop images. Lock the visual references before drafting branches.
3. Select a branch point and draft 2–3 options. Review each option and its shot prompts; approve the branches you want to produce.
4. Generate and approve each shot's keyframe, then submit the shot to Seedance and check progress. Publish a branch when all of its videos are complete.
5. Open the viewer. Generate simulated comments or enter comments, then press the separate Jev analysis button. Jev classifies the session's comments against published branches. Once an alternate branch has at least five matching comments, at least 25% of classified comments, and a lead of at least two comments over the next alternate, the viewer sees a contextual invitation.

The threshold values are in [`public/viewer-policy.mjs`](public/viewer-policy.mjs). Simulated comments do not call AI; Jev analysis does.

## Data, secrets, and publishing

`.env` contains local credentials and is ignored by Git. `data/` contains the SQLite database and generated image/video files; it is also ignored. A fresh clone therefore starts without your locally produced projects or published videos. The original PRD `.docx` and provider reference files under `references/` are excluded by default so they are not accidentally published; review rights and sensitivity before sharing them separately.

Do not publish this local server directly to the internet. It has no user authentication, authorization, durable production queue, or multi-user isolation. Generated shots play sequentially in the viewer; the new production flow does not render a final edited film file.

## Verification and project documents

```powershell
npm test
```

Tests cover the story workflow and mocked HTTP contracts for ModelArk, Seedream, Seedance, and Jev. They do not make paid provider calls.

- [Architecture](docs/01-kien-truc-he-thong.md)
- [Product specification](docs/02-dac-ta-san-pham-mvp.md)
- [Data schema](docs/03-hop-dong-du-lieu.schema.json)

For provider details, see the official [TypeSafe AI documentation](https://docs.typesafe.ai/introduction/quickstart) and [BytePlus ModelArk documentation](https://docs.byteplus.com/en/docs/ModelArk).
