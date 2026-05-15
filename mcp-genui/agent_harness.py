"""Agent harness — Gemini + MCP client with ReACT reasoning + Generative UI.

Same architecture as v2 but with:
  - GenerativeUI tools available (generate_prefab_ui, search_prefab_components)
  - System prompt instructs LLM to write Prefab Python code for visualizations
  - LLM can choose between fixed tool results and custom generative layouts

Flow:
  1. Connect to MCP server → discover tools (including generate_prefab_ui)
  2. Convert MCP tool schemas → Gemini functionDeclarations
  3. Send prompt + history to Gemini
  4. Gemini returns TEXT (reasoning) + functionCall(s)
  5. For generate_prefab_ui calls: Pyodide renders the code in browser
  6. For regular tools: standard MCP execution
  7. Repeat until text answer or max steps
"""

import argparse
import asyncio
import json
import os
import sys
import time

import httpx
from fastmcp import Client

from config import (
    GEMINI_API_KEY, GEMINI_MODEL, GEMINI_BASE_URL,
    MAX_STEPS, CALL_DELAY_SECONDS, MAX_OUTPUT_TOKENS,
)

# Import MCP server instance for in-memory client connection
from mcp_server import mcp as mcp_server

# Tools the agent should NOT send to Gemini (UI-only, not for LLM)
EXCLUDED_TOOLS = {"render_dashboard"}

