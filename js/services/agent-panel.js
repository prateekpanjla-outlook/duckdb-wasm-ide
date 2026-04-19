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
                <div id="agentPreview" class="agent-preview hidden"></div>
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
            const response = await fetch('/api/admin/agent/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Key': adminKey
                },
                body: JSON.stringify({ prompt, history: this.history })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Agent request failed');
            }

            thinkingEl.remove();

            // Read SSE stream — render each step as it arrives
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const events = buffer.split('\n\n');
                buffer = events.pop(); // keep incomplete chunk

                for (const event of events) {
                    if (!event.startsWith('data: ')) continue;
                    const step = JSON.parse(event.slice(6));

                    if (step.type === 'done') {
                        this.history = step.history;
                    } else {
                        this.renderSteps([step]);
                    }
                }
            }

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
        const previewDiv = document.getElementById('agentPreview');
        previewDiv.classList.remove('hidden');
        previewDiv.innerHTML = `
            <div class="approval-buttons">
                <button id="approveQuestionBtn" class="btn btn-primary">Approve & Insert</button>
                <button id="rejectQuestionBtn" class="btn btn-secondary">Reject & Try Again</button>
            </div>
        `;

        document.getElementById('approveQuestionBtn').addEventListener('click', () => this.approveQuestion());
        document.getElementById('rejectQuestionBtn').addEventListener('click', () => {
            this.pendingQuestion = null;
            previewDiv.classList.add('hidden');
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
            document.getElementById('agentPreview').classList.add('hidden');
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
            case 'list_existing_questions':
                return `Found <strong>${result.count}</strong> questions. Next order_index: <strong>${result.next_order_index}</strong>. Categories: ${result.questions?.map(q => this.escapeHtml(q.category)).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'none'}`;
            case 'get_coverage_gaps': {
                const gaps = result.gaps_by_category || {};
                const categories = Object.keys(gaps);
                const names = categories.flatMap(c => gaps[c].map(g => this.escapeHtml(g.name))).slice(0, 8);
                return `<strong>${result.total_gaps}</strong> uncovered concepts: ${names.join(', ')}${result.total_gaps > 8 ? '...' : ''}`;
            }
            case 'list_concepts':
                return `<strong>${result.total_concepts}</strong> concepts in taxonomy`;
            case 'execute_sql':
                return result.success
                    ? `${result.command} — ${result.rowCount} row(s)`
                    : `Failed: ${this.escapeHtml(result.error || 'unknown error')}`;
            case 'validate_question':
                return [
                    result.schema_valid ? 'Schema valid' : 'Schema invalid',
                    result.rows_inserted ? `${result.rows_inserted} rows inserted` : null,
                    result.solution_valid ? `Solution returns ${result.solution_rows} rows` : 'Solution invalid',
                    result.distinguishable ? 'Distinguishable' : 'NOT distinguishable'
                ].filter(Boolean).join(' · ');
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
