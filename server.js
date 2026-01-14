require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Chess } = require('chess.js');
const OpenAI = require('openai');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'AI Chess Game'
  }
});

const AI_MODELS = [
  { name: 'Claude Sonnet', model: 'anthropic/claude-sonnet-4.5' },
  { name: 'Grok', model: 'x-ai/grok-4.1-fast' },
  { name: 'Gemini', model: 'google/gemini-3-flash-preview' },
  { name: 'Deepseek', model: 'deepseek/deepseek-v3.2' },
  { name: 'GPT-3.5', model: 'openai/gpt-3.5-turbo' }
];

const REFEREE_AI = { name: 'Referee', model: 'openai/gpt-4o-mini' };

const AI_LOG = process.env.AI_LOG === 'true';

function emitLog(type, message) {
  io.emit('aiLog', { type, message, time: Date.now() });
}

function aiLog(...args) {
  if (AI_LOG) {
    console.log('[AI_LOG]', ...args);
  }
}

function aiLogError(...args) {
  if (AI_LOG) {
    console.error('[AI_LOG_ERROR]', ...args);
  }
}

let currentWhiteAI = null;
let currentBlackAI = null;

function selectRandomAIPair(excludeDeepseek = false) {
  let models = [...AI_MODELS];
  
  if (excludeDeepseek) {
    models = models.filter(m => !m.model.includes('deepseek'));
  }
  
  if (models.length < 2) {
    return { white: models[0] || AI_MODELS[0], black: models[0] || AI_MODELS[0] };
  }
  
  let whiteAI, blackAI;
  do {
    const shuffled = [...models].sort(() => Math.random() - 0.5);
    whiteAI = shuffled[0];
    blackAI = shuffled[1];
  } while (whiteAI.model === blackAI.model);
  
  return { white: whiteAI, black: blackAI };
}

let game = new Chess();
let gameState = {
  round: 0,
  currentTurn: 'white',
  whiteMoves: 0,
  blackMoves: 0,
  whiteTime: 0,
  blackTime: 0,
  whiteThinkingTime: 0,
  blackThinkingTime: 0,
  gameStartTime: Date.now(),
  isGameActive: false,
  isThinking: false,
  thinkingPlayer: null,
  thinkingStartTime: null,
  whitePieces: [],
  blackPieces: [],
  lastInvalidMoves: [],
  lastRefereeFeedback: null,
  moveHistory: [],
  whiteCaptured: [],
  blackCaptured: []
};

function updatePieces() {
  const board = game.board();
  gameState.whitePieces = [];
  gameState.blackPieces = [];
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece) {
        const pieceInfo = {
          type: piece.type,
          color: piece.color,
          square: String.fromCharCode(97 + col) + (8 - row)
        };
        if (piece.color === 'w') {
          gameState.whitePieces.push(pieceInfo);
        } else {
          gameState.blackPieces.push(pieceInfo);
        }
      }
    }
  }
}

const INITIAL_PIECES = {
  white: [
    { type: 'r', square: 'a1' }, { type: 'n', square: 'b1' }, { type: 'b', square: 'c1' },
    { type: 'q', square: 'd1' }, { type: 'k', square: 'e1' }, { type: 'b', square: 'f1' },
    { type: 'n', square: 'g1' }, { type: 'r', square: 'h1' },
    { type: 'p', square: 'a2' }, { type: 'p', square: 'b2' }, { type: 'p', square: 'c2' },
    { type: 'p', square: 'd2' }, { type: 'p', square: 'e2' }, { type: 'p', square: 'f2' },
    { type: 'p', square: 'g2' }, { type: 'p', square: 'h2' }
  ],
  black: [
    { type: 'r', square: 'a8' }, { type: 'n', square: 'b8' }, { type: 'b', square: 'c8' },
    { type: 'q', square: 'd8' }, { type: 'k', square: 'e8' }, { type: 'b', square: 'f8' },
    { type: 'n', square: 'g8' }, { type: 'r', square: 'h8' },
    { type: 'p', square: 'a7' }, { type: 'p', square: 'b7' }, { type: 'p', square: 'c7' },
    { type: 'p', square: 'd7' }, { type: 'p', square: 'e7' }, { type: 'p', square: 'f7' },
    { type: 'p', square: 'g7' }, { type: 'p', square: 'h7' }
  ]
};