# ── System Prompt (v2 ReACT + Generative UI) ──────────────────────────
SYSTEM_PROMPT = """You are a Question Authoring Agent for a SQL practice platform (DuckDB, PostgreSQL-compatible).

═══════════════════════════════════════════════════════════
WORKFLOW
═══════════════════════════════════════════════════════════

Execute these steps autonomously. Do not pause for confirmation — the admin reviews the final preview.

1. get_coverage_gaps → identify SQL concepts with zero questions
2. list_existing_questions → get next order_index and used_table_names
3. Generate a complete question targeting the requested concept
4. validate_question → verify SQL correctness and distinguishability
5. If validation fails → fix and re-validate
6. check_concept_overlap → show if concepts are already covered
7. Present the question as a VISUAL PREVIEW (5 cards via generate_prefab_ui)
8. Do NOT call insert_question — the admin clicks the Approve button

Visualize EVERY tool result with generate_prefab_ui immediately after receiving it.

═══════════════════════════════════════════════════════════
SQL QUESTION RULES
═══════════════════════════════════════════════════════════

- PostgreSQL-compatible SQL only (DuckDB)
- Do NOT reuse table names from used_table_names — pick unique names
- Realistic data: real-sounding names, reasonable numbers, 8-15 rows
- sql_solution_explanation: array of strings, each explaining one query part
- Difficulty: beginner (SELECT/WHERE), intermediate (JOIN/GROUP BY/HAVING), advanced (window/subqueries/CTEs)
- Category: main SQL concept tested
- Solution must be distinguishable from SELECT *
- Multi-table: ALWAYS declare FOREIGN KEY REFERENCES explicitly
  Example: "merchant_id INTEGER REFERENCES merchants(merchant_id)"

ER Diagrams (2+ tables only):
- Raw Mermaid starting with "erDiagram" — no markdown fences
- Simple types WITHOUT parentheses: VARCHAR not VARCHAR(100)
- Single-table questions: er_diagram = null

═══════════════════════════════════════════════════════════
REASONING FRAMEWORK
═══════════════════════════════════════════════════════════

Before EVERY tool call, emit these labels as plain text:

[THINK] What do I know? What do I need? Why this tool? (2-3 sentences)
[REASON_TYPE] One of: concept_selection | schema_design | data_generation | query_logic | verification | error_recovery | visualization
[ACT] Which tool and why.

After EVERY tool result:
[VERIFY] Does the result make sense? Any issues? For validate_question: confirm schema_valid, solution_valid, distinguishable.

Before calling validate_question:
[VERIFY] Mentally check: Does the SQL parse? Are table names unique? Are FKs declared?

On failure:
[FALLBACK] What went wrong and recovery plan. Then retry.

Emit reasoning text FIRST, then the functionCall in the SAME response.

═══════════════════════════════════════════════════════════
UI RENDERING — generate_prefab_ui
═══════════════════════════════════════════════════════════

You render ALL output via generate_prefab_ui. No raw JSON or plain text output.

Available components: Column, Row, Card, CardHeader, CardContent, CardFooter,
Badge, Code, Mermaid, P, H3, H4, Metric,
Table, TableHeader, TableBody, TableRow, TableHead, TableCell.

Per-tool-result rendering:
  get_coverage_gaps     → Metric(total) + Table(category, difficulty, concept)
  list_existing_questions → Table(id, order_index, category, difficulty, question)
  validate_question     → P with checkmarks (✓ Schema Valid, ✓ Solution Valid, etc.)
  check_concept_overlap → P with bullets (• concept: status)

──── FINAL PREVIEW (5 cards) ────

The browser uses the `data` parameter for the Approve/Insert button.
You MUST pass question fields in `data` — the code references them as variables.

Card 1 — Header:
  data={"difficulty": "intermediate", "category": "Joins", "sql_question": "Retrieve all...", "order_index": 12}
  code: Badge(difficulty), Badge(category), P(sql_question)

Card 2 — Schema:
  data={"sql_data": "CREATE TABLE...INSERT INTO..."}
  code: Code(sql_data)

Card 3 — Solution:
  data={"sql_solution": "SELECT...", "sql_solution_explanation": ["step1", "step2"]}
  code: Code(sql_solution) + P per explanation step

Card 4 — ER Diagram (if 2+ tables):
  data={"er_diagram": "erDiagram\\n..."}
  code: Mermaid(er_diagram)

Card 5 — Concepts:
  data={"concepts": ["LEFT JOIN"]}
  code: Badge per concept

Example — data-driven card:
```python
# data={"sql_data": "CREATE TABLE..."} passed in data parameter
from prefab_ui.components import Column, Card, CardContent, H4, Code
from prefab_ui.app import PrefabApp

with PrefabApp() as app:
    with Column(gap=3):
        H4("Schema")
        with Card():
            with CardContent():
                Code(sql_data)  # variable from data, NOT hardcoded
```

═══════════════════════════════════════════════════════════
COMMON ERRORS — avoid these
═══════════════════════════════════════════════════════════

1. Container components need context managers:
   WRONG: Card(CardContent(P("text")))           → _pg_comp_init error
   RIGHT: with Card():
              with CardContent():
                  P("text")

2. Table rows need context managers:
   WRONG: TableRow(TableCell("a"), TableCell("b"))  → _pg_comp_init error
   RIGHT: with TableRow():
              TableCell("a")
              TableCell("b")

3. Text components take a SINGLE positional string:
   WRONG: Badge(text="intermediate")    → renders as blank black dot
   WRONG: P(content="some text")        → renders as empty
   RIGHT: Badge("intermediate")
   RIGHT: P("some text")

4. Metric and TableCell require strings:
   WRONG: Metric(label="Count", value=27)     → type error
   RIGHT: Metric(label="Count", value=str(27))
   WRONG: TableCell(42)
   RIGHT: TableCell(str(42))

5. Data variables are top-level — NOT dict access:
   WRONG: data["sql_data"]    → NameError: 'data' not defined
   RIGHT: sql_data            → injected from data parameter

6. Hardcoded values in preview cards:
   WRONG: Code("CREATE TABLE customers...")   → Approve button gets empty data
   RIGHT: Code(sql_data)                      → data={"sql_data": "CREATE TABLE..."}

7. Large payloads cause MALFORMED_FUNCTION_CALL:
   WRONG: One call with all 5 sections         → serialization error
   RIGHT: Five separate calls, one per section → small focused payloads

Do NOT use: Tabs, reactive state (app.state, Rx, SetState).
Keep each call under 25 lines and focused on ONE section.
If a call fails, retry with a smaller payload — never fall back to text."""


# ── MCP → Gemini schema conversion ──────────────────────────────────

def _clean_schema(obj):
    """Recursively strip fields Gemini doesn't understand from JSON schemas."""
    if not isinstance(obj, dict):
        return obj
    # Remove unsupported keys at every level
    for key in ("$defs", "title", "additionalProperties", "default"):
        obj.pop(key, None)
    # Replace anyOf/oneOf with the first non-null type (Gemini doesn't support union types)
    for union_key in ("anyOf", "oneOf"):
        if union_key in obj:
            alternatives = obj.pop(union_key)
            non_null = [a for a in alternatives if not (isinstance(a, dict) and a.get("type") == "null")]
            if non_null:
                obj.update(_clean_schema(non_null[0]))
            else:
                obj["type"] = "string"  # fallback
    # Recurse into nested schemas
    for key, val in list(obj.items()):
        if isinstance(val, dict):
            obj[key] = _clean_schema(val)
        elif isinstance(val, list):
            obj[key] = [_clean_schema(item) if isinstance(item, dict) else item for item in val]
    return obj


