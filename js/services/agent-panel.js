/**
 * Agent Panel — Frontend UI for the Question Authoring Agent
 * Shows reasoning chain: each tool call + result, with approve/reject for final output.
 */

export class AgentPanel {
    constructor() {
        this.history = [];
        this.pendingQuestion = null;
        this.createPanel();
    }

    createPanel() {
        const panelHTML = `
            <div id="agentPanel" class="agent-panel hidden">
                <div class="agent-header">
                    <h3>Question Authoring Agent</h3>
                    <button id="closeAgentPanel" class="btn-close">&times;</button>
                </div>
                <div class="agent-key-input">
                    <input type="password" id="adminKeyInput" placeholder="Admin Key" class="form-input">
                </div>
                <div id="agentSteps" class="agent-steps"></div>
                <div class="agent-input">
                    <input type="text" id="agentPrompt" placeholder='e.g. "Add a question about RANK() window function"' class="form-input">
                    <button id="agentSendBtn" class="btn btn-primary">Send</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', panelHTML);
        this.attachEvents();
    }

    attachEvents() {
        document.getElementById('closeAgentPanel').addEventListener('click', () => this.hide());
        document.getElementById('agentSendBtn').addEventListener('click', () => this.send());
        document.getElementById('agentPrompt').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.send();
        });
    }

    show() {
        document.getElementById('agentPanel').classList.remove('hidden');
        document.getElementById('adminKeyInput').focus();
    }

    hide() {
        document.getElementById('agentPanel').classList.add('hidden');
    }

    async send() {
        const promptInput = document.getElementById('agentPrompt');
        const prompt = promptInput.value.trim();
        const adminKey = document.getElementById('adminKeyInput').value.trim();

        if (!prompt) return;
        if (!adminKey) {
            this.addStep('error', 'Please enter the admin key first');
            return;
        }

        promptInput.value = '';
        promptInput.disabled = true;
        document.getElementById('agentSendBtn').disabled = true;

        const stepsContainer = document.getElementById('agentSteps');

        // Show user message
        this.addStep('user', prompt);

        // Show thinking
        const thinkingEl = document.createElement('div');
        thinkingEl.className = 'agent-step step-thinking';
        thinkingEl.textContent = 'Agent is thinking...';
        stepsContainer.appendChild(thinkingEl);
        stepsContainer.scrollTop = stepsContainer.scrollHeight;

        try {
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/admin/agent/stream');
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('X-Admin-Key', adminKey);

                let lastIndex = 0;
                let thinkingRemoved = false;

                xhr.onprogress = () => {
                    if (!thinkingRemoved) {
                        thinkingEl.remove();
                        thinkingRemoved = true;
                    }

                    const newData = xhr.responseText.substring(lastIndex);
                    lastIndex = xhr.responseText.length;

                    const events = newData.split('\n\n');
                    for (const event of events) {
                        if (!event.startsWith('data: ')) continue;
                        try {
                            const step = JSON.parse(event.slice(6));
                            if (step.type === 'done') {
                                this.history = step.history;
                            } else {
                                this.renderSteps([step]);
                            }
                        } catch { /* incomplete JSON, will get it next time */ }
                    }
                };

                xhr.onload = () => {
                    if (!thinkingRemoved) thinkingEl.remove();
                    if (xhr.status !== 200) {
                        try {
                            const err = JSON.parse(xhr.responseText);
                            this.addStep('error', err.error || 'Agent request failed');
                        } catch {
                            this.addStep('error', `Agent request failed (${xhr.status})`);
                        }
                    }
                    resolve();
                };

                xhr.onerror = () => {
                    if (!thinkingRemoved) thinkingEl.remove();
                    this.addStep('error', 'Network error');
                    reject(new Error('Network error'));
                };

                xhr.send(JSON.stringify({ prompt, history: this.history }));
            });

        } catch (error) {
            thinkingEl.remove();
            this.addStep('error', error.message);
        }

        promptInput.disabled = false;
        document.getElementById('agentSendBtn').disabled = false;
        promptInput.focus();
    }

    addStep(type, content) {
        const stepsContainer = document.getElementById('agentSteps');
        const stepEl = document.createElement('div');

        switch (type) {
            case 'user':
                stepEl.className = 'agent-step step-user';
                stepEl.innerHTML = `<strong>You:</strong> ${this.escapeHtml(content)}`;
                break;
            case 'error':
                stepEl.className = 'agent-step step-error';
                stepEl.textContent = `Error: ${content}`;
                break;
            case 'success':
                stepEl.className = 'agent-step step-success';
                stepEl.textContent = content;
                break;
        }

        stepsContainer.appendChild(stepEl);
        stepsContainer.scrollTop = stepsContainer.scrollHeight;
    }

    renderSteps(steps) {
        const stepsContainer = document.getElementById('agentSteps');

        for (const step of steps) {
            const stepEl = document.createElement('div');

            switch (step.type) {
                case 'tool_call': {
                    stepEl.className = 'agent-step step-tool-call';
                    const callSummary = this.formatToolCall(step.tool, step.input);
                    stepEl.innerHTML = `
                        <div class="step-tool-header">
                            <span class="step-icon">&#9881;</span>
                            <strong>${this.escapeHtml(step.tool)}</strong>
                            <span class="step-latency">${step.latencyMs}ms</span>
                            <span class="step-toggle">&#9660;</span>
                        </div>
                        <div class="step-summary">${callSummary}</div>
                        <pre class="step-detail">${this.escapeHtml(JSON.stringify(step.input, null, 2))}</pre>
                    `;
                    stepEl.querySelector('.step-tool-header').addEventListener('click', () => {
                        stepEl.classList.toggle('expanded');
                    });
                    break;
                }
                case 'tool_result': {
                    const hasError = step.result?.error;
                    const resultSummary = this.formatToolResult(step.tool, step.result);
                    stepEl.className = 'agent-step step-tool-result';
                    stepEl.innerHTML = `
                        <div class="step-tool-header">
                            <span class="step-icon">${hasError ? '&#10060;' : '&#9989;'}</span>
                            <strong>${this.escapeHtml(step.tool)} result</strong>
                            <span class="step-toggle">&#9660;</span>
                        </div>
                        <div class="step-summary">${resultSummary}</div>
                        <pre class="step-detail">${this.escapeHtml(JSON.stringify(step.result, null, 2))}</pre>
                    `;
                    stepEl.querySelector('.step-tool-header').addEventListener('click', () => {
                        stepEl.classList.toggle('expanded');
                    });
                    break;
                }
                case 'answer': {
                    stepEl.className = 'agent-step step-answer';
                    stepEl.innerHTML = `<div class="step-answer-content">${this.formatAnswer(step.content)}</div>`;
                    this.tryParsePreview(step.content);
                    break;
                }
                case 'error': {
                    stepEl.className = 'agent-step step-error';
                    stepEl.textContent = `Error: ${step.content}`;
                    break;
                }
            }

            stepsContainer.appendChild(stepEl);
        }

        stepsContainer.scrollTop = stepsContainer.scrollHeight;
    }

    tryParsePreview(content) {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) return;

        try {
            const question = JSON.parse(jsonMatch[1]);
            if (question.sql_data && question.sql_question && question.sql_solution) {
                this.pendingQuestion = question;
                this.showApprovalButtons();
            }
        } catch { /* not valid JSON */ }
    }

    showApprovalButtons() {
        const q = this.pendingQuestion;
        const stepsContainer = document.getElementById('agentSteps');

        // Remove any existing preview
        const existing = document.getElementById('agentPreview');
        if (existing) existing.remove();

        // Create preview as a new element appended to steps
        const previewDiv = document.createElement('div');
        previewDiv.id = 'agentPreview';
        previewDiv.className = 'agent-preview';
        stepsContainer.appendChild(previewDiv);

        // Extract schema (CREATE TABLE lines) and data (INSERT lines) from sql_data
        const lines = (q.sql_data || '').split('\n');
        const schemaLines = lines.filter(l => /CREATE TABLE|^\s+\w+\s+(INTEGER|VARCHAR|TEXT|DATE|DECIMAL|BOOLEAN|SERIAL)/i.test(l));
        const insertMatch = q.sql_data.match(/INSERT INTO[\s\S]*/i);
        const insertData = insertMatch ? insertMatch[0] : '';
        const rowCount = (insertData.match(/\(/g) || []).length - 1; // subtract the column list parens

        // Format concepts
        const conceptsHtml = (q.concepts || []).map(c => {
            const badge = c.is_intended ? 'intended' : 'alternative';
            return `<span class="concept-badge concept-${badge}">${this.escapeHtml(c.name)}</span>`;
        }).join(' ');

        // Format explanation
        const explanationHtml = (q.sql_solution_explanation || []).map((e, i) =>
            `<li>${this.escapeHtml(e)}</li>`
        ).join('');

        previewDiv.innerHTML = `
            <div class="question-preview-card">
                <h3>Question Preview</h3>

                <div class="preview-meta">
                    <span class="badge badge-${q.difficulty}">${this.escapeHtml(q.difficulty || '')}</span>
                    <span class="badge">${this.escapeHtml(q.category || '')}</span>
                    <span class="badge">Order #${q.order_index || '?'}</span>
                </div>

                <div class="preview-section">
                    <h4>Question</h4>
                    <p>${this.escapeHtml(q.sql_question || '')}</p>
                </div>

                <div class="preview-section">
                    <h4>Schema</h4>
                    <pre class="preview-code">${this.escapeHtml(schemaLines.join('\n'))}</pre>
                </div>

                <div class="preview-section preview-collapsible">
                    <h4 class="preview-toggle">Sample Data <span class="preview-row-count">(${rowCount > 0 ? rowCount : '?'} rows — click to expand)</span></h4>
                    <pre class="preview-code preview-folded">${this.escapeHtml(insertData)}</pre>
                </div>

                <div class="preview-section">
                    <h4>Solution</h4>
                    <pre class="preview-code">${this.escapeHtml(q.sql_solution || '')}</pre>
                </div>

                <div class="preview-section">
                    <h4>Explanation</h4>
                    <ol class="preview-explanation">${explanationHtml}</ol>
                </div>

                <div class="preview-section">
                    <h4>Concepts</h4>
                    <div class="preview-concepts">${conceptsHtml || 'None specified'}</div>
                </div>

                <div class="approval-buttons">
                    <button id="approveQuestionBtn" class="btn btn-primary">Approve & Insert</button>
                    <button id="rejectQuestionBtn" class="btn btn-secondary">Reject & Try Again</button>
                </div>
            </div>
        `;

        // Collapsible data section
        previewDiv.querySelector('.preview-toggle')?.addEventListener('click', () => {
            const folded = previewDiv.querySelector('.preview-folded');
            if (folded) {
                folded.classList.remove('preview-folded');
                previewDiv.querySelector('.preview-row-count').textContent = '(click to collapse)';
            } else {
                previewDiv.querySelector('.preview-collapsible pre').classList.add('preview-folded');
                previewDiv.querySelector('.preview-row-count').textContent = `(${rowCount > 0 ? rowCount : '?'} rows — click to expand)`;
            }
        });

        // Scroll preview into view
        previewDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        document.getElementById('approveQuestionBtn').addEventListener('click', () => this.approveQuestion());
        document.getElementById('rejectQuestionBtn').addEventListener('click', () => {
            this.pendingQuestion = null;
            previewDiv.remove();
            document.getElementById('agentPrompt').value = 'Try again with a different approach';
            document.getElementById('agentPrompt').focus();
        });
    }

    async approveQuestion() {
        if (!this.pendingQuestion) return;

        const adminKey = document.getElementById('adminKeyInput').value.trim();

        try {
            const response = await fetch('/api/admin/agent/approve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Key': adminKey
                },
                body: JSON.stringify({ question: this.pendingQuestion })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            this.addStep('success', `Question ${data.id} inserted successfully!`);
            document.getElementById('agentPreview')?.remove();
            this.pendingQuestion = null;

        } catch (error) {
            this.addStep('error', `Insert failed: ${error.message}`);
        }
    }

    formatToolCall(tool, input) {
        switch (tool) {
            case 'list_existing_questions':
                return 'Checking what questions already exist...';
            case 'get_coverage_gaps':
                return 'Looking for SQL concepts with no questions yet...';
            case 'list_concepts':
                return 'Loading full concept coverage details...';
            case 'execute_sql':
                return `Running SQL: <code>${this.escapeHtml((input?.sql || '').substring(0, 80))}...</code>`;
            case 'validate_question':
                return 'Validating generated question (schema + solution + distinguishability)...';
            case 'insert_question':
                return `Inserting question: "${this.escapeHtml((input?.sql_question || '').substring(0, 60))}"`;
            case 'generate_test':
                return `Generating Playwright test for question ${input?.question_id}`;
            case 'check_concept_overlap':
                return `Checking overlap for: ${input?.concepts?.map(c => this.escapeHtml(c)).join(', ') || '?'}`;
            default:
                return `Calling ${tool}...`;
        }
    }

    formatToolResult(tool, result) {
        if (result?.error) {
            return `Error: ${this.escapeHtml(result.error)}`;
        }

        switch (tool) {
            case 'list_existing_questions': {
                const cats = result.questions?.map(q => this.escapeHtml(q.category)).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'none';
                const tables = result.used_table_names?.map(t => this.escapeHtml(t)).join(', ') || 'none';
                return `Found <strong>${result.count}</strong> questions. Next order_index: <strong>${result.next_order_index}</strong>.<br>Categories: ${cats}<br>Used table names: <code>${tables}</code>`;
            }
            case 'get_coverage_gaps': {
                const gaps = result.gaps_by_category || {};
                const categories = Object.keys(gaps);
                const names = categories.flatMap(c => gaps[c].map(g => this.escapeHtml(g.name)));
                return `<strong>${result.total_gaps}</strong> uncovered concepts: ${names.join(', ')}`;
            }
            case 'list_concepts':
                return `<strong>${result.total_concepts}</strong> concepts in taxonomy`;
            case 'execute_sql':
                return result.success
                    ? `${result.command} — ${result.rowCount} row(s)`
                    : `Failed: ${this.escapeHtml(result.error || 'unknown error')}`;
            case 'validate_question': {
                const parts = [
                    result.schema_valid ? 'Schema valid' : 'Schema invalid',
                    result.rows_inserted ? `${result.rows_inserted} rows inserted` : null,
                    result.solution_valid ? `Solution returns ${result.solution_rows} rows` : 'Solution invalid',
                    result.distinguishable ? 'Distinguishable' : 'NOT distinguishable'
                ].filter(Boolean).join(' · ');
                const collisionWarning = result.table_collisions
                    ? `<br><strong style="color:#c62828">Table name collision:</strong> ${result.table_collisions.map(c => `"${c.tables.join(', ')}" also used in Q${c.question_id}`).join('; ')}`
                    : '';
                return parts + collisionWarning;
            }
            case 'insert_question':
                return `Question <strong>#${result.id}</strong> inserted. Concepts tagged: ${result.concepts_tagged?.map(c => this.escapeHtml(c)).join(', ') || 'none'}`;
            case 'generate_test':
                return `Test file: <code>${result.filename}</code>`;
            case 'check_concept_overlap':
                return (result.concepts || []).map(c => {
                    const name = this.escapeHtml(c.concept);
                    if (c.status === 'not_covered') return `<strong>${name}</strong> — not covered yet`;
                    if (c.status === 'alternative_only') return `<strong>${name}</strong> — alternative in Q${c.alternative_in.map(q => q.id).join(', Q')}`;
                    if (c.status === 'already_covered') return `<strong>${name}</strong> — already covered in Q${c.intended_in.map(q => q.id).join(', Q')}`;
                    if (c.status === 'not_in_taxonomy') return `<strong>${name}</strong> — not in taxonomy`;
                    return `<strong>${name}</strong> — ${c.status}`;
                }).join('<br>');
            default:
                return JSON.stringify(result).substring(0, 100);
        }
    }

    formatAnswer(text) {
        return text
            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
