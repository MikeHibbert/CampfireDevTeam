// CampfireDevTeam Chat Panel JavaScript

(function() {
    const vscode = acquireVsCodeApi();
    
    // DOM elements
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    const clearButton = document.getElementById('clearChat');
    const camperSelect = document.getElementById('camperSelect');
    const typingIndicator = document.getElementById('typingIndicator');
    
    // State
    let messages = [];
    
    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    clearButton.addEventListener('click', clearChat);
    camperSelect.addEventListener('change', selectCamper);
    
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
        
        // Auto-resize textarea
        autoResizeTextarea();
    });
    
    chatInput.addEventListener('input', autoResizeTextarea);
    
    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'updateChat':
                messages = message.messages;
                renderMessages();
                break;
            case 'showTyping':
                showTypingIndicator();
                break;
            case 'hideTyping':
                hideTypingIndicator();
                break;
            case 'showFileOptions':
                showFileCreationOptions(message.files);
                break;
            case 'showCommandOptions':
                showCommandExecutionOptions(message.commands);
                break;
        }
    });
    
    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        
        // Send message to extension
        vscode.postMessage({
            type: 'sendMessage',
            text: text
        });
        
        // Clear input
        chatInput.value = '';
        autoResizeTextarea();
        
        // Disable send button temporarily
        sendButton.disabled = true;
        setTimeout(() => {
            sendButton.disabled = false;
        }, 1000);
    }
    
    function clearChat() {
        vscode.postMessage({
            type: 'clearChat'
        });
    }
    
    function selectCamper() {
        const selectedCamper = camperSelect.value;
        vscode.postMessage({
            type: 'selectCamper',
            camper: selectedCamper
        });
    }
    
    function autoResizeTextarea() {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    }
    
    function showTypingIndicator() {
        typingIndicator.style.display = 'flex';
        scrollToBottom();
    }
    
    function hideTypingIndicator() {
        typingIndicator.style.display = 'none';
    }
    
    function renderMessages() {
        // Clear existing messages (except welcome)
        const welcomeMessage = chatMessages.querySelector('.welcome-message');
        chatMessages.innerHTML = '';
        if (welcomeMessage && messages.length === 0) {
            chatMessages.appendChild(welcomeMessage);
        }
        
        // Render all messages
        messages.forEach(message => {
            const messageElement = createMessageElement(message);
            chatMessages.appendChild(messageElement);
        });
        
        scrollToBottom();
    }
    
    function createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.type}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'camper-avatar';
        
        if (message.type === 'user') {
            avatar.textContent = '👤';
        } else if (message.type === 'error') {
            avatar.textContent = '⚠️';
        } else {
            avatar.textContent = getCamperEmoji(message.camperRole);
        }
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        if (message.camperRole && message.type === 'assistant') {
            const camperName = document.createElement('div');
            camperName.className = 'camper-name';
            camperName.textContent = message.camperRole;
            content.appendChild(camperName);
        }
        
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.innerHTML = formatMessageContent(message.content);
        content.appendChild(messageText);
        
        // Add confidence score for assistant messages
        if (message.type === 'assistant' && message.confidenceScore !== undefined) {
            const confidence = document.createElement('div');
            confidence.className = `confidence-score ${getConfidenceClass(message.confidenceScore)}`;
            confidence.textContent = `Confidence: ${Math.round(message.confidenceScore * 100)}%`;
            content.appendChild(confidence);
        }
        
        // Add action buttons for files and commands
        if (message.filesToCreate && message.filesToCreate.length > 0) {
            const fileActions = createFileActionButtons(message.filesToCreate);
            content.appendChild(fileActions);
        }
        
        if (message.commandsToExecute && message.commandsToExecute.length > 0) {
            const commandActions = createCommandActionButtons(message.commandsToExecute);
            content.appendChild(commandActions);
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        
        return messageDiv;
    }
    
    function getCamperEmoji(camperRole) {
        const emojis = {
            'RequirementsGatherer': '📋',
            'OSExpert': '💻',
            'BackEndDev': '⚙️',
            'FrontEndDev': '🎨',
            'Tester': '🧪',
            'DevOps': '🚀',
            'TerminalExpert': '⌨️',
            'Auditor': '🔍'
        };
        return emojis[camperRole] || '🤖';
    }
    
    function getConfidenceClass(score) {
        if (score >= 0.8) return 'high';
        if (score >= 0.6) return 'medium';
        return 'low';
    }
    
    function formatMessageContent(content) {
        // Basic markdown-like formatting
        let formatted = content
            .replace(/```([\\s\\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
            .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
            .replace(/\\n/g, '<br>');
        
        return formatted;
    }
    
    function createFileActionButtons(files) {
        const container = document.createElement('div');
        container.className = 'action-buttons';
        
        files.forEach((file, index) => {
            const button = document.createElement('button');
            button.className = 'action-btn';
            button.textContent = `📄 Create ${file.path}`;
            button.onclick = () => createFile(file);
            container.appendChild(button);
        });
        
        return container;
    }
    
    function createCommandActionButtons(commands) {
        const container = document.createElement('div');
        container.className = 'action-buttons';
        
        commands.forEach((command, index) => {
            const button = document.createElement('button');
            button.className = 'action-btn';
            button.textContent = `⚡ Run: ${command.substring(0, 30)}${command.length > 30 ? '...' : ''}`;
            button.onclick = () => executeCommand(command);
            container.appendChild(button);
        });
        
        return container;
    }
    
    function createFile(file) {
        vscode.postMessage({
            type: 'createFile',
            file: file
        });
    }
    
    function executeCommand(command) {
        vscode.postMessage({
            type: 'executeCommand',
            command: command
        });
    }
    
    function showFileCreationOptions(files) {
        // Files are already shown as action buttons in the message
        // This could be enhanced with a modal or dedicated UI
    }
    
    function showCommandExecutionOptions(commands) {
        // Commands are already shown as action buttons in the message
        // This could be enhanced with a modal or dedicated UI
    }
    
    function scrollToBottom() {
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
    }
    
    // Initialize
    autoResizeTextarea();
})();