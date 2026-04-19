# SQL Practice Project — Sequence Diagrams

## 1. App Startup & Login Flow

```mermaid
sequenceDiagram
    participant U as User/Browser
    participant HTML as index.html
    participant App as App (app.js)
    participant Auth as AuthManager
    participant API as APIClient
    participant BE as Express Backend
    participant DB as Cloud SQL
    participant DM as DuckDBManager

    U->>HTML: Page load
    HTML->>App: DOMContentLoaded → new App()
    App->>App: init() — window.app = this, setupEventListeners
    App->>Auth: new AuthManager()
    App->>App: Read localStorage: auth_token, user_data

    alt Has saved token
        App->>Auth: updateUIForLoggedInUser(user)
        App->>App: showQuestionSelector()
        Note over App: DuckDB init is non-blocking —<br/>question selector works without it
        App->>DM: initializeDuckDB() (async, not awaited)
        DM-->>App: DuckDB connected (later)
        App->>App: new PracticeManager(dbManager)
        App->>App: loadDefaultPracticeData()
        App->>App: restoreSession() — best-effort
    else No token
        App->>App: showLoginPrompt()
        Note over App: App wires #loginPromptBtn click → authManager.openModal()
        U->>App: Click #loginPromptBtn
        App->>Auth: openModal()
        U->>Auth: Enter email + password, submit
        Auth->>API: login(email, password)
        API->>BE: POST /api/auth/login
        BE->>DB: SELECT user, verify bcrypt
        DB-->>BE: user row
        BE-->>API: { token, user }
        API->>API: Store token + user in localStorage
        Auth->>Auth: closeModal(), updateUIForLoggedInUser
        Auth->>App: await window.app.initializeDuckDB()
        Auth->>Auth: new PracticeManager(window.app.dbManager)
        Auth->>App: window.app.showQuestionSelector()
    end
```

## 2. DuckDB Init & Question Loading

```mermaid
sequenceDiagram
    participant App as App
    participant QDD as QuestionDropdownManager
    participant API as APIClient
    participant DM as DuckDBManager
    participant BE as Express Backend
    participant WASM as DuckDB WASM

    Note over App: Step 1: Show question selector immediately<br/>(dropdown works without DuckDB)
    App->>QDD: new QuestionDropdownManager()
    QDD->>API: getQuestions()
    API->>BE: GET /api/practice/questions
    BE-->>API: questions[] from PostgreSQL
    API-->>QDD: questions[]
    QDD->>QDD: Populate dropdown with returned questions

    Note over App: Step 2: Initialize DuckDB in background<br/>(non-blocking, via .then())
    App->>DM: initializeDuckDB()
    DM->>WASM: selectBundle({mvp, eh, coi:null})
    DM->>WASM: createWorker(bundle.mainWorker)
    DM->>WASM: new AsyncDuckDB(logger, worker)
    DM->>WASM: db.instantiate(bundle.mainModule)
    WASM-->>DM: database instance
    DM->>WASM: db.connect()
    WASM-->>DM: connection ready
    DM-->>App: true (connected)

    Note over App: Step 3: Load ALL question sql_data into main connection
    App->>App: new PracticeManager(dbManager)
    App->>API: getQuestions()
    API-->>App: questions[]
    loop Each question's sql_data
        App->>DM: executeQuery(CREATE TABLE... / INSERT INTO...)
    end
    Note over App: SQL Editor now has all tables pre-loaded

    App->>App: restoreSession() — check mid-question state
```

## 3. Question Selection & Practice Start

```mermaid
sequenceDiagram
    participant U as User
    participant QDD as QuestionDropdownManager
    participant API as APIClient
    participant PM as PracticeManager
    participant DM as DuckDBManager
    participant BE as Backend

    U->>QDD: Select question from dropdown
    QDD->>QDD: onQuestionChange() — show metadata panel
    Note over QDD: Display difficulty, category,<br/>table schema parsed from sql_data

    U->>QDD: Click "Load Question"
    QDD->>API: getQuestion(id)
    API->>BE: GET /api/practice/question/:id
    BE-->>API: { id, sql_question, sql_data, sql_solution, ... }
    API-->>QDD: full question object

    QDD->>PM: startQuestion(question)
    PM->>PM: initializePracticeDuckDB()
    loop Each statement in sql_data
        PM->>DM: executeQuery(CREATE OR REPLACE TABLE...)
        DM-->>PM: table created
    end

    PM->>PM: showPracticeUI()
    Note over PM: Show question text, difficulty badge,<br/>inject Submit + Show Solution buttons
    PM->>PM: startTimer()
```

