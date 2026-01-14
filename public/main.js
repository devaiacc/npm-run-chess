const socket = io();

const pieceToUnicode = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟'
};

const capturedPieceMap = {
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

let currentState = {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    whiteAI: '',
    whiteModel: '',
    blackAI: '',
    blackModel: '',
    currentTurn: 'white',
    isThinking: false,
    thinkingPlayer: null,
    thinkingStartTime: null,
    whiteMoves: 0,
    blackMoves: 0,
    whiteTime: 0,
    blackTime: 0,
    whiteCaptured: [],
    blackCaptured: [],
    moveHistory: [],
    lastMove: null,
    gameStartTime: null,
    isAnimating: false
};

let thinkingInterval = null;
let totalTimeInterval = null;
let contractAddress = '';

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        contractAddress = data.contract || '';
        
        const linkEl = document.getElementById('contract-link');
        const copyBtn = document.getElementById('copy-contract');
        const devLink = document.getElementById('dev-link');
        
        if (linkEl && contractAddress) {
            linkEl.textContent = contractAddress;
            linkEl.href = `https://pump.fun/coin/${contractAddress}`;
        }
        
        if (devLink && data.dev) {
            devLink.href = data.dev;
        }
        
        if (copyBtn) {
            copyBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(contractAddress);
                    copyBtn.classList.add('copied');
                    setTimeout(() => copyBtn.classList.remove('copied'), 1500);
                } catch (err) {
                    console.error('Copy failed:', err);
                }
            });
        }
    } catch (err) {
        console.error('Failed to load config:', err);
    }
}

loadConfig();

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatSeconds(ms) {
    return (ms / 1000).toFixed(1) + 's';
}

function showGameAlert(type) {
    const alertEl = document.getElementById('game-alert');
    if (!alertEl) return;
    
    alertEl.classList.remove('show', 'check', 'checkmate');
    alertEl.textContent = type === 'checkmate' ? 'CHECKMATE!' : 'CHECK!';
    alertEl.classList.add(type);
    
    void alertEl.offsetWidth;
    
    alertEl.classList.add('show');
    
    setTimeout(() => {
        alertEl.classList.remove('show');
    }, 2000);
}

function startTotalTimeCounter() {
    if (totalTimeInterval) clearInterval(totalTimeInterval);
    
    totalTimeInterval = setInterval(() => {
        if (currentState.gameStartTime) {
            const elapsed = Date.now() - currentState.gameStartTime;
            document.getElementById('total-time').textContent = formatTime(elapsed);
        }
    }, 1000);
}

function squareToCoords(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = 8 - parseInt(square[1]);
    return { row: rank, col: file };
}

function getSquareElement(row, col) {
    const board = document.getElementById('chess-board');
    const index = row * 8 + col;
    return board.children[index];
}