function getCapturedPieces() {
  const currentWhite = gameState.whitePieces.map(p => p.type).sort().join('');
  const currentBlack = gameState.blackPieces.map(p => p.type).sort().join('');
  
  const initialWhite = INITIAL_PIECES.white.map(p => p.type).sort().join('');
  const initialBlack = INITIAL_PIECES.black.map(p => p.type).sort().join('');
  
  const whiteCaptured = [];
  const blackCaptured = [];
  
  const whiteCount = {};
  const blackCount = {};
  
  gameState.whitePieces.forEach(p => {
    whiteCount[p.type] = (whiteCount[p.type] || 0) + 1;
  });
  
  gameState.blackPieces.forEach(p => {
    blackCount[p.type] = (blackCount[p.type] || 0) + 1;
  });
  
  const initialWhiteCount = { r: 2, n: 2, b: 2, q: 1, k: 1, p: 8 };
  const initialBlackCount = { r: 2, n: 2, b: 2, q: 1, k: 1, p: 8 };
  
  Object.keys(initialWhiteCount).forEach(type => {
    const lost = initialWhiteCount[type] - (whiteCount[type] || 0);
    for (let i = 0; i < lost; i++) {
      whiteCaptured.push(type);
    }
  });
  
  Object.keys(initialBlackCount).forEach(type => {
    const lost = initialBlackCount[type] - (blackCount[type] || 0);
    for (let i = 0; i < lost; i++) {
      blackCaptured.push(type);
    }
  });
  
  return { whiteCaptured, blackCaptured };
}

function getGameContext() {
  const moves = game.history({ verbose: true });
  const lastMove = moves.length > 0 ? moves[moves.length - 1] : null;
  const captured = getCapturedPieces();
  
  return {
    fen: game.fen(),
    pgn: game.pgn(),
    turn: game.turn(),
    isCheck: game.isCheck(),
    isCheckmate: game.isCheckmate(),
    isStalemate: game.isStalemate(),
    isDraw: game.isDraw(),
    isGameOver: game.isGameOver(),
    lastMove: lastMove,
    moves: moves.length,
    moveHistory: gameState.moveHistory || [],
    whitePieces: gameState.whitePieces.length,
    blackPieces: gameState.blackPieces.length,
    whiteCaptured: captured.whiteCaptured,
    blackCaptured: captured.blackCaptured
  };
}

function formatMoveHistory(moves, role) {
  if (moves.length === 0) return 'No moves yet.';
  
  const formatted = [];
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const moveNum = Math.floor(i / 2) + 1;
    const isWhiteMove = i % 2 === 0;
    const player = isWhiteMove ? 'WHITE' : 'BLACK';
    const notation = move.san || `${move.from}-${move.to}`;
    
    if (isWhiteMove) {
      formatted.push(`${moveNum}. ${player}: ${notation}`);
    } else {
      formatted[formatted.length - 1] += ` | ${player}: ${notation}`;
    }
  }
  
  return formatted.join('\n');
}

function formatPieces(pieces) {
  const grouped = {};
  pieces.forEach(p => {
    const type = p.type.toUpperCase();
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(p.square);
  });
  
  return Object.keys(grouped).map(type => {
    const squares = grouped[type].join(', ');
    return `${type}: ${squares}`;
  }).join('\n');
}

