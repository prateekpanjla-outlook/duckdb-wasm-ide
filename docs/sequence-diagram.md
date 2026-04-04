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

    U->>HTML: Page load
    HTML->>App: DOMContentLoaded → new App()
    App->>App: init() — setup event listeners
    App->>Auth: new AuthManager()
    Auth->>Auth: Check localStorage for auth_token

    alt Has saved token
        Auth->>App: updateUIForLoggedInUser(user)
        App->>App: showQuestionSelector()
        App->>App: initializeDuckDB() (background)
    else No token
        Auth->>App: showLoginPrompt()
        U->>Auth: Click "Login" button
        Auth->>Auth: openModal()
        U->>Auth: Enter email + password, submit
        Auth->>API: login(email, password)
        API->>BE: POST /api/auth/login
        BE->>DB: SELECT user, verify bcrypt
        DB-->>BE: user row
        BE-->>API: { token, user }
        API->>API: Store token + user in localStorage
        Auth->>Auth: Close modal, show user email
        Auth->>App: window.app.initializeDuckDB()
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
    participant PM as PracticeManager
    participant BE as Express Backend
    participant WASM as DuckDB WASM

    par Load questions and init DuckDB
        App->>QDD: new QuestionDropdownManager()
        QDD->>API: getQuestions()
        API->>BE: GET /api/practice/questions
        BE-->>API: questions[]
        API-->>QDD: questions[]
        QDD->>QDD: Populate dropdown (7 questions)
    and
        App->>DM: initialize()
        DM->>WASM: Select EH bundle (fallback MVP)
        DM->>WASM: instantiate()
        WASM-->>DM: database instance
        DM->>WASM: connect()
        WASM-->>DM: connection ready
        DM-->>App: DuckDB connected
        App->>PM: new PracticeManager(dbManager)
        App->>PM: loadDefaultPracticeData()
        loop Each question's sql_data
            PM->>DM: executeQuery(CREATE TABLE...)
            PM->>DM: executeQuery(INSERT INTO...)
        end
    end

    App->>App: restoreSession() — check mid-question state
    App->>App: Hide loading overlay
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
    participant DM as DuckDBManager
    participant API as APIClient
    participant BE as Backend
    participant DB as Cloud SQL

    U->>PM: Click "Submit Code"
    PM->>PM: Get user SQL from editor

    par Execute both queries
        PM->>DM: executeQuery(userSQL)
        DM-->>PM: userResults {columns, rows}
    and
        PM->>DM: executeQuery(question.sql_solution)
        DM-->>PM: solutionResults {columns, rows}
    end

    PM->>PM: compareResults(userResults, solutionResults)
    Note over PM: 1. Check row count match<br/>2. Check column names match<br/>3. Check each cell value (string compare)

    alt Results match
        PM->>PM: showFeedback(correct)
        Note over PM: Green panel: "Correct! Well done!"<br/>Show "Next Question" button
    else Results differ
        PM->>PM: showFeedback(incorrect)
        Note over PM: Red panel: "Not quite right"<br/>Prompt "Show Solution"
    end

    PM->>API: verifySolution(questionId, userSQL, isCorrect, timeTaken)
    API->>BE: POST /api/practice/verify
    BE->>DB: INSERT INTO user_attempts
    DB-->>BE: recorded
    BE-->>API: { success: true }
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
    PM->>API: getNextQuestion(currentQuestionId)
    API->>BE: GET /api/practice/next?current=5
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
