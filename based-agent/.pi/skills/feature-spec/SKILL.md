---
name: feature-spec
description: Convert a feature request into a complete executable contract with interfaces, F2P/P2P tests, and acceptance criteria. Use when starting any non-trivial coding task to prevent NameError/TypeError failures from guessing interfaces. Invoke before writing any code when the task touches more than one file, involves external APIs, modifies existing data structures, or has unclear acceptance criteria.
---

# Feature Spec

Converts vague requests into precise executable contracts. Required before any non-trivial implementation. FeatureBench research shows agents fail primarily from guessing interfaces (TypeError/AttributeError) and missing cross-file dependencies (NameError) — this skill prevents both.

---

## Step 1: Extract Precise Behavior

Answer each question before writing a line of code:

1. **What is the user-visible outcome?** (not implementation, but effect)
2. **What are the exact inputs?** (types, shapes, valid ranges, nullability)
3. **What are the exact outputs?** (return types, side effects, files written, exceptions raised)
4. **What existing code is affected?** (run grep/read to find call sites, not guess)
5. **What are the edge cases?** (empty input, max size, concurrent access, partial failure)
6. **What must NOT change?** (existing APIs, backward-compat guarantees, test fixtures)

**Rule:** read the actual source files to find interfaces. Never assume a function signature, class attribute, or module path.

```bash
# Example discovery commands
grep -r "def function_name" .
grep -r "class ClassName" .
grep -rn "import.*ModuleName" .
```

---

## Interface Definition Template

```yaml
interface:
  name: <feature or function name>
  module_path: <exact import path, verified by reading the file>
  inputs:
    - name: <param>
      type: <exact Python/TypeScript/Go type>
      nullable: true|false
      constraints: <min/max/enum/regex>
  outputs:
    - name: <return or side effect>
      type: <type>
      description: <what this value means>
  raises:
    - exception: <ExceptionType>
      condition: <when this is raised>
  call_sites:
    - file: <path>
      line: <number>
      context: <brief description>
  dependencies:
    - module: <import path>
      verified: true  # must have read the actual file
  invariants:
    - <property that must always hold>
  edge_cases:
    - input: <edge case input>
      expected: <expected output or behavior>
```

---

## F2P Test Template (Fail-to-Pass)

Tests that MUST PASS after implementation (new behavior):

```python
# Template for each F2P test
def test_<feature>_<scenario>():
    """
    F2P: This test should fail before implementation, pass after.
    Covers: <specific behavior>
    """
    # Arrange
    <setup with exact types from interface definition>

    # Act
    result = <call the real function with real imports>

    # Assert
    assert <specific condition>, "<failure message with context>"
    # Example: assert result.status == "success", f"Expected success, got {result.status}"
```

**F2P checklist:**
- [ ] Imports use verified module paths
- [ ] Input types match interface definition exactly
- [ ] Assertions check specific values, not just truthiness
- [ ] At least one happy-path test
- [ ] At least one edge-case test from the interface's edge_cases list
- [ ] At least one error/exception test if raises is non-empty

---

## P2P Test Template (Pass-to-Pass)

Tests that MUST STAY PASSING after implementation (regression protection):

```python
# Template: identify existing tests that exercise affected code paths
def test_<existing_behavior>_still_works():
    """
    P2P: This test passed before; it must still pass after.
    Protects: <what regression this guards>
    """
    # Use existing test fixtures unchanged
    <existing test code>
```

**Finding P2P candidates:**
```bash
# Find existing tests that touch the same module
grep -r "import.*<module>" tests/
grep -r "from.*<module>" tests/
# Run existing tests to confirm baseline green
<test runner> tests/ -k "<module_name>" -v
```

---

## Acceptance Criteria Checklist

```markdown
## Acceptance Criteria for: <feature name>

### Functional
- [ ] <behavior 1>: verified by test `test_<name>`
- [ ] <behavior 2>: verified by test `test_<name>`
- [ ] Edge case <X>: verified by test `test_<name>`

### Non-regression
- [ ] All P2P tests still pass: `<test command>`
- [ ] No new imports of unverified modules
- [ ] No changes to public API signatures (or, if changed, all call sites updated)

### Validation
- [ ] Syntax check passes: `<command>`
- [ ] Type check passes: `<command>` (if applicable)
- [ ] Lint passes: `<command>`
- [ ] All F2P tests pass: `<test command>`
- [ ] All P2P tests pass: `<test command>`
```

---

## "Done Means" Definition

**A task is done when ALL of these are true:**

1. `<exact test command>` exits with code 0
2. `<exact type/lint command>` exits with code 0
3. Every F2P test in this spec passes
4. Every P2P test in this spec passes
5. No new failures in `<broader test suite command>`

**Done is NOT:**
- Code compiles/runs without error
- "Looks correct" review without running tests
- Tests pass locally but not documented
- Partial implementation with "TODO" stubs in critical paths

---

## Example: Adding a Cache Layer to an API Client

### Feature Request
"Add caching to the weather API client so repeated requests don't hit the network."

### Extracted Behavior
- Input: `city: str, ttl_seconds: int = 300`
- Output: `WeatherData` (existing type from `weather.models`)
- Side effect: stores result in memory cache keyed by city
- Cache miss: calls `self._fetch(city)` (existing method, line 47 of `client.py`)
- Cache hit: returns cached value if age < ttl_seconds
- Edge case: city="" raises ValueError

### Interface (verified by reading `weather/client.py`)
```yaml
interface:
  name: get_weather_cached
  module_path: weather.client.WeatherClient
  inputs:
    - name: city
      type: str
      nullable: false
      constraints: "non-empty string"
    - name: ttl_seconds
      type: int
      nullable: false
      constraints: "> 0, default 300"
  outputs:
    - name: return
      type: weather.models.WeatherData
      description: "Current weather for city"
  raises:
    - exception: ValueError
      condition: "city is empty string"
  dependencies:
    - module: weather.models.WeatherData
      verified: true  # read weather/models.py line 12
```

### F2P Tests
```python
def test_get_weather_cached_returns_data():
    client = WeatherClient(api_key="test")
    result = client.get_weather_cached("London")
    assert isinstance(result, WeatherData)

def test_get_weather_cached_uses_cache_on_repeat():
    client = WeatherClient(api_key="test")
    client.get_weather_cached("London")
    with patch.object(client, '_fetch') as mock_fetch:
        client.get_weather_cached("London")
        mock_fetch.assert_not_called()

def test_get_weather_cached_raises_on_empty_city():
    client = WeatherClient(api_key="test")
    with pytest.raises(ValueError):
        client.get_weather_cached("")
```

### Done Means
```bash
pytest tests/test_weather_client.py -v  # exit 0
mypy weather/client.py                  # exit 0
```