def mcp_tools_to_gemini(tools) -> list[dict]:
    """Convert MCP tool schemas to Gemini functionDeclarations format."""
    decls = []
    for tool in tools:
        if tool.name in EXCLUDED_TOOLS:
            continue
        schema = dict(tool.inputSchema) if tool.inputSchema else {"type": "object", "properties": {}}
        schema = _clean_schema(schema)
        decls.append({
            "name": tool.name,
            "description": tool.description or "",
            "parameters": schema,
        })
    return decls


# ── MCP result extraction ───────────────────────────────────────────

def extract_text_result(result) -> dict:
    """Extract JSON dict from MCP CallToolResult text content."""
    if result.is_error:
        texts = [c.text for c in (result.content or []) if hasattr(c, "text")]
        return {"error": " ".join(texts) or "Unknown tool error"}
    for block in (result.content or []):
        if hasattr(block, "text") and block.text:
            try:
                return json.loads(block.text)
            except json.JSONDecodeError:
                return {"result": block.text}
    return {"error": "No content returned"}


# ── Gemini API call ─────────────────────────────────────────────────

def call_gemini(messages: list, api_key: str, model: str, tool_declarations: list) -> dict:
    """Make a single Gemini API call with dynamically-discovered tool declarations."""
    url = f"{GEMINI_BASE_URL}/{model}:generateContent?key={api_key}"
    body = {
        "contents": messages,
        "tools": [{"functionDeclarations": tool_declarations}],
        "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}},
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
            "thinkingConfig": {"thinkingBudget": 1024},
        },
    }
    resp = httpx.post(url, json=body, timeout=60)
    if resp.status_code != 200:
        raise Exception(f"Gemini API {resp.status_code}: {resp.text[:300]}")
    return resp.json()


# ── Agent loop ─────────────────────────────────────────────────────

