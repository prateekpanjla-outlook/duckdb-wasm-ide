# Agentic AI Course — Assignment Analysis

> **Update 2026-04-19:** A Question Authoring Agent has been implemented in this project using Gemini 2.5 Flash function calling. See [question-authoring-agent.md](./question-authoring-agent.md) for the implementation plan. The agent has 7 tools, admin auth, rate limiting, concept taxonomy integration, and human-in-the-loop approval. It is deployed and working on production.

## Assignment
> Full-stack agent with a working web UI — backend in Python, frontend in Node.js/React. Agent takes a goal and executes it with at least one tool.

## What "Agentic" Means

The agent autonomously decides which tools to call and in what order, based on the goal. The core loop: **think → act → observe → repeat**.

| Regular LLM call | Agentic |
|---|---|
| User asks, LLM answers from knowledge | LLM decides to use tools to gather info |
| Single request-response | Loop: think → act → observe → think again |
| No side effects | Can read files, call APIs, write data |

## Project Idea: Code Architecture Migration Agent

"Migrate this Express+vanilla JS app to FastAPI+React" — using this project as the input codebase.

### Why this works for the assignment

1. **Real codebase** (this project) as input — not a toy example
2. **Output is runnable locally** — grader can verify
3. **Multiple tools needed** — genuinely agentic
4. **The path is unpredictable** — agent discovers routes, models, frontend components as it goes
5. **Error recovery loop** — agent runs tests, reads failures, fixes code, retries

### Architecture

```
React Frontend
    |
    | POST /agent {"goal": "Migrate server/routes/auth.js to FastAPI"}
    |
    v
FastAPI Backend (Agent Loop)
    |
    +-- LLM decides -> call tool: read_file("server/server.js")
    |   -> discovers routes, middleware, DB setup
    |
    +-- LLM decides -> call tool: list_files("server/routes/")
    |   -> finds auth.js, practice.js, ai.js
    |
    +-- LLM decides -> call tool: read_file("server/routes/auth.js")
    |   -> understands auth endpoints
    |
    +-- LLM decides -> call tool: write_file("backend/routes/auth.py")
    |   -> generates FastAPI equivalent
    |
    +-- LLM decides -> call tool: execute_command("pytest")
    |   -> tests fail -> reads error -> fixes -> retries
    |
    +-- LLM decides -> "I have enough info"
        -> Returns: "Migration complete. Created 3 files."
```

### Tools

```python
tools = [
    read_file,          # Read source files from the original codebase
    list_files,         # Discover project structure
    write_file,         # Write migrated files
    execute_command,    # Run the migrated app, run tests
    search_code,        # Find patterns like "router.post" across files
]
```

### What makes it genuinely agentic

| Step | Why it can't be hardcoded |
|---|---|
| Discovery | Agent doesn't know file structure upfront |
| Translation decisions | Express middleware -> FastAPI depends, route patterns differ |
| Error recovery | Generated code might not run — agent reads error, fixes it |
| Dependency mapping | `express-rate-limit` -> what's the Python equivalent? Agent decides |
| Ordering | Must create models before routes that reference them |

### Scope options

| Scope | Effort | Impressiveness |
|---|---|---|
| **Backend only**: Express -> FastAPI | Medium | Good |
| **Frontend only**: Vanilla JS -> React | Medium | Good |
| **Both**: Full stack migration | High | Very impressive |
| **Backend + tests**: Migrate + generate + run tests | Medium-High | Best for demo |

**Recommended**: Backend migration (Express -> FastAPI) with test verification. Bounded scope (6 server files), genuinely needs tools, and the retry-on-test-failure cycle is compelling to demo.

### Demo flow

```
User: "Migrate server/routes/auth.js to FastAPI"

UI shows:
  tool  Reading server/routes/auth.js...
  think Found 6 endpoints: register, login, verify...
  tool  Reading server/models/User.js...
  think Need SQLAlchemy model first
  write Writing backend/models/user.py
  write Writing backend/routes/auth.py
  tool  Running: pytest backend/tests/test_auth.py
  error ImportError: cannot import 'get_db'
  think Need to create database dependency
  write Writing backend/database.py
  tool  Running: pytest backend/tests/test_auth.py
  pass  6 tests passed
  done  Migration complete. Created 3 files.
```