## 4. SQL Execution (Run Query)

```mermaid
sequenceDiagram
    participant U as User
    participant QE as QueryEditor
    participant App as App
    participant DM as DuckDBManager
    participant RV as ResultsView
    participant WASM as DuckDB WASM

    U->>QE: Type SQL in CodeMirror
    U->>App: Click "Run" or Ctrl+Enter

    App->>QE: getQuery()
    QE-->>App: "SELECT * FROM employees WHERE..."

    App->>DM: executeQuery(sql)
    DM->>WASM: conn.query(sql)

    alt Query succeeds
        WASM-->>DM: Arrow Table
        DM->>DM: formatResult() — Arrow → {columns, rows}
        Note over DM: BigInt → Number<br/>Date32 → ISO string<br/>Decimal → scaled float
        DM-->>App: { columns: [...], rows: [...] }
        App->>RV: displayResults(result, executionTime)
        RV->>RV: Render HTML table (max 1000 rows)
        App->>QE: addToHistory(sql)
    else Query fails
        WASM-->>DM: Error
        DM-->>App: throw error
        App->>RV: displayError(error.message)
    end
```

## 5. Solution Submission & Grading

```mermaid
sequenceDiagram
    participant U as User
    participant PM as PracticeManager
    participant DM as DuckDBManager (WASM)
    participant API as APIClient
    participant BE as Backend
    participant PG as PostgreSQL

    U->>PM: Click "Submit Code"
    PM->>PM: Get user SQL from editor, compute timeTaken

    Note over PM,DM: Client-side: run both queries in-browser (sequentially)
    PM->>DM: executeQuery(userSQL)
    DM-->>PM: userResults {columns, rows}
    PM->>DM: executeQuery(question.sql_solution)
    DM-->>PM: solutionResults {columns, rows}

    PM->>PM: compareResults(userResults, solutionResults)
    Note over PM: Row count + sorted column names +<br/>canonicalize rows with sorted keys, sort both sides,<br/>compare position-wise (order-independent)
    PM->>PM: showFeedback(isCorrect, userResults, solutionResults)

    Note over PM,BE: Server just records the attempt — no re-grading
    PM->>API: verifySolution(questionId, userSQL, userResults, isCorrect, timeTaken)
    API->>BE: POST /api/practice/verify
    BE->>PG: SELECT EXISTS (is_correct=true) — wasPreviouslyCompleted
    Note over BE: Check runs BEFORE insert so first success<br/>is not masked by the row we're about to add
    BE->>PG: INSERT INTO user_attempts (is_correct = clientIsCorrect)
    BE-->>API: { attempt, isFirstSuccess, solution }

    alt isCorrect
        API-->>PM: response with isCorrect=true
        PM->>PM: showNextQuestionButton()
    else incorrect
        API-->>PM: response with isCorrect=false
        Note over PM: User can retry or click Show Solution
    end
```

## 6. Show Solution & Next Question

```mermaid
sequenceDiagram
    participant U as User
    participant PM as PracticeManager
    participant API as APIClient
    participant QDD as QuestionDropdownManager
    participant DM as DuckDBManager
    participant BE as Backend

    U->>PM: Click "Show Solution"
    PM->>PM: showSolution()
    Note over PM: Display correct SQL<br/>+ step-by-step explanation array

    U->>PM: Click "Next Question →"
    PM->>API: getNextQuestion()
    API->>BE: GET /api/practice/next
    Note over BE: Server looks up current question from<br/>user_sessions table, returns the next one
    BE-->>API: next question object

    alt Has next question
        PM->>PM: startQuestion(nextQuestion)
        PM->>DM: CREATE OR REPLACE TABLE...
        PM->>PM: showPracticeUI()
        PM->>PM: startTimer()
        PM->>QDD: Update dropdown selection
    else No more questions
        PM->>PM: showCompletion()
        Note over PM: "All questions completed!"
    end
```

## 7. Registration Flow

