# Prompt for Claude in Chrome: publish the two Reddit posts

Copy everything inside the block below (use the copy button on GitHub, not the terminal), paste it into Claude in Chrome while logged in to Reddit.

````text
You are helping me publish two text posts on Reddit from my own, already logged-in account. Work in this browser. Do not create accounts, do not enter or ask for passwords, and do not change any account settings. If you hit a login wall, a CAPTCHA, or a verification step, stop and tell me.

STEP 0 - Rules first (for each subreddit below)
Open the subreddit, read its Rules/sidebar and any pinned posts. If the rules forbid posts about your own project, require a specific flair, a minimum account age/karma, or a self-promotion thread instead, DO NOT post there. Tell me exactly what the rule says and wait for my decision. If a flair is required, choose the one that fits "project / showcase / discussion" best.

STEP 1 - r/opensource
Create a new TEXT post (not a link post) with exactly this title and body. Keep the Markdown; if the editor is in rich-text mode, switch to Markdown mode or make sure the list and inline code render correctly.

TITLE:
I built PatchSieve: an MIT-licensed, no-LLM quality gate for pull requests

BODY:
I built PatchSieve to catch the predictable mistakes that keep showing up in pull requests, especially large AI-assisted ones: tests that assert nothing, empty `catch` blocks, `throw new Error('Not implemented')` left behind, a dependency added to `package.json` but never installed, and risky SQL migrations.

How it works:

- It only looks at the lines a PR changes, so old debt doesn't block new work.
- It analyzes code statically (TypeScript compiler API for JS/TS, a small SQL tokenizer for migrations). Nothing from the PR is executed or installed.
- There is no LLM and no API key, so the same code gives the same result every time.
- Config and baseline are read from the base branch, so a PR can't switch off its own checks.
- Output: GitHub annotations, a job summary, JSON and SARIF.

It's a GitHub Action (on the Marketplace) and a CLI: `npx patchsieve scan --base main`.

It is pattern-based, so it will miss things and can flag legitimate code. The numbers in the repo come from a small hand-built corpus and shouldn't be read as general accuracy. It doesn't replace ESLint, Semgrep or CodeQL. I'd really like feedback, especially false-positive reports with a minimal code sample.

Repo: https://github.com/mysterekkk/patchsieve

Before pressing Post: show me a screenshot of the filled form (title, body preview, flair) and wait for my "ok". After I confirm, submit it, then give me the post URL.

STEP 2 - r/github (only after step 1 is done, and not within the same few minutes)
Same procedure (rules check, TEXT post, screenshot, wait for my "ok", submit, give me the URL):

TITLE:
A GitHub Action that checks only the changed lines of a PR for common mistakes (no LLM, no secrets)

BODY:
I built a GitHub Action called PatchSieve and I'd like feedback on its security model, since it analyzes untrusted pull requests.

- It runs on `pull_request` (not `pull_request_target`) with `contents: read` and needs no secrets.
- It reads git blobs only and never runs `npm install`, scripts, tests or migrations from the PR. Symlinks are refused.
- Config and baseline come from the base branch, so a PR can't weaken its own checks.
- Event-payload values are validated, and workflow commands, terminal escapes and Markdown are escaped in all output.

What it checks: tests with no assertions, empty catch blocks, placeholder implementations, lockfile drift and risky migrations, only on lines the PR changed.

```yaml
- uses: actions/checkout@v7
  with: { fetch-depth: 0, persist-credentials: false }
- uses: mysterekkk/patchsieve@v0.1.1
```

Known limitation: a PR can still edit the workflow file that calls the action, so protect it with CODEOWNERS or required workflows. Repo: https://github.com/mysterekkk/patchsieve

RULES FOR THE WHOLE TASK
- Post only these two texts, unchanged, in English. Do not add hashtags, emojis or extra claims, and do not edit the wording.
- Do not post to any other subreddit, do not cross-post, do not comment, vote, or message anyone.
- Never click "Post"/"Submit" before I confirm the screenshot.
- If a post is removed, held for moderation, or blocked, do not retry or work around it; report what Reddit says.
- At the end, list each post URL and its status (live / pending moderation / not posted and why).
````
