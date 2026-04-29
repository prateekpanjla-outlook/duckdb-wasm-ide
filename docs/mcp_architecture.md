# MCP Agent Architecture — Diagrams

## Architecture

```mermaid
graph TB
    subgraph Browser["Browser (localhost:8080)"]
        PrefabUI["Prefab UI Renderer<br/>(coverage table, validation results,<br/>question preview, approve/reject)"]
    end

    subgraph AgentHarness["Agent Harness (Python)"]
        Gemini["Gemini 2.5 Flash<br/>(LLM reasoning)"]
        MCPClient["MCP Client<br/>(tool discovery + dispatch)"]
        AgentLoop["Agent Loop<br/>(prompt → LLM → tool → LLM → ...)"]
    end

    subgraph MCPServer["FastMCP Server (Python)"]
        direction TB
        T1["get_coverage_gaps()"]
        T2["list_existing_questions()"]
        T3["validate_question()"]
        T4["check_concept_overlap()"]
        T5["list_concepts()"]
        T6["execute_sql()"]
        T7["insert_question()"]
        T8["generate_test()"]
        T9["search_web() — NEW"]
        T10["manage_file() — NEW"]
    end

    subgraph CloudRun["Cloud Run (existing, unchanged)"]
        Express["Express API"]
        PG["PostgreSQL"]
    end

    subgraph External["External"]
        StackOverflow["StackOverflow API"]
        LocalFile["Local JSON file"]
    end

    PrefabUI <-->|"postMessage<br/>(AppBridge)"| AgentLoop
    AgentLoop --> Gemini
    Gemini --> AgentLoop
    AgentLoop --> MCPClient
    MCPClient <-->|"MCP JSON-RPC<br/>(stdio)"| MCPServer
    T1 & T2 & T3 & T4 & T5 & T6 & T7 & T8 -->|HTTP proxy| Express
    Express --> PG
    T9 --> StackOverflow
    T10 --> LocalFile
```

## Sequence Diagram — Full Question Authoring Flow

```mermaid
sequenceDiagram
    participant Admin as Admin (Browser)
    participant UI as Prefab UI
    participant Agent as Agent Harness
    participant LLM as Gemini 2.5 Flash
    participant MCP as FastMCP Server
    participant API as Cloud Run Express
    participant DB as PostgreSQL
    participant Web as StackOverflow API
    participant File as Local JSON File

    Admin->>Agent: "Add a question about DENSE_RANK"

    Note over Agent,LLM: Agent Loop — Step 1
    Agent->>LLM: prompt + tool declarations
    LLM-->>Agent: functionCall: search_web("DENSE_RANK")
    Agent->>MCP: tools/call search_web
    MCP->>Web: GET /search?q=DENSE_RANK+SQL
    Web-->>MCP: 5 results
    MCP-->>Agent: JSON + Prefab UI (search results card)
    Agent-->>UI: Render search results
    UI-->>Admin: Shows search results in browser
    Agent->>LLM: functionResponse(results)

    Note over Agent,LLM: Agent Loop — Step 2
    LLM-->>Agent: functionCall: manage_file("create", notes)
    Agent->>MCP: tools/call manage_file
    MCP->>File: Write questions_draft.json
    MCP-->>Agent: JSON + Prefab UI (file saved confirmation)
    Agent-->>UI: Render file confirmation
    Agent->>LLM: functionResponse(saved)

    Note over Agent,LLM: Agent Loop — Step 3
    LLM-->>Agent: functionCall: get_coverage_gaps()
    Agent->>MCP: tools/call get_coverage_gaps
    MCP->>API: GET /api/admin/coverage-gaps
    API->>DB: SELECT uncovered concepts
    DB-->>API: 26 gaps
    API-->>MCP: JSON
    MCP-->>Agent: JSON + Prefab UI (gaps table)
    Agent-->>UI: Render coverage gaps table
    Agent->>LLM: functionResponse(gaps)

    Note over Agent,LLM: Agent Loop — Step 4
    LLM-->>Agent: functionCall: validate_question(sql)
    Agent->>MCP: tools/call validate_question
    MCP->>API: POST /api/admin/validate
    API->>DB: BEGIN, CREATE, INSERT, SELECT, ROLLBACK
    API-->>MCP: validation result
    MCP-->>Agent: JSON + Prefab UI (validation checklist)
    Agent-->>UI: Render validation results
    Agent->>LLM: functionResponse(valid)

    Note over Agent,LLM: Agent Loop — Step 5
    LLM-->>Agent: text response (final question JSON)
    Agent-->>UI: Render question preview + Approve/Reject buttons

    Admin->>UI: Click "Approve & Insert"
    UI->>Agent: Button action
    Agent->>MCP: tools/call insert_question
    MCP->>API: POST /api/admin/agent/approve
    API->>DB: INSERT INTO questions + question_concepts
    API-->>MCP: question id=11
    MCP-->>Agent: JSON + Prefab UI (success card)
    Agent-->>UI: Render success confirmation
    UI-->>Admin: "Question #11 inserted"
```

## Key Design Decisions

1. **Dual output per tool**: Each MCP tool returns JSON (for Gemini to reason with) + Prefab UI (for the admin to see). FastMCP handles this via `structuredContent`.

2. **Existing app unchanged**: Cloud Run Express API stays the same. The Python MCP server is a new layer that proxies HTTP calls to the existing endpoints.

3. **Agent harness is custom Python**: Not Claude Desktop. A Python script that runs the Gemini → MCP tool → Gemini loop, similar to the existing `agent.js` but using MCP protocol instead of direct function calls.

4. **Prefab renders in browser**: Via `fastmcp dev apps` at localhost:8080. Each tool call updates the UI in real-time as the agent works through its steps.

5. **Two new tools for the assignment**: `search_web` (internet requirement) and `manage_file` (local file CRUD requirement). The other 8 are existing tools wrapped with Prefab UI.