```mermaid
sequenceDiagram
    participant U as User
    participant Auth as AuthManager
    participant API as APIClient
    participant BE as Backend
    participant DB as Cloud SQL

    U->>Auth: Click "Login" → Toggle to "Register"
    Auth->>Auth: Switch modal to register mode

    U->>Auth: Enter email + password (min 6 chars)
    U->>Auth: Click Register

    Auth->>API: register(email, password)
    API->>BE: POST /api/auth/register
    BE->>BE: validateRegister middleware
    Note over BE: Check email format<br/>Check password ≥ 6 chars

    BE->>DB: SELECT FROM users WHERE email = ?
    alt Email exists
        DB-->>BE: user found
        BE-->>API: 409 "Email already exists"
        API-->>Auth: Show error in modal
    else Email available
        BE->>BE: bcrypt.hash(password, 10)
        BE->>DB: INSERT INTO users (email, password_hash)
        DB-->>BE: user { id, email }
        BE->>BE: jwt.sign({ userId, email })
        BE-->>API: 201 { user, token }
        API->>API: Store in localStorage
        Auth->>Auth: Close modal
        Auth->>Auth: Show email in auth button
    end
```

## 8. Guest Access Flow

```mermaid
sequenceDiagram
    participant U as User/Browser
    participant Auth as AuthManager
    participant API as APIClient
    participant BE as Express Server
    participant DB as PostgreSQL

    U->>Auth: Click "Start Practicing"
    Auth->>API: guestLogin()
    API->>BE: POST /api/auth/guest
    BE->>DB: INSERT users (is_guest=true, email=guest-{uuid})
    DB-->>BE: user row
    BE->>BE: jwt.sign(userId, 24h)
    BE-->>API: { token, user: { isGuest: true } }
    API->>API: Store token + user in localStorage
    Auth->>Auth: Show "Guest" in header
    Auth->>Auth: Initialize DuckDB + show questions
```

## 9. Guest Upgrade Flow

```mermaid
sequenceDiagram
    participant U as User/Browser
    participant Auth as AuthManager
    participant API as APIClient
    participant BE as Express Server
    participant DB as PostgreSQL

    U->>Auth: Click "Guest" → "Create Account"
    Auth->>Auth: Show upgrade form (reuse auth modal)
    U->>Auth: Enter email + password
    Auth->>API: upgradeGuest(email, password)
    API->>BE: POST /api/auth/guest/upgrade
    BE->>DB: SELECT is_guest WHERE id=userId
    DB-->>BE: true
    BE->>DB: SELECT WHERE email=newEmail (check not taken)
    DB-->>BE: not found
    BE->>DB: UPDATE users SET email, password_hash, is_guest=false
    BE->>BE: jwt.sign(userId, 7d)
    BE-->>API: { token, user: { email } }
    API->>API: Replace token in localStorage
    Auth->>Auth: Show email in header (not "Guest")
    Note over U,DB: All progress preserved (same user_id)
```

## 10. Question Authoring Agent Flow

```mermaid
sequenceDiagram
    participant A as Admin (Browser)
    participant BE as Express Server
    participant G as Gemini API
    participant DB as PostgreSQL

    A->>BE: POST /api/admin/agent (X-Admin-Key)
    Note over BE: Verify admin key

    BE->>G: generateContent (+ tool declarations)
    G-->>BE: functionCall: get_coverage_gaps()
    BE->>DB: SELECT uncovered concepts
    DB-->>BE: 29 gaps
    BE->>G: functionResponse (gaps)

    Note over BE: wait 7s (rate limit)

    BE->>G: generateContent (+ history)
    G-->>BE: functionCall: list_existing_questions()
    BE->>DB: SELECT all questions
    DB-->>BE: 7 questions
    BE->>G: functionResponse (questions)

    Note over BE: wait 7s (rate limit)

    BE->>G: generateContent (+ history)
    G-->>BE: functionCall: validate_question(sql_data, sql_solution)
    BE->>DB: BEGIN; CREATE TABLE; INSERT; SELECT; ROLLBACK
    DB-->>BE: valid, 12 rows
    BE->>G: functionResponse (validation)

    Note over BE: wait 7s (rate limit)

    BE->>G: generateContent (+ history)
    G-->>BE: text: JSON preview with concepts
    BE-->>A: { steps[], history }

    Note over A: Admin reviews preview
    A->>BE: POST /api/admin/agent/approve
    BE->>DB: INSERT INTO questions
    BE->>DB: INSERT INTO question_concepts (tags)
    BE-->>A: { id: 8, concepts_tagged: ["HAVING"] }
```