## Alternative: SQL Tutor Agent

We already built an SQL tutor in this project, but our approach is hardcoded (3 prompt types, single LLM call each). An agentic version would:

- Agent autonomously explores schema, runs sample queries, checks student's work
- Open-ended goals like "teach me JOINs from scratch"
- Multi-step: create exercises -> check work -> adapt difficulty

### Why we didn't use an agent for our SQL tutor

| Concern | Our hardcoded approach | Agentic approach |
|---|---|---|
| **Latency** | 1 API call, ~1-2s | 3-5 API calls in a loop, ~5-15s |
| **Cost** | ~500 tokens per hint | ~2000-5000 tokens per hint |
| **Reliability** | Deterministic | Agent might go in circles or leak the solution |
| **Control** | We decide what context LLM sees | Agent decides — might run the answer query |

For "give me a hint on question 3" — a single prompt is the right tool. Agents add value when the workflow can't be predicted in advance.

## When agents provide real value

Agents shine when **you can't predict the workflow in advance**:

| Use case | Why agentic helps |
|---|---|
| **Open-ended data analysis** | "Explore this dataset and find patterns" |
| **Multi-system debugging** | "Why is the app slow?" — checks logs, metrics, DB |
| **Code migration** | Reads, plans, writes, tests in a loop |
| **Customer support** | Checks order DB, shipping API, refund policy |
| **Research** | Search, read, cross-reference papers |

Common thread: the number of steps and which tools to use depends on what the agent discovers along the way.

## Tech stack

| Layer | Choice |
|-------|--------|
| **LLM** | Claude API with tool use (or OpenAI function calling) |
| **Agent backend** | FastAPI (Python) — required by assignment |
| **Frontend** | React + Vite — required by assignment |
| **Streaming** | SSE from FastAPI to show agent steps in real-time |
| **Tool execution** | Python functions decorated as tools |

## Agent loop implementation (Claude API)

```python
import anthropic

client = anthropic.Anthropic()

tools = [
    {
        "name": "read_file",
        "description": "Read a source file from the codebase",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path to read"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "write_file",
        "description": "Write a migrated file to the target directory",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"}
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "execute_command",
        "description": "Run a shell command (e.g., pytest, pip install)",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string"}
            },
            "required": ["command"]
        }
    },
    # ... list_files, search_code
]

TOOL_FUNCTIONS = {
    "read_file": lambda path: open(path).read(),
    "write_file": lambda path, content: open(path, 'w').write(content),
    "execute_command": lambda command: subprocess.run(command, capture_output=True, text=True, shell=True),
    # ...
}

async def run_agent(goal: str):
    messages = [{"role": "user", "content": goal}]
    system = "You are a code migration agent. Read source files, understand the architecture, write equivalent code in the target framework, and verify with tests."

    while True:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=system,
            tools=tools,
            messages=messages,
        )

        # Yield each step to frontend via SSE
        yield {"type": "thinking", "content": response.content}

        if response.stop_reason == "end_turn":
            final = [b.text for b in response.content if b.type == "text"]
            yield {"type": "answer", "text": "\n".join(final)}
            break

        if response.stop_reason == "tool_use":
            tool_block = next(b for b in response.content if b.type == "tool_use")
            yield {"type": "tool_call", "tool": tool_block.name, "input": tool_block.input}

            result = TOOL_FUNCTIONS[tool_block.name](**tool_block.input)
            yield {"type": "tool_result", "tool": tool_block.name, "result": str(result)}

            messages.append({"role": "assistant", "content": response.content})
            messages.append({
                "role": "user",
                "content": [{"type": "tool_result", "tool_use_id": tool_block.id, "content": str(result)}]
            })
```

## FastAPI endpoint

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()

@app.post("/agent")
async def agent_endpoint(request: dict):
    goal = request["goal"]

    async def stream():
        async for step in run_agent(goal):
            yield f"data: {json.dumps(step)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
```