async def run_agent(prompt: str, api_key: str = None, model: str = None):
    """Run the full agent loop with ReACT reasoning + generative UI.

    Yields step dicts for SSE streaming:
    {
        "type": "tool_call" | "tool_result" | "answer" | "error" | "system" | "reasoning",
        ...
    }
    """
    api_key = api_key or GEMINI_API_KEY
    model = model or GEMINI_MODEL

    if not api_key:
        yield {"type": "error", "content": "GEMINI_API_KEY not configured"}
        return

    print("=" * 62)
    print(f"[AGENT genui] Starting — prompt: \"{prompt}\"")
    print(f"[AGENT genui] Model: {model} | Max steps: {MAX_STEPS}")
    print("=" * 62)

    print("\n[MCP] Connecting to MCP server (in-memory transport)...")

    async with Client(mcp_server) as client:
        print(f"[MCP] Session initialized — server: \"{mcp_server.name}\"")

        # ── Dynamic Tool Discovery ──
        tools = await client.list_tools()
        print(f"[MCP] list_tools() → {len(tools)} tools discovered:")
        for t in tools:
            excluded_tag = "  ← excluded (UI-only)" if t.name in EXCLUDED_TOOLS else ""
            print(f"  │ {t.name}{excluded_tag}")

        tool_declarations = mcp_tools_to_gemini(tools)
        print(f"[MCP] → Gemini: {len(tool_declarations)} functionDeclarations prepared")

        yield {"type": "system", "content": f"MCP connected — {len(tool_declarations)} tools (includes generate_prefab_ui)"}

        messages = [{"role": "user", "parts": [{"text": SYSTEM_PROMPT + "\n\nAdmin request: " + prompt}]}]
        step_count = 0
        tool_calls_made = 0
        tools_used = set()
        malformed_retries = 0

        while step_count < MAX_STEPS:
            step_count += 1

            if step_count > 1:
                yield {"type": "system", "content": f"Waiting {CALL_DELAY_SECONDS}s before next Gemini call..."}
                await asyncio.sleep(CALL_DELAY_SECONDS)

            print(f"\n{'─' * 10} Step {step_count} {'─' * 10}")
            print(f"[LLM] Request #{step_count} → Gemini ({len(messages)} messages)")

            start = time.time()
            try:
                data = call_gemini(messages, api_key, model, tool_declarations)
            except Exception as e:
                latency = int((time.time() - start) * 1000)
                print(f"[LLM] ERROR ← {e} ({latency}ms)")
                yield {"type": "error", "content": f"Gemini call failed: {e}", "latencyMs": latency}
                break

            latency_ms = int((time.time() - start) * 1000)

            candidates = data.get("candidates", [])
            if not candidates or not candidates[0].get("content", {}).get("parts"):
                finish = candidates[0].get("finishReason", "unknown") if candidates else "no candidates"
                # STOP with empty parts = Gemini is done (not an error)
                if finish == "STOP":
                    print(f"[LLM] Gemini finished (STOP with no parts) — treating as completion")
                    yield {"type": "system", "content": "Agent finished."}
                    break
                print(f"[LLM] Empty response (finishReason: {finish})")
                # Log raw response and context for debugging MALFORMED calls
                raw_candidate = candidates[0] if candidates else {}
                print(f"[LLM] FAILED raw candidate: {json.dumps(raw_candidate, default=str)[:1000]}")
                # Log the last model+user message that triggered this failure
                last_model = next((m for m in reversed(messages) if m.get("role") == "model"), None)
                if last_model:
                    last_parts_summary = []
                    for p in last_model.get("parts", []):
                        if "functionCall" in p:
                            fc = p["functionCall"]
                            args_str = json.dumps(fc.get("args", {}), default=str)
                            last_parts_summary.append(f"functionCall:{fc['name']}(args={len(args_str)} chars)")
                        elif "functionResponse" in p:
                            fr = p["functionResponse"]
                            last_parts_summary.append(f"functionResponse:{fr.get('name','?')}")
                        elif "text" in p:
                            last_parts_summary.append(f"text({len(p['text'])} chars)")
                    print(f"[LLM] FAILED prev context: {'; '.join(last_parts_summary)}")
                if finish == "MALFORMED_FUNCTION_CALL" and malformed_retries < 2:
                    malformed_retries += 1
                    print(f"[LLM] MALFORMED_FUNCTION_CALL retry #{malformed_retries} — asking for smaller calls")
                    yield {"type": "system", "content": f"Serialization error — retrying with smaller payload (attempt {malformed_retries})"}
                    messages.append({"role": "model", "parts": [{"text": "I encountered a serialization error with my function call."}]})
                    messages.append({"role": "user", "parts": [{"text": "Your last generate_prefab_ui call failed because the payload was too large. Split it into SMALLER calls — one section per call. Do NOT output plain text or JSON — you MUST use generate_prefab_ui with a smaller payload."}]})
                    continue
                yield {"type": "error", "content": f"Empty Gemini response ({finish})", "latencyMs": latency_ms}
                break

            parts = candidates[0]["content"]["parts"]
            usage = data.get("usageMetadata", {})
            print(f"[LLM] Response ← {latency_ms}ms | tokens: in={usage.get('promptTokenCount', '?')} out={usage.get('candidatesTokenCount', '?')}")
            if malformed_retries > 0 and any("functionCall" in p for p in parts):
                # Log the successful call after a MALFORMED retry for comparison
                for p in parts:
                    if "functionCall" in p:
                        fc = p["functionCall"]
                        args_str = json.dumps(fc.get("args", {}), default=str)
                        print(f"[LLM] RETRY SUCCESS: {fc['name']}(args={len(args_str)} chars): {args_str}")

            messages.append({"role": "model", "parts": parts})

            tool_calls = [p for p in parts if "functionCall" in p]
            text_part = next((p for p in parts if p.get("text", "").strip()), None)

            # Emit reasoning text BEFORE tool calls
            if text_part and tool_calls:
                reasoning_text = text_part["text"].strip()
                if reasoning_text:
                    print(f"[LLM] REASONING ({len(reasoning_text)} chars):\n{reasoning_text}")
                    yield {
                        "type": "reasoning",
                        "content": reasoning_text,
                        "latencyMs": latency_ms,
                    }

            if tool_calls:
                if len(tool_calls) > 1:
                    print(f"[LLM] ({len(tool_calls)} parallel tool calls)")

                function_responses = []

                for tc in tool_calls:
                    fc = tc["functionCall"]
                    name = fc["name"]
                    args = fc.get("args", {})
                    tool_calls_made += 1
                    tools_used.add(name)

                    if tc.get("thoughtSignature"):
                        print(f"[LLM] Thought signature: {name} ({len(tc['thoughtSignature'])} chars)")

                    print(f"[LLM] functionCall: {name}({json.dumps(args)})")

                    yield {
                        "type": "tool_call",
                        "tool": name,
                        "input": args,
                        "latencyMs": latency_ms,
                    }

                    mcp_start = time.time()
                    print(f"\n[MCP] call_tool(\"{name}\", {json.dumps(args)})")
                    try:
                        mcp_result = await client.call_tool(name, args)
                        tool_result = extract_text_result(mcp_result)
                        mcp_ms = int((time.time() - mcp_start) * 1000)
                        has_structured = mcp_result.structured_content is not None
                        text_bytes = len(json.dumps(tool_result))
                        print(f"[MCP] ← {mcp_ms}ms | text: {text_bytes} bytes | structuredContent: {'yes' if has_structured else 'no'}")
                        print(f"[MCP] Result: {json.dumps(tool_result)}")
                    except Exception as e:
                        mcp_ms = int((time.time() - mcp_start) * 1000)
                        tool_result = {"error": str(e)}
                        print(f"[MCP] ERROR ← {e} ({mcp_ms}ms)")

                    yield {
                        "type": "tool_result",
                        "tool": name,
                        "result": tool_result,
                        "input": args,
                    }

                    function_responses.append({
                        "functionResponse": {
                            "name": name,
                            "response": tool_result,
                        }
                    })

                messages.append({"role": "user", "parts": function_responses})
                continue

            if text_part:
                text = text_part["text"]
                print(f"[LLM] TEXT ({len(text)} chars):\n{text}")

                if tool_calls_made == 0 and step_count < MAX_STEPS:
                    print("[LLM] Nudging — no tools used yet")
                    yield {"type": "system", "content": "Retrying -- agent skipped tools"}
                    messages.append({
                        "role": "user",
                        "parts": [{"text": "You MUST use the available tools before responding. Start by calling get_coverage_gaps, then list_existing_questions."}],
                    })
                    continue

                yield {
                    "type": "answer",
                    "content": text,
                    "latencyMs": latency_ms,
                }
                break

            print(f"[LLM] Unexpected: {[list(p.keys()) for p in parts]}")
            yield {"type": "error", "content": "Unexpected Gemini response", "latencyMs": latency_ms}
            break

        if step_count >= MAX_STEPS:
            yield {"type": "error", "content": "Agent reached maximum step limit"}

        available_names = {t.name for t in tools} - EXCLUDED_TOOLS
        unused = available_names - tools_used
        print(f"\n{'=' * 62}")
        print(f"[AGENT genui] Complete: {step_count} steps, {tool_calls_made} tool calls")
        print(f"[AGENT genui] Tools used:      {', '.join(sorted(tools_used)) or '(none)'}")
        if unused:
            print(f"[AGENT genui] Tools available:  {', '.join(sorted(unused))} (not needed)")
        print(f"{'=' * 62}")


async def main():
    parser = argparse.ArgumentParser(description="MCP Question Authoring Agent — Generative UI")
    parser.add_argument("--prompt", default="Add a question about DENSE_RANK() window function")
    parser.add_argument("--model", default=None)
    parser.add_argument("--key", default=None)
    args = parser.parse_args()

    api_key = args.key or GEMINI_API_KEY
    model = args.model or GEMINI_MODEL

    print(f"\nAgent genui: model={model}, prompt={args.prompt}\n")

    async for step in run_agent(args.prompt, api_key, model):
        step_type = step.get("type", "")
        if step_type == "reasoning":
            print(f"\n{'~'*60}")
            print(f"REASONING:\n{step['content']}")
            print(f"{'~'*60}\n")
        elif step_type == "answer":
            print(f"\n{'='*60}")
            print("FINAL ANSWER:")
            print(step["content"])
            print(f"{'='*60}\n")
        elif step_type == "error":
            print(f"\nERROR: {step['content']}\n")
        elif step_type == "system":
            print(f"   [{step['content']}]")


if __name__ == "__main__":
    asyncio.run(main())
