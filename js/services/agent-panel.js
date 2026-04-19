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
            const response = await fetch('/api/admin/agent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Key': adminKey
                },
                body: JSON.stringify({ prompt, history: this.history })
            });

            const data = await response.json();

            thinkingEl.remove();

            if (!response.ok) {
                throw new Error(data.error || 'Agent request failed');
            }

            this.history = data.history;
            this.renderSteps(data.steps);

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
                    stepEl.innerHTML = `
                        <div class="step-tool-header">
                            <span class="step-icon">&#9881;</span>
                            <strong>${this.escapeHtml(step.tool)}</strong>
                            <span class="step-latency">${step.latencyMs}ms</span>
                            <span class="step-toggle">&#9660;</span>
                        </div>
                        <pre class="step-detail">${this.escapeHtml(JSON.stringify(step.input, null, 2))}</pre>
                    `;
                    stepEl.querySelector('.step-tool-header').addEventListener('click', () => {
                        stepEl.classList.toggle('expanded');
                    });
                    break;
                }
                case 'tool_result': {
                    const hasError = step.result?.error;
                    stepEl.className = 'agent-step step-tool-result';
                    stepEl.innerHTML = `
                        <div class="step-tool-header">
                            <span class="step-icon">${hasError ? '&#10060;' : '&#9989;'}</span>
                            <strong>${this.escapeHtml(step.tool)} result</strong>
                            <span class="step-toggle">&#9660;</span>
                        </div>
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
