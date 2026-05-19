---
name: repo-validation
description: Run the correct validation commands for this project. Use before marking any task complete to verify no regressions. Invoke after every code change, before emitting a rollout summary, and whenever tests have not been explicitly run. No task is complete without validation evidence.
---

# Repo Validation

**Core rule (from FeatureBench research):** No success without validation. A task is incomplete until deterministic checks have run and their output is recorded. "Looks correct" is not evidence.

---

## Step 1: Discover Project Type

Run these in order to identify the stack:

```bash
# Python
ls setup.py pyproject.toml setup.cfg requirements.txt 2>/dev/null
ls pytest.ini tox.ini .pytest.ini 2>/dev/null

# Node / TypeScript
ls package.json tsconfig.json 2>/dev/null

# Rust
ls Cargo.toml 2>/dev/null

# Go
ls go.mod 2>/dev/null

# C# / .NET
ls *.csproj *.sln 2>/dev/null

# Java
ls pom.xml build.gradle 2>/dev/null
```

Also check `AGENTS.md` — project-specific commands should be listed there. If they are, use those **first** and skip discovery.

---

## Validation Command Matrix

### Python

| Check | Primary | Fallback |
|---|---|---|
| Syntax | `python -m py_compile <file>` | `python -c "import ast; ast.parse(open('<file>').read())"` |
| Unit tests | `pytest -v` | `python -m unittest discover` |
| Lint | `ruff check .` | `flake8 .` or `pylint <module>` |
| Type check | `mypy .` | `pyright .` |
| All at once | `pytest -v && mypy . && ruff check .` | |

```bash
# Discover test files and runner config
grep -r "testpaths\|tool.pytest" pyproject.toml setup.cfg 2>/dev/null
cat pytest.ini 2>/dev/null
# Run targeted tests first (faster feedback)
pytest tests/ -k "<changed_module>" -v
# Then full suite
pytest -v
```

### Node / TypeScript

| Check | Primary | Fallback |
|---|---|---|
| Syntax / compile | `npx tsc --noEmit` | `node --check <file>` |
| Unit tests | `npm test` | `npx jest` or `npx vitest run` |
| Lint | `npx eslint .` | `npx biome check .` |
| Type check | `npx tsc --noEmit` | included above |

```bash
# Check package.json for scripts
cat package.json | grep -A 20 '"scripts"'
npm run test
npm run lint
npm run typecheck  # if present
```

### Rust

| Check | Command |
|---|---|
| Compile | `cargo build` |
| Tests | `cargo test` |
| Lint | `cargo clippy -- -D warnings` |
| Format check | `cargo fmt -- --check` |

### Go

| Check | Command |
|---|---|
| Build | `go build ./...` |
| Tests | `go test ./...` |
| Lint | `golangci-lint run` or `go vet ./...` |
| Format check | `gofmt -l .` (non-empty = unformatted) |

### C# / .NET

| Check | Command |
|---|---|
| Build | `dotnet build` |
| Tests | `dotnet test` |
| Format check | `dotnet format --verify-no-changes` |

### Java

| Check | Maven | Gradle |
|---|---|---|
| Build | `mvn compile` | `./gradlew compileJava` |
| Tests | `mvn test` | `./gradlew test` |
| Lint | `mvn checkstyle:check` | `./gradlew checkstyleMain` |

---

## Fallback Checks (No Test Suite)

When no test runner is configured, use these minimum checks:

```bash
# 1. Syntax validation (Python)
for f in $(find . -name "*.py" -not -path "./.venv/*"); do
  python -m py_compile "$f" || echo "SYNTAX ERROR: $f"
done

# 2. Import check (Python) — catches NameError and missing deps
python -c "import <changed_module>"

# 3. Dry-run / smoke test — run the entry point with safe args
python <entrypoint>.py --help 2>&1 | head -20

# 4. Git diff to verify only intended files changed
git diff --stat

# 5. Check for obvious breakage markers
grep -rn "TODO\|FIXME\|HACK\|BUG\|XXX" <changed_files>
```

---

## Handling Flaky Tests

If a test fails intermittently:

1. Run it 3 times: `pytest tests/test_flaky.py -v --count=3` (requires pytest-repeat)
2. Or manually: run the test, note pass/fail, run again
3. If it fails < 2/3 times: document as flaky, record in attempt summary, do not count as regression
4. If it fails consistently: this is a real failure, not flakiness — investigate

**Record flaky tests in `AGENTS.md`:**
```markdown
## Known Flaky Tests
- `tests/test_network.py::test_timeout` — network-dependent, skip in offline env
```

---

## Broken Environment

If the test environment itself is broken (import errors on unchanged code, missing dependencies):

```bash
# Python: check environment
python --version
pip list | grep <expected_package>
pip install -r requirements.txt  # or: poetry install / uv sync

# Node: reinstall
rm -rf node_modules && npm install

# Check if CI passes to confirm it's local-only
# Document environment issue in attempt summary under failure_modes
```

Do **not** mark a task complete when the environment is broken. Record the blocker in the attempt summary and escalate.

---

## Recording Validation Results

After running validation, record results using the `validation_checklist` tool or in the attempt summary:

```json
{
  "validation": {
    "project_type": "python",
    "commands_run": [
      { "cmd": "pytest -v", "exit_code": 0, "summary": "47 passed, 0 failed" },
      { "cmd": "mypy .", "exit_code": 0, "summary": "Success: no issues found" },
      { "cmd": "ruff check .", "exit_code": 0, "summary": "All checks passed" }
    ],
    "f2p_tests_passed": ["test_new_feature_happy_path", "test_new_feature_edge_case"],
    "p2p_regressions": [],
    "flaky_tests_skipped": ["test_network_timeout"],
    "verdict": "PASS"
  }
}
```

If using the `record_validation` tool:
```
record_validation(
  project="<name>",
  commands=[...],
  verdict="pass|fail|blocked",
  notes="<any caveats>"
)
```

---

## Pre-Completion Checklist

Before marking ANY task complete:

- [ ] Identified correct validation commands for this project type
- [ ] Ran full test suite (or documented why it's unavailable)
- [ ] Ran lint/typecheck (or documented why it's unavailable)
- [ ] No new test failures (P2P regressions = 0)
- [ ] All F2P tests pass (new behavior verified)
- [ ] Validation results recorded in attempt summary
- [ ] Flaky tests documented if skipped
- [ ] Environment issues documented if present

**If you cannot run any validation:** document this explicitly in the attempt summary with `verdict: needs_refinement` and explain what blocked validation. Do not emit `candidate` verdict without validation evidence.
