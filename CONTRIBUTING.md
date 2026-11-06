# Contributing to RunReady

RunReady is free software under the [MIT license](LICENSE). Issues and merge requests live on GitLab: [gitlab.com/antonyvo/runready](https://gitlab.com/antonyvo/runready).

## Setup

Requirements: Node.js 22, git, and either Linux `unshare` (util-linux) or Docker.

```bash
git clone https://gitlab.com/antonyvo/runready.git
cd runready
npm ci
cp .env.example .env.local   # optional; leave the tokens empty
npm test
npm run dev
```

Open http://localhost:3000. `npm run build` must pass before you open a merge request. GitLab CI runs the same two commands from [`.gitlab-ci.yml`](.gitlab-ci.yml).

## Merge requests

1. Fork the project, or branch from `main` if you already have push access.
2. Keep the change focused. Match the TypeScript style already in `src/lib/`.
3. Add or update a `node:test` file next to the code you change.
4. Open a merge request. The default template asks for the test commands you ran.

`GITHUB_TOKEN` and `GITLAB_TOKEN` are optional server settings for opening a fix request on a repository you proved. Never commit a real token, a `.env` file, or a log that contains one.

## Good first issues

[ISSUES.md](ISSUES.md) lists starter tasks with the file to open and the acceptance criteria. The [good first issue template](.gitlab/issue_templates/Good%20first%20issue.md) is the form to use when filing one of them.

## What stays out

RunReady has no accounts, plans, or payments. A contribution that adds a quota, a checkout page, or a billing dependency will be declined. Private-repository OAuth is a later project, not a drive-by change.
