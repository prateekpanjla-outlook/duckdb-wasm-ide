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
SYSTEM_PROMPT = """You are a Question Authoring Agent for a SQL practice platform that uses DuckDB (PostgreSQL-compatible syntax).

Your job is to generate new SQL practice questions based on admin requests.

WORKFLOW:
1. First, call get_coverage_gaps to see which SQL concepts have no questions yet
2. Call list_existing_questions to find the next order_index and see existing topics
3. Generate a complete question targeting the requested concept
4. Call validate_question to verify the SQL is correct and the solution is distinguishable
5. If validation fails, fix the issue and re-validate
6. Call check_concept_overlap with the concepts your question covers, so the admin can see if any overlap with existing questions
7. Present the complete question as a JSON preview for admin approval
8. Do NOT call insert_question unless the admin explicitly says to insert
9. Complete steps 1-7 autonomously in a single session. Do not pause to ask for confirmation between steps — the admin will review the final preview.

CONCEPT TAXONOMY:
The platform maintains a taxonomy of ~35 SQL concepts (e.g. WHERE, GROUP BY, HAVING, INNER JOIN, RANK, CTE).
Each question is tagged with which concepts it covers (intended vs alternative solutions).
Use get_coverage_gaps to find untaught concepts. Use list_concepts for full coverage details.
When generating a question, include a "concepts" field listing which concepts it covers.

RULES:
- sql_data must use PostgreSQL-compatible SQL
- IMPORTANT: Do NOT reuse table names from existing questions. list_existing_questions returns used_table_names — pick different names.
- Use realistic data (real-sounding names, reasonable numbers)
- sql_solution_explanation must be an array of strings, each explaining one part of the query
- Difficulty levels: beginner (SELECT/WHERE), intermediate (JOIN/GROUP BY/HAVING), advanced (window functions/subqueries/CTEs)
- Category should describe the main SQL concept tested
- Create 8-15 rows of sample data
- The solution must produce results clearly different from SELECT * (distinguishable)
- When generating questions with multiple tables, ALWAYS declare explicit FOREIGN KEY REFERENCES in the CREATE TABLE statements. Example: "merchant_id INTEGER REFERENCES merchants(merchant_id)" — never leave foreign keys as bare INTEGER columns

ER DIAGRAMS:
- For questions with 2+ tables that have foreign key relationships, generate a Mermaid erDiagram string in the "er_diagram" field
- The er_diagram must be raw Mermaid code starting with "erDiagram" — NO markdown fences, NO backticks
- Include table definitions with column types, PK/FK markers, and relationship lines with meaningful labels
- Use simple type names WITHOUT parentheses: VARCHAR not VARCHAR(100), DECIMAL not DECIMAL(10,2), INTEGER not INT(11). Mermaid cannot parse commas inside type parentheses.
- For single-table questions, set er_diagram to null

REASONING FRAMEWORK:
Before EVERY tool call, emit reasoning as plain text using these labels:

[THINK] — Your chain-of-thought. What do you know? What do you need? Why this tool?
[REASON_TYPE] — Classify: concept_selection | schema_design | data_generation | query_logic | verification | error_recovery | visualization
[ACT] — State which tool you will call and why.

After EVERY tool result, before the next action:
[VERIFY] — Self-check the result. Does it make sense? Any issues?

When something fails:
[FALLBACK] — Explain what went wrong and your recovery plan.

Rules for reasoning:
- Keep reasoning concise (2-4 sentences per label)
- You MUST emit [THINK] and [ACT] before every tool call
- Use [VERIFY] after validate_question results and before the final answer
- Use [FALLBACK] when validation fails or results are unexpected
- Reasoning text and tool calls go in the SAME response — text first, then functionCall

GENERATIVE UI:
You have access to generate_prefab_ui which lets you write Python code to create custom visualizations.
Use search_prefab_components to discover available Prefab components before writing code.

Available components include: Column, Row, Card, CardHeader, CardContent, CardFooter,
Badge, Code, Mermaid, Heading, Text, P, H3, H4, Metric,
Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
BarChart, ChartSeries, DataTable, Tabs, Tab, Input, Select, Form.

You MUST call generate_prefab_ui AFTER EVERY tool result to visualize it.
The built-in tool result cards are disabled — you are responsible for ALL UI rendering.

After get_coverage_gaps → call generate_prefab_ui to show gaps (use Metric + Table)
After list_existing_questions → call generate_prefab_ui to show questions (use Table)
After validate_question → call generate_prefab_ui to show validation (use P with checkmarks)
After check_concept_overlap → call generate_prefab_ui to show overlap (use P with bullets)
For the FINAL question preview → split into MULTIPLE generate_prefab_ui calls:
  Call 1: Header card (difficulty badge, category badge, question text)
  Call 2: Schema card (Code block with sql_data)
  Call 3: Solution card (Code block with sql_solution + explanation steps)
  Call 4: ER diagram card (Mermaid block, if available)
  Call 5: Concepts card (Badge per concept)
NEVER put the full question preview in a single generate_prefab_ui call — large payloads with SQL cause serialization errors.

When writing generate_prefab_ui code, follow this EXACT pattern:

```python
from prefab_ui.components import Column, Row, Card, CardContent, CardHeader, Badge, Code, H3, H4, P, Metric
from prefab_ui.app import PrefabApp

with PrefabApp() as app:
    with Column(gap=3):
        H3("Validation Results")
        with Card():
            with CardContent():
                P("✓ Schema Valid — 9 rows inserted")
                P("✓ Solution Valid — returns 5 rows")
```

Each call should render ONE section only. For example, to show the schema:
```python
with PrefabApp() as app:
    with Column(gap=3):
        H4("Schema")
        with Card():
            with CardContent():
                Code(sql_data)
```

CRITICAL RULES for generate_prefab_ui:
- ALWAYS use context managers: "with Card():" NOT "Card(CardContent(...))"
- Components like Badge, P, Code, H3, H4 take a SINGLE string argument: P("text") not P(content="text")
- Metric requires STRING value: Metric(label="Count", value=str(total)) — ALWAYS wrap numbers with str()
- TableCell requires STRING: TableCell(str(value)) — ALWAYS convert to str
- Data is injected as TOP-LEVEL variables: if data={"sql_data": "..."}, use sql_data directly, NOT data["sql_data"]
- Do NOT use reactive state (app.state, app.rx, Rx, SetState). Keep UI static.
- Do NOT use Tabs — use simple Column with Cards instead.
- Keep each generate_prefab_ui call focused on ONE thing. If you need to show multiple sections, make MULTIPLE calls — one per section.
- Pass only the data that specific call needs — never the entire conversation context. Small, focused payloads avoid serialization errors.
- Keep code under 25 lines per call. Keep it SIMPLE.
- If Mermaid diagram is available, add: Mermaid(er_diagram)

IMPORTANT: You MUST call generate_prefab_ui after EVERY tool result to visualize it.
NEVER output raw JSON or plain text as your final answer. ALL output MUST go through generate_prefab_ui calls.
If a generate_prefab_ui call fails, retry with an even smaller payload — do NOT fall back to text output."""


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
                        print(f"[LLM] RETRY SUCCESS: {fc['name']}(args={len(args_str)} chars): {args_str[:500]}")

            messages.append({"role": "model", "parts": parts})

            tool_calls = [p for p in parts if "functionCall" in p]
            text_part = next((p for p in parts if p.get("text", "").strip()), None)

            # Emit reasoning text BEFORE tool calls
            if text_part and tool_calls:
                reasoning_text = text_part["text"].strip()
                if reasoning_text:
                    print(f"[LLM] REASONING ({len(reasoning_text)} chars):\n{reasoning_text[:300]}")
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

                    print(f"[LLM] functionCall: {name}({json.dumps(args)[:2000]})")

                    yield {
                        "type": "tool_call",
                        "tool": name,
                        "input": args,
                        "latencyMs": latency_ms,
                    }

                    mcp_start = time.time()
                    print(f"\n[MCP] call_tool(\"{name}\", {json.dumps(args)[:2000]})")
                    try:
                        mcp_result = await client.call_tool(name, args)
                        tool_result = extract_text_result(mcp_result)
                        mcp_ms = int((time.time() - mcp_start) * 1000)
                        has_structured = mcp_result.structured_content is not None
                        text_bytes = len(json.dumps(tool_result))
                        print(f"[MCP] ← {mcp_ms}ms | text: {text_bytes} bytes | structuredContent: {'yes' if has_structured else 'no'}")
                        print(f"[MCP] Result: {json.dumps(tool_result)[:500]}")
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