function extractMove(response) {
  if (!response) return null;
  
  const text = response.trim();
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    
    const cleanLine = line.replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
    
    const sanPattern = /^([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?|O-O-O|O-O|0-0-0|0-0)$/i;
    if (sanPattern.test(cleanLine)) {
      return cleanLine.replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');
    }
    
    const uciPattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;
    if (uciPattern.test(cleanLine)) {
      return cleanLine;
    }
  }
  
  const movePatterns = [
    /\*\*([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\*\*/gi,
    /\b(O-O-O|O-O|0-0-0|0-0)\b/gi,
    /\b([KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g,
    /\b([a-h][1-8][a-h][1-8][qrbn]?)\b/gi,
    /\b([a-h]x?[a-h]?[1-8](?:=[QRBN])?[+#]?)\b/g
  ];
  
  for (const pattern of movePatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1][1];
      return lastMatch.replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');
    }
  }
  
  const firstLine = lines[0] || '';
  if (firstLine.length <= 10 && /^[a-hKQRBN]/.test(firstLine)) {
    return firstLine.replace(/[^a-hA-H1-8KQRBNPkqrbnpxXOo\-=+#]/g, '');
  }
  
  return null;
}

async function askAI(playerAI, context, role, previousInvalidMoves = [], refereeFeedback = null) {
  const isWhite = role === 'white';
  const myPieces = isWhite ? gameState.whitePieces : gameState.blackPieces;
  const opponentPieces = isWhite ? gameState.blackPieces : gameState.whitePieces;
  const myCaptured = isWhite ? context.whiteCaptured : context.blackCaptured;
  const opponentCaptured = isWhite ? context.blackCaptured : context.whiteCaptured;
  const myMoves = isWhite ? gameState.whiteMoves : gameState.blackMoves;
  const opponentMoves = isWhite ? gameState.blackMoves : gameState.whiteMoves;
  
  const moveHistory = formatMoveHistory(context.moveHistory, role);
  const myPiecesFormatted = formatPieces(myPieces);
  const opponentPiecesFormatted = formatPieces(opponentPieces);
  
  const legalMoves = game.moves({ verbose: true });
  const legalMovesList = legalMoves.map(m => m.san || `${m.from}-${m.to}`).slice(0, 50);
  
  const recentMoves = context.moveHistory.slice(-6).filter(m => {
    const moveColor = m.color === 'w' ? 'white' : 'black';
    return moveColor === role;
  });
  
  const recentPieceTypes = recentMoves.map(m => {
    const piece = m.piece || '';
    return piece.toUpperCase();
  }).filter(p => p);
  
  const pieceVarietyWarning = recentPieceTypes.length >= 3 && 
    new Set(recentPieceTypes).size === 1 
    ? `\n⚠️ WARNING: You have been moving the same piece type (${recentPieceTypes[0]}) repeatedly. Try using DIFFERENT pieces to create variety and better positions.` 
    : '';
  
  let invalidMovesSection = '';
  if (previousInvalidMoves.length > 0 || refereeFeedback) {
    invalidMovesSection = `\n=== REFEREE FEEDBACK ===
${refereeFeedback ? `The referee says: "${refereeFeedback}"` : ''}
${previousInvalidMoves.length > 0 ? `\nPrevious invalid moves you tried: ${previousInvalidMoves.join(', ')}\nDO NOT repeat these moves.` : ''}
`;
  }
  
  const prompt = `You are playing chess as ${isWhite ? 'WHITE' : 'BLACK'}.${invalidMovesSection}

=== GAME INFORMATION ===
Round: ${gameState.round + 1}
Current Turn: ${context.turn === 'w' ? 'WHITE (YOU)' : 'BLACK (OPPONENT)'}
Your total moves: ${myMoves}
Opponent total moves: ${opponentMoves}

=== COMPLETE MOVE HISTORY ===
${moveHistory}

=== YOUR CURRENT PIECES ON BOARD ===
${myPiecesFormatted}
Total: ${myPieces.length} pieces

=== OPPONENT CURRENT PIECES ON BOARD ===
${opponentPiecesFormatted}
Total: ${opponentPieces.length} pieces

=== YOUR CAPTURED PIECES (LOST) ===
${myCaptured.length > 0 ? myCaptured.map(p => p.toUpperCase()).join(', ') : 'None'}

=== OPPONENT CAPTURED PIECES (LOST) ===
${opponentCaptured.length > 0 ? opponentCaptured.map(p => p.toUpperCase()).join(', ') : 'None'}

=== CURRENT BOARD STATE ===
FEN: ${context.fen}
Is Check: ${context.isCheck ? 'YES - You are in check!' : 'No'}
Last Move: ${context.lastMove ? `${context.lastMove.from}-${context.lastMove.to} (${context.lastMove.san || ''})` : 'None'}

=== YOUR LEGAL MOVES (YOU CAN ONLY USE THESE) ===
${legalMovesList.length > 0 ? legalMovesList.join(', ') : 'No legal moves available'}
Total legal moves: ${legalMoves.length}

=== YOUR TASK ===
Analyze the complete game situation:
1. Review all moves played so far
2. Consider your current pieces and their positions
3. Consider opponent's pieces and their positions
4. Note which pieces have been captured
5. ${context.isCheck ? 'You are in CHECK - you must get out of check!' : 'Plan your strategy'}
6. **CRITICAL: You MUST choose a move from the LEGAL MOVES list above. Do NOT invent moves.**
7. **VARIETY IS IMPORTANT: Try to use DIFFERENT pieces, not just the same piece repeatedly. Consider all your pieces and their potential moves.**${pieceVarietyWarning}
8. **CASTLING: Only use "O-O" (kingside) or "O-O-O" (queenside) if castling is legal and listed in legal moves.**

Choose the best move from the legal moves list. Prioritize variety - use different pieces when possible. Respond ONLY with the move notation (e.g., "e4", "Nf3", "O-O", "O-O-O"). Do not include any explanation or other text.`;

  const requestPayload = {
    model: playerAI.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500,
    temperature: 0.3
  };

  aiLog('========== AI REQUEST ==========');
  aiLog(`Model: ${playerAI.name} (${playerAI.model})`);
  aiLog(`Role: ${role}`);
  aiLog(`Legal Moves: ${legalMovesList.join(', ')}`);
  aiLog(`Prompt Length: ${prompt.length} chars`);
  aiLog('--- FULL PROMPT ---');
  aiLog(prompt);
  aiLog('--- REQUEST PAYLOAD ---');
  aiLog(JSON.stringify({ ...requestPayload, messages: [{ role: 'user', content: `[${prompt.length} chars]` }] }, null, 2));

  emitLog('request', `[${playerAI.name}] Requesting move... (${legalMoves.length} legal moves)`);

  try {
    console.log(`[${playerAI.name}] Requesting move from model: ${playerAI.model}`);
    
    const startTime = Date.now();
    const completion = await openrouter.chat.completions.create(requestPayload);
    const duration = Date.now() - startTime;
    
    aiLog('========== AI RESPONSE ==========');
    aiLog(`Response Time: ${duration}ms`);
    aiLog('--- RAW API RESPONSE ---');
    aiLog(JSON.stringify(completion, null, 2));
    
    if (!completion || !completion.choices || completion.choices.length === 0) {
      aiLogError(`No choices in API response`);
      aiLogError('Full Response:', JSON.stringify(completion, null, 2));
      console.error(`[${playerAI.name}] No choices in API response`);
      emitLog('error', `[${playerAI.name}] No choices in API response`);
      return null;
    }
    
    const choice = completion.choices[0];
    const finishReason = choice?.finish_reason;
    const response = choice?.message?.content?.trim();
    const reasoning = choice?.message?.reasoning;
    
    aiLog(`Finish Reason: ${finishReason}`);
    aiLog(`Raw Content: "${response}"`);
    
    if (reasoning) {
      const shortReasoning = reasoning.length > 200 ? reasoning.substring(0, 200) + '...' : reasoning;
      emitLog('info', `[${playerAI.name}] Thinking: ${shortReasoning}`);
    }
    
    if (!response) {
      aiLogError(`Empty content in response`);
      aiLogError('Choice Object:', JSON.stringify(choice, null, 2));
      console.error(`[${playerAI.name}] Empty content in response`);
      emitLog('error', `[${playerAI.name}] Empty response (finish: ${finishReason})`);
      return null;
    }
    
    const extractedMove = extractMove(response);
    
    aiLog(`Extracted Move: "${extractedMove}"`);
    aiLog('========== END ==========\n');
    
    emitLog('response', `[${playerAI.name}] Response: "${response}" (${duration}ms)`);
    
    console.log(`[${playerAI.name}] Received: "${response}" -> Extracted: "${extractedMove}"`);
    return extractedMove;
  } catch (error) {
    aiLogError('========== API ERROR ==========');
    aiLogError(`Model: ${playerAI.name} (${playerAI.model})`);
    aiLogError(`Error Message: ${error.message}`);
    aiLogError(`Error Code: ${error.code}`);
    aiLogError(`HTTP Status: ${error.status}`);
    
    if (error.error) {
      aiLogError('Error Details:', JSON.stringify(error.error, null, 2));
    }
    
    if (error.response) {
      aiLogError('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    aiLogError('Full Error:', JSON.stringify(error, null, 2));
    aiLogError('========== END ERROR ==========\n');
    
    emitLog('error', `[${playerAI.name}] API Error: ${error.message}`);
    
    console.error(`[${playerAI.name}] API Error:`, error.message || error);
    return null;
  }
}

async function getAICommentary(playerAI, context, role, chosenMove, capturedPiece) {
  const isWhite = role === 'white';
  
  const pieceNames = {
    'p': 'pawn', 'n': 'knight', 'b': 'bishop',
    'r': 'rook', 'q': 'queen', 'k': 'king'
  };
  
  let captureInfo = '';
  if (capturedPiece) {
    const pieceName = pieceNames[capturedPiece.toLowerCase()] || 'piece';
    captureInfo = `I captured their ${pieceName} with this move.`;
  }
  
  const recentMoves = context.moveHistory?.slice(-6).map(m => `${m.player}: ${m.move}`).join(', ') || 'Opening';
  
  const prompt = `You're a chess player explaining your move. Be direct and insightful.

Position: ${context.fen}
You play: ${isWhite ? 'WHITE' : 'BLACK'}
Your move: ${chosenMove}
${captureInfo ? `Action: ${captureInfo}` : ''}
Recent moves: ${recentMoves}

Write 2-3 sentences explaining:
- Why you chose this move
- What threat/opportunity it creates
- Your plan

Rules:
- Start directly with the explanation, NO filler words like "Okay", "Alright", "Hmm", "So", "Well"
- Be specific about tactics (pin, fork, pressure, development, control, attack)
- If captured, explain why that piece was valuable
- Sound like a knowledgeable player, not robotic
- Keep under 40 words

Examples:
"Pushing this pawn opens my bishop diagonal. Now threatening their knight - if it moves, I control the center."
"Taking that knight removes their best defender. My rook now has an open file to pressure their king."
"Knight to this square eyes the weak f7 and supports a d5 push. Classic development."`;

  try {
    const completion = await openrouter.chat.completions.create({
      model: playerAI.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.7
    });
    
    let response = completion?.choices?.[0]?.message?.content?.trim();
    if (response) {
      response = response.replace(/^["']|["']$/g, '');
      response = response.replace(/^(okay|alright|hmm|so|well|hey|hi|hello|buddy|friend|right|now|let's see|let me)[,.\s]*/i, '');
      response = response.charAt(0).toUpperCase() + response.slice(1);
    }
    return response || (capturedPiece ? "Taking that piece." : "Solid move.");
  } catch (error) {
    console.error(`[${playerAI.name}] Commentary error:`, error.message);
    return capturedPiece ? "Had to take that." : "Interesting position.";
  }
}

async function validateMove(moveStr, context) {
  const testGame = new Chess(context.fen);
  let testMove = null;
  
  try {
    if (moveStr.match(/^[a-h][1-8][a-h][1-8]$/)) {
      testMove = testGame.move({
        from: moveStr.substring(0, 2),
        to: moveStr.substring(2, 4),
        promotion: 'q'
      });
    } else if (moveStr.match(/^[a-h][1-8][a-h][1-8][qrbn]$/i)) {
      const promotion = moveStr[4].toLowerCase();
      testMove = testGame.move({
        from: moveStr.substring(0, 2),
        to: moveStr.substring(2, 4),
        promotion: promotion
      });
    } else {
      testMove = testGame.move(moveStr);
    }
    
    if (testMove) {
      return { isValid: true, reason: null };
    }
  } catch (error) {
    console.log(`[Referee] Move ${moveStr} failed chess.js validation: ${error.message}`);
  }
  
  const prompt = `You are a chess referee. Validate if this move is legal.

Game state:
- FEN: ${context.fen}
- Turn: ${context.turn === 'w' ? 'WHITE' : 'BLACK'}
- Proposed move: ${moveStr}
- Is check: ${context.isCheck}

Legal moves available: ${testGame.moves().slice(0, 20).join(', ')}

Is this move legal according to chess rules? 
- Check if the piece exists at the source square
- Check if the move follows chess rules (piece movement patterns)
- Check if castling is legal (king and rook haven't moved, no pieces between, not in check)
- Check if the move puts/leaves king in check

Respond with "VALID" if legal, or "INVALID: [specific reason]" if illegal. Be very specific about why it's invalid.`;

  try {
    const completion = await openrouter.chat.completions.create({
      model: REFEREE_AI.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150
    });
    
    const response = completion.choices[0].message.content.trim();
    const isValid = response.toUpperCase().startsWith('VALID');
    const reason = isValid ? null : response.replace(/^INVALID\s*:?\s*/i, '').trim();
    
    if (!isValid) {
      console.log(`[Referee] Move ${moveStr} rejected: ${reason}`);
    }
    
    return { isValid, reason };
  } catch (error) {
    console.error('Error validating move:', error);
    return { isValid: false, reason: 'Validation error occurred' };
  }
}

async function makeMove(retryCount = 0) {
  if (!gameState.isGameActive || game.isGameOver()) {
    gameState.isThinking = false;
    gameState.thinkingPlayer = null;
    gameState.thinkingStartTime = null;
    return;
  }

  const MAX_RETRIES = 5;
  const isWhiteTurn = game.turn() === 'w';
  const playerAI = isWhiteTurn ? currentWhiteAI : currentBlackAI;
  
  let thinkingStartTime;
  if (retryCount === 0) {
    thinkingStartTime = Date.now();
    gameState.isThinking = true;
    gameState.thinkingPlayer = isWhiteTurn ? 'white' : 'black';
    gameState.thinkingStartTime = thinkingStartTime;

    io.emit('aiThinking', { 
      player: isWhiteTurn ? 'white' : 'black',
      aiName: playerAI.name,
      thinkingStartTime: thinkingStartTime
    });
  } else {
    thinkingStartTime = gameState.thinkingStartTime;
  }

  const context = getGameContext();
  const previousInvalidMoves = retryCount > 0 ? (gameState.lastInvalidMoves || []) : [];
  const refereeFeedback = retryCount > 0 ? gameState.lastRefereeFeedback : null;
  
  let moveStr = await askAI(playerAI, context, isWhiteTurn ? 'white' : 'black', previousInvalidMoves, refereeFeedback);
  
  if (!moveStr) {
    if (retryCount < MAX_RETRIES) {
      const waitTime = 2000 + (retryCount * 1000);
      console.log(`[${playerAI.name}] Failed to get move, retrying in ${waitTime}ms... (${retryCount + 1}/${MAX_RETRIES})`);
      aiLog(`[RETRY] ${playerAI.name} failed, attempt ${retryCount + 1}/${MAX_RETRIES}, waiting ${waitTime}ms`);
      
      io.emit('moveError', { 
        player: isWhiteTurn ? 'white' : 'black',
        error: `${playerAI.name} failed to respond, retrying... (${retryCount + 1}/${MAX_RETRIES})`,
        aiName: playerAI.name,
        model: playerAI.model,
        retryCount: retryCount + 1
      });
      
      setTimeout(() => makeMove(retryCount + 1), waitTime);
      return;
    } else {
      console.error(`[${playerAI.name}] CRITICAL: Failed after ${MAX_RETRIES} attempts. Model may be unavailable: ${playerAI.model}`);
      aiLogError(`[CRITICAL] ${playerAI.name} (${playerAI.model}) failed after ${MAX_RETRIES} attempts`);
      
      io.emit('moveError', { 
        player: isWhiteTurn ? 'white' : 'black',
        error: `CRITICAL: ${playerAI.name} (${playerAI.model}) failed after ${MAX_RETRIES} attempts. Consider removing this model from AI_MODELS list.`,
        aiName: playerAI.name,
        model: playerAI.model,
        isCritical: true
      });
      
      gameState.isGameActive = false;
      gameState.isThinking = false;
      gameState.thinkingPlayer = null;
      gameState.thinkingStartTime = null;
      
      io.emit('gameError', {
        error: `Game stopped: ${playerAI.name} (${playerAI.model}) is not responding. Remove this model from server.js AI_MODELS array.`,
        model: playerAI.model
      });
      return;
    }
  }

  try {
    let move = null;
    
    moveStr = moveStr.trim().replace(/[^\w\-O]/g, '');
    
    if (moveStr.match(/^[a-h][1-8][a-h][1-8]$/)) {
      move = game.move({
        from: moveStr.substring(0, 2),
        to: moveStr.substring(2, 4),
        promotion: 'q'
      });
    } else if (moveStr.match(/^[a-h][1-8][a-h][1-8][qrbn]$/i)) {
      const promotion = moveStr[4].toLowerCase();
      move = game.move({
        from: moveStr.substring(0, 2),
        to: moveStr.substring(2, 4),
        promotion: promotion
      });
    } else {
      move = game.move(moveStr);
    }

    if (!move) {
      console.log(`[Move Validation] chess.js rejected move: ${moveStr}`);
      const validation = await validateMove(moveStr, context);
      
      if (!validation.isValid) {
        console.log(`[Move Validation] Referee also rejected: ${validation.reason}`);
      }
      
      if (!validation.isValid) {
        const newInvalidMoves = [...previousInvalidMoves, moveStr];
        
        io.emit('moveRejected', { 
          player: isWhiteTurn ? 'white' : 'black',
          move: moveStr,
          reason: validation.reason || 'Invalid move',
          retryCount: retryCount + 1
        });
        
        emitLog('error', `[${playerAI.name}] Invalid move "${moveStr}": ${validation.reason}`);
        
        if (retryCount < MAX_RETRIES) {
          gameState.lastInvalidMoves = newInvalidMoves;
          gameState.lastRefereeFeedback = validation.reason || 'Invalid move according to chess rules';
          
          emitLog('info', `[${playerAI.name}] Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
          setTimeout(() => makeMove(retryCount + 1), 500);
          return;
        } else {
          gameState.lastInvalidMoves = [];
          gameState.lastRefereeFeedback = null;
          emitLog('error', `[${playerAI.name}] Failed after ${MAX_RETRIES} attempts`);
          io.emit('moveError', { 
            player: isWhiteTurn ? 'white' : 'black',
            error: `Failed to make valid move after ${MAX_RETRIES} attempts. Last attempt: ${moveStr}` 
          });
          return;
        }
      }
      
      move = game.move(moveStr);
    }

    if (move) {
      const thinkingTime = Date.now() - thinkingStartTime;
      
      if (isWhiteTurn) {
        gameState.whiteThinkingTime = thinkingTime;
        gameState.whiteTime += thinkingTime;
      } else {
        gameState.blackThinkingTime = thinkingTime;
        gameState.blackTime += thinkingTime;
      }
      
      emitLog('move', `[${playerAI.name}] Played: ${move.san} (${(thinkingTime / 1000).toFixed(1)}s)`);
      
      const commentary = await getAICommentary(playerAI, context, isWhiteTurn ? 'white' : 'black', move.san, move.captured);
      
      io.emit('aiCommentary', {
        player: isWhiteTurn ? 'white' : 'black',
        aiName: playerAI.name,
        move: move.san,
        commentary: commentary,
        captured: move.captured
      });
      
      gameState.round++;
      if (isWhiteTurn) {
        gameState.whiteMoves++;
        gameState.currentTurn = 'black';
      } else {
        gameState.blackMoves++;
        gameState.currentTurn = 'white';
      }

      const captured = getCapturedPieces();
      gameState.whiteCaptured = captured.whiteCaptured;
      gameState.blackCaptured = captured.blackCaptured;

      gameState.moveHistory.push({
        round: gameState.round,
        player: isWhiteTurn ? 'white' : 'black',
        aiName: playerAI.name,
        move: move.san || `${move.from}-${move.to}`,
        from: move.from,
        to: move.to,
        thinkingTime: thinkingTime,
        timestamp: Date.now()
      });

      updatePieces();
      
      gameState.lastInvalidMoves = [];
      gameState.lastRefereeFeedback = null;
      gameState.isThinking = false;
      gameState.thinkingPlayer = null;
      gameState.thinkingStartTime = null;
      
      const gameContext = getGameContext();
      const isCheck = game.isCheck();
      const isCheckmate = game.isCheckmate();
      
      io.emit('moveMade', {
        move: move,
        player: isWhiteTurn ? 'white' : 'black',
        aiName: playerAI.name,
        thinkingTime: thinkingTime,
        commentary: commentary,
        isCheck: isCheck,
        isCheckmate: isCheckmate,
        gameState: {
          ...gameState,
          ...gameContext
        }
      });

      if (game.isGameOver()) {
        gameState.isGameActive = false;
        let result = 'draw';
        let reason = 'draw';
        
        if (game.isCheckmate()) {
          result = game.turn() === 'w' ? 'black' : 'white';
          reason = 'checkmate';
        } else if (game.isStalemate()) {
          reason = 'stalemate';
        } else if (game.isDraw()) {
          if (game.isThreefoldRepetition()) {
            reason = 'threefold repetition';
          } else if (game.isInsufficientMaterial()) {
            reason = 'insufficient material';
          } else {
            reason = 'draw (50 move rule or other)';
          }
        }
        
        gameState.isThinking = false;
        gameState.thinkingPlayer = null;
        gameState.thinkingStartTime = null;
        
        console.log(`[Game Over] Result: ${result}, Reason: ${reason}`);
        console.log(`[Game Over] Final FEN: ${game.fen()}`);
        console.log(`[Game Over] Total moves: ${game.history().length}`);
        console.log(`[Game Over] White AI: ${currentWhiteAI.name}, Black AI: ${currentBlackAI.name}`);
        
        io.emit('gameOver', { 
          result, 
          reason, 
          drawReason: reason,
          whiteAI: currentWhiteAI.name,
          blackAI: currentBlackAI.name,
          finalStats: {
            whiteMoves: gameState.whiteMoves,
            blackMoves: gameState.blackMoves,
            whiteTime: gameState.whiteTime,
            blackTime: gameState.blackTime,
            whiteCaptured: gameState.whiteCaptured,
            blackCaptured: gameState.blackCaptured
          }
        });
        
        let countdown = 10;
        const countdownInterval = setInterval(() => {
          io.emit('nextGameCountdown', { seconds: countdown });
          countdown--;
          if (countdown < 0) {
            clearInterval(countdownInterval);
            const newPair = selectRandomAIPair();
            currentWhiteAI = newPair.white;
            currentBlackAI = newPair.black;
            console.log(`[New Game] Selected: ${currentWhiteAI.name} (White) vs ${currentBlackAI.name} (Black)`);
            startNewGame();
          }
        }, 1000);
      } else {
        setTimeout(() => makeMove(0), 1000);
      }
    } else {
      const validation = await validateMove(moveStr, context);
      const newInvalidMoves = [...previousInvalidMoves, moveStr];
      
      io.emit('moveRejected', { 
        player: isWhiteTurn ? 'white' : 'black',
        move: moveStr,
        reason: validation.reason || 'Invalid move',
        retryCount: retryCount + 1
      });
      
      if (retryCount < MAX_RETRIES) {
        gameState.lastInvalidMoves = newInvalidMoves;
        gameState.lastRefereeFeedback = validation.reason || 'Invalid move according to chess rules';
        
        setTimeout(() => makeMove(retryCount + 1), 500);
      } else {
        gameState.lastInvalidMoves = [];
        gameState.lastRefereeFeedback = null;
        io.emit('moveError', { 
          player: isWhiteTurn ? 'white' : 'black',
          error: `Failed to make valid move after ${MAX_RETRIES} attempts. Last attempt: ${moveStr}` 
        });
      }
    }
  } catch (error) {
    const newInvalidMoves = [...previousInvalidMoves, moveStr];
    
    if (retryCount < MAX_RETRIES) {
      gameState.lastInvalidMoves = newInvalidMoves;
      gameState.lastRefereeFeedback = error.message;
      
      setTimeout(() => makeMove(retryCount + 1), 500);
    } else {
      gameState.lastInvalidMoves = [];
      gameState.lastRefereeFeedback = null;
      io.emit('moveError', { 
        player: isWhiteTurn ? 'white' : 'black',
        error: error.message 
      });
    }
  }
}

function startNewGame() {
  if (!currentWhiteAI || !currentBlackAI) {
    const pair = selectRandomAIPair();
    currentWhiteAI = pair.white;
    currentBlackAI = pair.black;
  }
  
  game = new Chess();
  gameState = {
    round: 0,
    currentTurn: 'white',
    whiteMoves: 0,
    blackMoves: 0,
    whiteTime: 0,
    blackTime: 0,
    whiteThinkingTime: 0,
    blackThinkingTime: 0,
    gameStartTime: Date.now(),
    isGameActive: true,
    isThinking: false,
    thinkingPlayer: null,
    thinkingStartTime: null,
    whitePieces: [],
    blackPieces: [],
    lastInvalidMoves: [],
    lastRefereeFeedback: null,
    moveHistory: [],
    whiteCaptured: [],
    blackCaptured: []
  };
  
  updatePieces();
  
  io.emit('gameStarted', {
    whiteAI: currentWhiteAI.name,
    blackAI: currentBlackAI.name,
    whiteAIModel: currentWhiteAI.model,
    blackAIModel: currentBlackAI.model,
    gameState: {
      ...gameState,
      ...getGameContext()
    }
  });
  
  setTimeout(() => makeMove(), 2000);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.emit('gameState', {
    whiteAI: currentWhiteAI ? currentWhiteAI.name : 'Waiting...',
    blackAI: currentBlackAI ? currentBlackAI.name : 'Waiting...',
    whiteAIModel: currentWhiteAI ? currentWhiteAI.model : null,
    blackAIModel: currentBlackAI ? currentBlackAI.model : null,
    isThinking: gameState.isThinking,
    thinkingPlayer: gameState.thinkingPlayer,
    thinkingStartTime: gameState.thinkingStartTime,
    gameState: {
      ...gameState,
      ...getGameContext()
    }
  });

  socket.on('startGame', () => {
    if (!gameState.isGameActive) {
      startNewGame();
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/config', (req, res) => {
  res.json({ 
    contract: process.env.CONTRACT || '',
    dev: process.env.DEV || ''
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('[ERROR] OPENROUTER_API_KEY is not set! Please set it in .env file.');
    return;
  }
  
  console.log('\n========== CONFIGURATION ==========');
  console.log(`API Key: ${process.env.OPENROUTER_API_KEY.substring(0, 15)}...`);
  console.log(`AI_LOG: ${AI_LOG ? 'ENABLED' : 'DISABLED'}`);
  console.log('\nAvailable AI Models:');
  AI_MODELS.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.name} -> ${m.model}`);
  });
  console.log(`\nReferee: ${REFEREE_AI.name} -> ${REFEREE_AI.model}`);
  console.log('====================================\n');
  
  if (!gameState.isGameActive) {
    const pair = selectRandomAIPair(true);
    currentWhiteAI = pair.white;
    currentBlackAI = pair.black;
    console.log(`[Initial Game] WHITE: ${currentWhiteAI.name} (${currentWhiteAI.model})`);
    console.log(`[Initial Game] BLACK: ${currentBlackAI.name} (${currentBlackAI.model})`);
    startNewGame();
  }
});