async function animateMove(move, capturedPiece) {
    if (!move || !move.from || !move.to) return;
    
    currentState.isAnimating = true;
    
    const fromCoords = squareToCoords(move.from);
    const toCoords = squareToCoords(move.to);
    
    const fromSquare = getSquareElement(fromCoords.row, fromCoords.col);
    const toSquare = getSquareElement(toCoords.row, toCoords.col);
    
    if (!fromSquare || !toSquare) {
        currentState.isAnimating = false;
        return;
    }
    
    const pieceEl = fromSquare.querySelector('span');
    if (!pieceEl) {
        currentState.isAnimating = false;
        return;
    }
    
    fromSquare.classList.add('move-from');
    toSquare.classList.add('move-to');
    
    const fromRect = fromSquare.getBoundingClientRect();
    const toRect = toSquare.getBoundingClientRect();
    
    const deltaX = toRect.left - fromRect.left;
    const deltaY = toRect.top - fromRect.top;
    
    pieceEl.style.position = 'relative';
    pieceEl.style.zIndex = '100';
    pieceEl.style.transition = 'transform 0.8s ease-in-out';
    pieceEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    
    await new Promise(resolve => setTimeout(resolve, 800));
    
    if (capturedPiece) {
        const capturedEl = toSquare.querySelector('span');
        if (capturedEl) {
            capturedEl.classList.add('captured-animation');
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    fromSquare.classList.remove('move-from');
    toSquare.classList.remove('move-to');
    
    currentState.isAnimating = false;
}

function updateBoard(fen, skipAnimation = false) {
    const board = document.getElementById('chess-board');
    if (!board) return;
    
    board.innerHTML = '';
    
    const fenBoard = fen.split(' ')[0];
    const rows = fenBoard.split('/');
    
    for (let row = 0; row < 8; row++) {
        let col = 0;
        const rowData = rows[row];
        
        for (let i = 0; i < rowData.length; i++) {
            const char = rowData[i];
            
            if (char >= '1' && char <= '8') {
                const emptyCount = parseInt(char);
                for (let j = 0; j < emptyCount; j++) {
                    createSquare(board, row, col, null);
                    col++;
                }
            } else {
                const isWhite = char === char.toUpperCase();
                const pieceKey = (isWhite ? 'w' : 'b') + char.toUpperCase();
                createSquare(board, row, col, pieceKey);
                col++;
            }
        }
    }
    
    if (window.update3DBoard && !currentState.isAnimating) {
        window.update3DBoard(fen, false);
    }
}

function createSquare(board, row, col, pieceKey) {
    const square = document.createElement('div');
    const isLight = (row + col) % 2 === 0;
    square.className = `square ${isLight ? 'light' : 'dark'}`;
    square.dataset.row = row;
    square.dataset.col = col;
    
    const file = String.fromCharCode(97 + col);
    const rank = 8 - row;
    square.dataset.square = file + rank;
    
    if (pieceKey && pieceToUnicode[pieceKey]) {
        const piece = document.createElement('span');
        piece.textContent = pieceToUnicode[pieceKey];
        piece.className = pieceKey.startsWith('w') ? 'piece-white' : 'piece-black';
        square.appendChild(piece);
    }
    
    if (currentState.lastMove) {
        const pos = file + rank;
        if (pos === currentState.lastMove.from || pos === currentState.lastMove.to) {
            square.classList.add('last-move');
        }
    }
    
    board.appendChild(square);
}

function updateThinkingBadges() {
    const whiteBadge = document.getElementById('white-thinking-badge');
    const blackBadge = document.getElementById('black-thinking-badge');
    
    if (currentState.isThinking && currentState.thinkingPlayer === 'white') {
        whiteBadge.classList.add('active');
        blackBadge.classList.remove('active');
    } else if (currentState.isThinking && currentState.thinkingPlayer === 'black') {
        blackBadge.classList.add('active');
        whiteBadge.classList.remove('active');
    } else {
        whiteBadge.classList.remove('active');
        blackBadge.classList.remove('active');
    }
}

function startThinkingTimer() {
    stopThinkingTimer(false);
    
    if (!currentState.isThinking || !currentState.thinkingStartTime) return;
    
    const updateThinking = () => {
        const elapsed = Date.now() - currentState.thinkingStartTime;
        const elId = currentState.thinkingPlayer === 'white' ? 'white-current-thinking' : 'black-current-thinking';
        const el = document.getElementById(elId);
        if (el) {
            el.textContent = formatSeconds(elapsed);
        }
    };
    
    updateThinking();
    
    thinkingInterval = setInterval(updateThinking, 100);
}

function stopThinkingTimer(resetDisplay = true) {
    if (thinkingInterval) {
        clearInterval(thinkingInterval);
        thinkingInterval = null;
    }
    if (resetDisplay) {
        document.getElementById('white-current-thinking').textContent = '-';
        document.getElementById('black-current-thinking').textContent = '-';
    }
}

function updateCapturedPieces() {
    const whiteContainer = document.getElementById('white-captured');
    const blackContainer = document.getElementById('black-captured');
    
    if (currentState.whiteCaptured && currentState.whiteCaptured.length > 0) {
        whiteContainer.innerHTML = currentState.whiteCaptured.map(p => 
            `<span class="captured-piece">${capturedPieceMap[p.toLowerCase()] || p}</span>`
        ).join('');
    } else {
        whiteContainer.innerHTML = '<span class="no-captures">None</span>';
    }
    
    if (currentState.blackCaptured && currentState.blackCaptured.length > 0) {
        blackContainer.innerHTML = currentState.blackCaptured.map(p => 
            `<span class="captured-piece">${capturedPieceMap[p.toLowerCase()] || p}</span>`
        ).join('');
    } else {
        blackContainer.innerHTML = '<span class="no-captures">None</span>';
    }
}

function updateMoveHistory() {
    const whiteList = document.getElementById('white-moves-list');
    const blackList = document.getElementById('black-moves-list');
    
    if (!currentState.moveHistory) return;
    
    const whiteMoves = currentState.moveHistory.filter(m => m.player === 'white');
    const blackMoves = currentState.moveHistory.filter(m => m.player === 'black');
    
    const whiteReversed = [...whiteMoves].reverse().slice(0, 10);
    const blackReversed = [...blackMoves].reverse().slice(0, 10);
    
    whiteList.innerHTML = whiteReversed.map((m, i) => `
        <div class="move-item ${i === 0 ? 'latest-move' : ''}">
            <span class="move-number">#${whiteMoves.length - i}</span>
            <span class="move-notation">${m.move || m.san || '-'}</span>
            <span class="move-time">${m.thinkingTime ? (m.thinkingTime / 1000).toFixed(1) + 's' : '-'}</span>
        </div>
    `).join('');
    
    blackList.innerHTML = blackReversed.map((m, i) => `
        <div class="move-item ${i === 0 ? 'latest-move' : ''}">
            <span class="move-number">#${blackMoves.length - i}</span>
            <span class="move-notation">${m.move || m.san || '-'}</span>
            <span class="move-time">${m.thinkingTime ? (m.thinkingTime / 1000).toFixed(1) + 's' : '-'}</span>
        </div>
    `).join('');
}

function updateStats() {
    document.getElementById('white-moves').textContent = currentState.whiteMoves || 0;
    document.getElementById('black-moves').textContent = currentState.blackMoves || 0;
    
    document.getElementById('white-total-time').textContent = formatSeconds(currentState.whiteTime || 0);
    document.getElementById('black-total-time').textContent = formatSeconds(currentState.blackTime || 0);
    
    const whiteAvg = currentState.whiteMoves > 0 ? (currentState.whiteTime / currentState.whiteMoves) : 0;
    const blackAvg = currentState.blackMoves > 0 ? (currentState.blackTime / currentState.blackMoves) : 0;
    
    document.getElementById('white-avg-time').textContent = (whiteAvg / 1000).toFixed(1) + 's';
    document.getElementById('black-avg-time').textContent = (blackAvg / 1000).toFixed(1) + 's';
}

function updateAINames(data) {
    if (data.whiteAI) {
        currentState.whiteAI = data.whiteAI;
        currentState.whiteModel = data.whiteAIModel || '';
        const displayName = data.whiteAIModel ? `${data.whiteAI} (${data.whiteAIModel})` : data.whiteAI;
        document.getElementById('white-ai-name').textContent = displayName;
    }
    
    if (data.blackAI) {
        currentState.blackAI = data.blackAI;
        currentState.blackModel = data.blackAIModel || '';
        const displayName = data.blackAIModel ? `${data.blackAI} (${data.blackAIModel})` : data.blackAI;
        document.getElementById('black-ai-name').textContent = displayName;
    }
}

function updateUI(data, skipBoardUpdate = false) {
    updateAINames(data);
    
    if (data.gameState) {
        const gs = data.gameState;
        
        if (gs.gameStartTime) {
            currentState.gameStartTime = gs.gameStartTime;
        }
        
        if (gs.fen && !skipBoardUpdate && !currentState.isAnimating) {
            currentState.fen = gs.fen;
            updateBoard(gs.fen);
        }
        
        currentState.whiteMoves = gs.whiteMoves || 0;
        currentState.blackMoves = gs.blackMoves || 0;
        currentState.whiteTime = gs.whiteTime || 0;
        currentState.blackTime = gs.blackTime || 0;
        currentState.whiteCaptured = gs.whiteCaptured || [];
        currentState.blackCaptured = gs.blackCaptured || [];
        currentState.moveHistory = gs.moveHistory || [];
        currentState.currentTurn = gs.currentTurn || 'white';
        
        document.getElementById('round').textContent = gs.round || 0;
        
        const status = gs.isGameOver ? 'Game Over' : 
                       currentState.isThinking ? `${currentState.thinkingPlayer?.toUpperCase()} thinking...` :
                       `${currentState.currentTurn?.toUpperCase()} to move`;
        document.getElementById('game-status').textContent = status;
        
        updateStats();
        updateCapturedPieces();
        updateMoveHistory();
    }
}

socket.on('gameState', (data) => {
    console.log('Received gameState:', data);
    
    if (data.gameState && data.gameState.gameStartTime) {
        currentState.gameStartTime = data.gameState.gameStartTime;
        startTotalTimeCounter();
    }
    
    if (data.isThinking) {
        currentState.isThinking = true;
        currentState.thinkingPlayer = data.thinkingPlayer;
        currentState.thinkingStartTime = data.thinkingStartTime || Date.now();
        startThinkingTimer();
    }
    
    updateUI(data, true);
    updateThinkingBadges();
});

socket.on('gameStarted', (data) => {
    console.log('Game started:', data);
    
    currentState.lastMove = null;
    currentState.isThinking = false;
    currentState.thinkingPlayer = null;
    currentState.isAnimating = false;
    stopThinkingTimer();
    
    if (window.forceFinish3DAnimation) {
        window.forceFinish3DAnimation();
    }
    
    if (data.gameState && data.gameState.gameStartTime) {
        currentState.gameStartTime = data.gameState.gameStartTime;
        startTotalTimeCounter();
    }
    
    updateUI(data);
    updateThinkingBadges();
    
    if (data.gameState && data.gameState.fen && window.update3DBoard) {
        window.update3DBoard(data.gameState.fen, false);
    }
    
    document.getElementById('game-status').textContent = 'Game Started!';
    
    if (window.set3DCameraTurn) {
        window.set3DCameraTurn('white');
    }
});

socket.on('aiThinking', (data) => {
    console.log('AI Thinking:', data);
    
    currentState.isThinking = true;
    currentState.thinkingPlayer = data.player;
    currentState.thinkingStartTime = data.thinkingStartTime || Date.now();
    
    updateThinkingBadges();
    startThinkingTimer();
    updateCommentaryThinking(data.player, true);
    
    if (window.set3DThinking) {
        window.set3DThinking(true, null, null);
    }
    
    document.getElementById('game-status').textContent = `${data.aiName} thinking...`;
});

socket.on('aiCommentary', (data) => {
    console.log('AI Commentary:', data);
    updateCommentary(data.player, data.commentary, data.move);
});

let commentaryHistory = {
    white: [],
    black: []
};

function typewriterEffect(element, text, speed = 8) {
    let i = 0;
    element.textContent = '';
    
    function type() {
        if (i < text.length) {
            const charsPerTick = Math.min(3, text.length - i);
            element.textContent += text.substring(i, i + charsPerTick);
            i += charsPerTick;
            setTimeout(type, speed);
        }
    }
    type();
}

function updateCommentary(player, commentary, move) {
    const elId = player === 'white' ? 'white-commentary' : 'black-commentary';
    const el = document.getElementById(elId);
    if (!el) return;
    
    commentaryHistory[player].unshift({ move, commentary, time: Date.now() });
    
    if (commentaryHistory[player].length > 5) {
        commentaryHistory[player] = commentaryHistory[player].slice(0, 5);
    }
    
    renderCommentaryHistory(player);
    updateCommentaryThinking(player, false);
}

function renderCommentaryHistory(player) {
    const elId = player === 'white' ? 'white-commentary' : 'black-commentary';
    const el = document.getElementById(elId);
    if (!el) return;
    
    const history = commentaryHistory[player];
    
    if (history.length === 0) {
        el.innerHTML = '<span style="color: #555; font-style: italic;">Waiting for move...</span>';
        return;
    }
    
    el.innerHTML = '';
    
    history.forEach((entry, index) => {
        const div = document.createElement('div');
        div.className = 'commentary-entry';
        
        const moveDiv = document.createElement('div');
        moveDiv.className = 'commentary-move';
        moveDiv.textContent = `► ${entry.move}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'commentary-content';
        
        if (index === 0) {
            div.appendChild(moveDiv);
            div.appendChild(contentDiv);
            el.appendChild(div);
            typewriterEffect(contentDiv, entry.commentary, 5);
        } else {
            contentDiv.textContent = entry.commentary;
            div.appendChild(moveDiv);
            div.appendChild(contentDiv);
            el.appendChild(div);
        }
    });
}

function updateCommentaryThinking(player, isThinking) {
    const iconId = player === 'white' ? 'white-thinking-icon' : 'black-thinking-icon';
    const commentaryId = player === 'white' ? 'white-commentary' : 'black-commentary';
    
    const icon = document.getElementById(iconId);
    const commentary = document.getElementById(commentaryId);
    
    if (icon) {
        if (isThinking) {
            icon.classList.add('active');
        } else {
            icon.classList.remove('active');
        }
    }
    
    if (isThinking && commentary) {
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'commentary-entry';
        thinkingDiv.innerHTML = '<span style="color: #4ade80;">🤔 Analyzing position...</span>';
        commentary.insertBefore(thinkingDiv, commentary.firstChild);
    }
}

socket.on('moveMade', async (data) => {
    console.log('Move made:', data);
    
    currentState.isThinking = false;
    currentState.thinkingPlayer = null;
    currentState.thinkingStartTime = null;
    stopThinkingTimer(true);
    updateThinkingBadges();
    updateCommentaryThinking(data.player, false);
    
    if (window.set3DThinking) {
        window.set3DThinking(false);
    }
    
    const move = data.move;
    const captured = move?.captured;
    const nextTurn = data.gameState?.currentTurn || 'white';
    const newFen = data.gameState?.fen;
    
    if (move && move.from && move.to) {
        currentState.lastMove = {
            from: move.from,
            to: move.to
        };
        
        currentState.isAnimating = true;
        
        if (window.execute3DMove) {
            let captureSquare = null;
            if (captured && move.flags && move.flags.includes('e')) {
                const file = move.to[0];
                const rank = move.color === 'w' ? '5' : '4';
                captureSquare = file + rank;
            }
            
            const isCastling = move.flags && (move.flags.includes('k') || move.flags.includes('q'));
            
            window.execute3DMove(move.from, move.to, !!captured, captured, captureSquare, newFen, isCastling ? move : null, () => {
                if (window.set3DCameraTurn) {
                    window.set3DCameraTurn(nextTurn);
                }
                
                if (data.isCheckmate && window.show3DNotification) {
                    window.show3DNotification('CHECKMATE');
                } else if (data.isCheck && window.show3DNotification) {
                    window.show3DNotification('CHECK');
                }
                
                currentState.isAnimating = false;
            });
        } else {
            currentState.isAnimating = false;
        }
        
        await animateMove(move, captured);
    }
    
    if (newFen) {
        currentState.fen = newFen;
        updateBoard(newFen);
    }
    
    if (data.isCheckmate) {
        showGameAlert('checkmate');
    } else if (data.isCheck) {
        showGameAlert('check');
    }
    
    updateUI({ 
        gameState: data.gameState, 
        whiteAI: currentState.whiteAI, 
        blackAI: currentState.blackAI,
        whiteAIModel: currentState.whiteModel,
        blackAIModel: currentState.blackModel
    }, true);
    
    document.getElementById('game-status').textContent = `${nextTurn.toUpperCase()} to move`;
});

socket.on('moveRejected', (data) => {
    console.log('Move rejected:', data);
    document.getElementById('game-status').textContent = `Move rejected: ${data.reason}`;
});

socket.on('moveError', (data) => {
    console.log('Move error:', data);
    document.getElementById('game-status').textContent = data.error;
});

socket.on('gameOver', (data) => {
    console.log('Game over:', data);
    
    currentState.isThinking = false;
    currentState.thinkingPlayer = null;
    stopThinkingTimer();
    updateThinkingBadges();
    
    let message = '';
    if (data.result === 'draw') {
        message = `Draw: ${data.reason}`;
        if (window.show3DNotification) {
            if (data.reason && data.reason.toLowerCase().includes('stalemate')) {
                window.show3DNotification('STALEMATE');
            } else {
                window.show3DNotification('DRAW');
            }
        }
    } else {
        message = `${data.result.toUpperCase()} wins! (${data.reason})`;
        if (data.reason && data.reason.toLowerCase().includes('checkmate') && window.show3DNotification) {
            window.show3DNotification('CHECKMATE');
        }
    }
    
    document.getElementById('game-status').textContent = message;
});

socket.on('nextGameCountdown', (data) => {
    const alertEl = document.getElementById('game-alert');
    if (!alertEl) return;
    
    alertEl.classList.remove('show', 'check', 'checkmate');
    alertEl.classList.add('countdown', 'countdown-show');
    
    if (data.seconds > 0) {
        alertEl.innerHTML = `NEXT GAME<span class="countdown-number">${data.seconds}</span>`;
        alertEl.classList.remove('countdown-pulse');
        void alertEl.offsetWidth;
        alertEl.classList.add('countdown-pulse');
    } else {
        alertEl.innerHTML = `STARTING...`;
        setTimeout(() => {
            alertEl.classList.remove('countdown', 'countdown-show', 'countdown-pulse');
        }, 500);
    }
    
    document.getElementById('game-status').textContent = `Next game in ${data.seconds}s...`;
});

socket.on('gameError', (data) => {
    console.log('Game error:', data);
    document.getElementById('game-status').textContent = `Error: ${data.error}`;
    
    currentState.isThinking = false;
    stopThinkingTimer();
    updateThinkingBadges();
});

socket.on('aiLog', (data) => {
    addLogEntry(data.type, data.message);
});

socket.on('connect', () => {
    console.log('Connected to server');
    addLogEntry('info', 'Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    document.getElementById('game-status').textContent = 'Disconnected...';
    if (totalTimeInterval) clearInterval(totalTimeInterval);
    addLogEntry('error', 'Disconnected from server');
});

let logQueue = [];
let isTypingLog = false;

function addLogEntry(type, message) {
    logQueue.push({ type, message });
    processLogQueue();
}

function processLogQueue() {
    if (isTypingLog || logQueue.length === 0) return;
    
    isTypingLog = true;
    const { type, message } = logQueue.shift();
    
    const logContainer = document.getElementById('ai-log');
    if (!logContainer) {
        isTypingLog = false;
        processLogQueue();
        return;
    }
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    let i = 0;
    const speed = 15;
    const charsPerTick = 2;
    
    function typeLog() {
        if (i < message.length) {
            const chunk = message.substring(i, i + charsPerTick);
            entry.textContent += chunk;
            i += charsPerTick;
            logContainer.scrollTop = logContainer.scrollHeight;
            requestAnimationFrame(() => setTimeout(typeLog, speed));
        } else {
            isTypingLog = false;
            while (logContainer.children.length > 100) {
                logContainer.removeChild(logContainer.firstChild);
            }
            setTimeout(processLogQueue, 50);
        }
    }
    typeLog();
}

updateBoard(currentState.fen);

const mobileToggle = document.getElementById('mobile-toggle');
const whitePanelEl = document.querySelector('.white-panel');
const blackPanelEl = document.querySelector('.black-panel');
const aiLogSection = document.querySelector('.ai-log-section');

let mobileDetailsOpen = false;

if (mobileToggle) {
    const toggleText = mobileToggle.querySelector('span');
    
    mobileToggle.addEventListener('click', () => {
        mobileDetailsOpen = !mobileDetailsOpen;
        
        if (mobileDetailsOpen) {
            mobileToggle.classList.add('active');
            whitePanelEl?.classList.add('mobile-visible');
            blackPanelEl?.classList.add('mobile-visible');
            aiLogSection?.classList.add('mobile-visible');
            if (toggleText) toggleText.textContent = 'Hide AI Logs';
        } else {
            mobileToggle.classList.remove('active');
            whitePanelEl?.classList.remove('mobile-visible');
            blackPanelEl?.classList.remove('mobile-visible');
            aiLogSection?.classList.remove('mobile-visible');
            if (toggleText) toggleText.textContent = 'Show AI Logs';
        }
    });
}
