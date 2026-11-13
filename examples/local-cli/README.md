# Local CLI examples

Requires Node.js 24 and git. Run these from the root of any git repository.

```bash
# Analyze the change between your branch and main (merge-base aware)
npx patchsieve scan --base main --head HEAD

# Analyze the whole working tree (e.g. to see existing debt)
npx patchsieve scan --all

# Machine-readable reports
npx patchsieve scan --base main --format json  > patchsieve.json
npx patchsieve scan --base main --format sarif --output patchsieve.sarif

# Adopt on an existing codebase: accept today's findings, block only new ones
npx patchsieve baseline --all > .patchsieve-baseline.json   # commit this on your main branch

# Tune from the command line
npx patchsieve scan --base main --rule PS301=error --rule PS304=off --fail-on warning

# Environment check and rule list
npx patchsieve doctor
npx patchsieve rules
```

Use it as a pre-push hook (`.git/hooks/pre-push`):

```sh
#!/bin/sh
npx --yes patchsieve scan --base origin/main || exit 1
```

Exit codes: `0` passed, `1` findings reached the failure threshold, `2` configuration or analysis failure.
