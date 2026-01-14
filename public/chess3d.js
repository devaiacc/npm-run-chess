let scene, camera, renderer, board3D;
let pieces3D = {};
let squares3D = {};
let currentTurn3D = 'white';
let targetCameraAngle = 0;
let currentCameraAngle = 0;
let isThinking3D = false;
let cinematicTime = 0;
let isAnimatingMove = false;
let animationPhase = 'idle';
let pendingMoveData = null;

const BOARD_SIZE = 8;
const SQUARE_SIZE = 1;
const PIECE_COLORS = {
    white: 0x494949,
    black: 0x1a1a1a
};

const PIECE_GEOMETRIES = {};
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const CAMERA_NORMAL_RADIUS = 11;
const CAMERA_NORMAL_HEIGHT = 9;
const CAMERA_ZOOM_RADIUS = 6;
const CAMERA_ZOOM_HEIGHT = 5;

let cameraTargetPos = { x: 0, y: CAMERA_NORMAL_HEIGHT, z: CAMERA_NORMAL_RADIUS };
let cameraLookAt = { x: 0, y: 0, z: 0 };

function init3DChess() {
    const container = document.getElementById('chess-board-3d');
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
    camera.position.set(0, CAMERA_NORMAL_HEIGHT, CAMERA_NORMAL_RADIUS);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(8, 20, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 4096;
    dirLight.shadow.mapSize.height = 4096;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x4080ff, 0.3);
    fillLight.position.set(-10, 10, -10);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xff8040, 0.2);
    rimLight.position.set(0, 5, -15);
    scene.add(rimLight);

    createBoard();
    createPieceGeometries();
    updateBoard3D(INITIAL_FEN);
    
    window.addEventListener('resize', onWindowResize);
    animate();
}

function createBoard() {
    board3D = new THREE.Group();
    
    const baseGeometry = new THREE.BoxGeometry(BOARD_SIZE + 0.8, 0.5, BOARD_SIZE + 0.8);
    const baseMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4a3728,
        roughness: 0.6,
        metalness: 0.1
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = -0.3;
    base.receiveShadow = true;
    base.castShadow = true;
    board3D.add(base);

    const borderGeometry = new THREE.BoxGeometry(BOARD_SIZE + 0.5, 0.15, BOARD_SIZE + 0.5);
    const borderMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2d1f15,
        roughness: 0.4,
        metalness: 0.2
    });
    const border = new THREE.Mesh(borderGeometry, borderMaterial);
    border.position.y = -0.02;
    border.receiveShadow = true;
    board3D.add(border);

    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let z = 0; z < BOARD_SIZE; z++) {
            const isLight = (x + z) % 2 === 0;
            const baseColor = isLight ? 0xf0d9b5 : 0xb58863;
            const geometry = new THREE.BoxGeometry(SQUARE_SIZE * 0.98, 0.08, SQUARE_SIZE * 0.98);
            const material = new THREE.MeshStandardMaterial({
                color: baseColor,
                roughness: 0.8,
                metalness: 0.05,
                emissive: 0x000000,
                emissiveIntensity: 0
            });
            const square = new THREE.Mesh(geometry, material);
            const posX = x - BOARD_SIZE / 2 + 0.5;
            const posZ = z - BOARD_SIZE / 2 + 0.5;
            square.position.set(posX, 0.04, posZ);
            square.receiveShadow = true;
            
            const squareName = String.fromCharCode(97 + x) + (8 - z);
            square.userData = { 
                file: x, 
                rank: 7 - z,
                baseColor: baseColor,
                square: squareName
            };
            squares3D[squareName] = square;
            board3D.add(square);
        }
    }

    scene.add(board3D);
}

function createPieceGeometries() {
    PIECE_GEOMETRIES.p = { type: 'pawn', height: 0.7 };
    PIECE_GEOMETRIES.r = { type: 'rook', height: 0.85 };
    PIECE_GEOMETRIES.n = { type: 'knight', height: 0.9 };
    PIECE_GEOMETRIES.b = { type: 'bishop', height: 1.0 };
    PIECE_GEOMETRIES.q = { type: 'queen', height: 1.15 };
    PIECE_GEOMETRIES.k = { type: 'king', height: 1.25 };
}

function createPiece(type, color) {
    const pieceType = type.toLowerCase();
    const geomData = PIECE_GEOMETRIES[pieceType];
    if (!geomData) return null;

    const group = new THREE.Group();
    
    const material = new THREE.MeshStandardMaterial({
        color: PIECE_COLORS[color],
        roughness: color === 'white' ? 0.35 : 0.5,
        metalness: 0.05
    });

    const h = geomData.height;

    const baseGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.12, 32);
    const baseMesh = new THREE.Mesh(baseGeo, material);
    baseMesh.position.y = 0.06;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    if (pieceType === 'p') {
        const bodyGeo = new THREE.CylinderGeometry(0.12, 0.25, h * 0.5, 24);
        const bodyMesh = new THREE.Mesh(bodyGeo, material);
        bodyMesh.position.y = h * 0.35;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        const headGeo = new THREE.SphereGeometry(0.18, 24, 24);
        const headMesh = new THREE.Mesh(headGeo, material);
        headMesh.position.y = h * 0.75;
        headMesh.castShadow = true;
        group.add(headMesh);
    } 
    else if (pieceType === 'r') {
        const bodyGeo = new THREE.CylinderGeometry(0.22, 0.28, h * 0.6, 24);
        const bodyMesh = new THREE.Mesh(bodyGeo, material);
        bodyMesh.position.y = h * 0.4;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        const topGeo = new THREE.CylinderGeometry(0.28, 0.22, h * 0.2, 24);
        const topMesh = new THREE.Mesh(topGeo, material);
        topMesh.position.y = h * 0.8;
        topMesh.castShadow = true;
        group.add(topMesh);

        for (let i = 0; i < 4; i++) {
            const crenelGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
            const crenel = new THREE.Mesh(crenelGeo, material);
            const angle = (i / 4) * Math.PI * 2;
            crenel.position.set(Math.cos(angle) * 0.18, h * 0.95, Math.sin(angle) * 0.18);
            crenel.castShadow = true;
            group.add(crenel);
        }
    }
    else if (pieceType === 'n') {
        const bodyGeo = new THREE.CylinderGeometry(0.15, 0.26, h * 0.45, 24);
        const bodyMesh = new THREE.Mesh(bodyGeo, material);
        bodyMesh.position.y = h * 0.32;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        const neckGeo = new THREE.CylinderGeometry(0.12, 0.15, h * 0.3, 24);
        const neckMesh = new THREE.Mesh(neckGeo, material);
        neckMesh.position.y = h * 0.55;
        neckMesh.position.z = 0.05;
        neckMesh.rotation.x = -0.3;
        neckMesh.castShadow = true;
        group.add(neckMesh);

        const headGeo = new THREE.SphereGeometry(0.15, 24, 24);
        headGeo.scale(1, 1.3, 0.8);
        const headMesh = new THREE.Mesh(headGeo, material);
        headMesh.position.y = h * 0.78;
        headMesh.position.z = 0.12;
        headMesh.castShadow = true;
        group.add(headMesh);

        const earGeo = new THREE.ConeGeometry(0.06, 0.15, 12);
        const earMesh = new THREE.Mesh(earGeo, material);
        earMesh.position.set(0, h * 0.95, 0.08);
        earMesh.rotation.x = -0.3;
        earMesh.castShadow = true;
        group.add(earMesh);
    }
    else if (pieceType === 'b') {
        const bodyGeo = new THREE.CylinderGeometry(0.1, 0.26, h * 0.55, 24);
        const bodyMesh = new THREE.Mesh(bodyGeo, material);
        bodyMesh.position.y = h * 0.38;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        const middleGeo = new THREE.SphereGeometry(0.15, 24, 24);
        const middleMesh = new THREE.Mesh(middleGeo, material);
        middleMesh.position.y = h * 0.65;
        middleMesh.castShadow = true;
        group.add(middleMesh);

        const topGeo = new THREE.ConeGeometry(0.12, h * 0.35, 24);
        const topMesh = new THREE.Mesh(topGeo, material);
        topMesh.position.y = h * 0.88;
        topMesh.castShadow = true;
        group.add(topMesh);
    }
    else if (pieceType === 'q') {
        const bodyGeo = new THREE.CylinderGeometry(0.12, 0.3, h * 0.6, 24);
        const bodyMesh = new THREE.Mesh(bodyGeo, material);
        bodyMesh.position.y = h * 0.38;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        const middleGeo = new THREE.SphereGeometry(0.18, 24, 24);
        const middleMesh = new THREE.Mesh(middleGeo, material);
        middleMesh.position.y = h * 0.7;
        middleMesh.castShadow = true;
        group.add(middleMesh);

        const crownGeo = new THREE.CylinderGeometry(0.08, 0.15, h * 0.15, 24);
        const crownMesh = new THREE.Mesh(crownGeo, material);
        crownMesh.position.y = h * 0.85;
        crownMesh.castShadow = true;
        group.add(crownMesh);

        for (let i = 0; i < 5; i++) {
            const spikeGeo = new THREE.ConeGeometry(0.04, 0.12, 8);
            const spike = new THREE.Mesh(spikeGeo, material);
            const angle = (i / 5) * Math.PI * 2;
            spike.position.set(Math.cos(angle) * 0.1, h * 0.98, Math.sin(angle) * 0.1);
            spike.castShadow = true;
            group.add(spike);
        }

        const ballGeo = new THREE.SphereGeometry(0.06, 16, 16);
        const ballMesh = new THREE.Mesh(ballGeo, material);
        ballMesh.position.y = h * 1.05;
        ballMesh.castShadow = true;
        group.add(ballMesh);
    }
    else if (pieceType === 'k') {
        const bodyGeo = new THREE.CylinderGeometry(0.14, 0.3, h * 0.55, 24);
        const bodyMesh = new THREE.Mesh(bodyGeo, material);
        bodyMesh.position.y = h * 0.35;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        const middleGeo = new THREE.SphereGeometry(0.18, 24, 24);
        const middleMesh = new THREE.Mesh(middleGeo, material);
        middleMesh.position.y = h * 0.65;
        middleMesh.castShadow = true;
        group.add(middleMesh);

        const collarGeo = new THREE.CylinderGeometry(0.12, 0.16, h * 0.1, 24);
        const collarMesh = new THREE.Mesh(collarGeo, material);
        collarMesh.position.y = h * 0.78;
        collarMesh.castShadow = true;
        group.add(collarMesh);

        const cross1Geo = new THREE.BoxGeometry(0.06, 0.25, 0.06);
        const cross1Mesh = new THREE.Mesh(cross1Geo, material);
        cross1Mesh.position.y = h * 0.98;
        cross1Mesh.castShadow = true;
        group.add(cross1Mesh);

        const cross2Geo = new THREE.BoxGeometry(0.18, 0.06, 0.06);
        const cross2Mesh = new THREE.Mesh(cross2Geo, material);
        cross2Mesh.position.y = h * 1.02;
        cross2Mesh.castShadow = true;
        group.add(cross2Mesh);
    }

    return group;
}

function squareToPosition(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;
    return {
        x: file - BOARD_SIZE / 2 + 0.5,
        z: (7 - rank) - BOARD_SIZE / 2 + 0.5
    };
}

function updateBoard3D(fen, skipIfAnimating = false) {
    if (!scene) return;
    if (isAnimatingMove) {
        console.log('[3D] Blocked board update during animation');
        return;
    }

    Object.values(pieces3D).forEach(piece => {
        if (piece.parent) piece.parent.remove(piece);
    });
    pieces3D = {};
    lastSyncedFen = fen;

    const fenParts = fen.split(' ');
    const position = fenParts[0];
    const rows = position.split('/');

    for (let rank = 0; rank < 8; rank++) {
        let file = 0;
        const row = rows[7 - rank];
        
        for (let i = 0; i < row.length; i++) {
            const char = row[i];
            
            if (isNaN(char)) {
                const color = char === char.toUpperCase() ? 'white' : 'black';
                const pieceType = char.toLowerCase();
                const square = String.fromCharCode(97 + file) + (rank + 1);
                
                const piece = createPiece(pieceType, color);
                if (piece) {
                    const pos = squareToPosition(square);
                    piece.position.set(pos.x, 0.08, pos.z);
                    piece.userData = { square, pieceType, color };
                    scene.add(piece);
                    pieces3D[square] = piece;
                }
                file++;
            } else {
                file += parseInt(char);
            }
        }
    }
}

function highlightSquare(squareName, color) {
    const square = squares3D[squareName];
    if (!square) return;
    
    square.material.color = new THREE.Color(color);
    square.material.emissive = new THREE.Color(color);
    square.material.emissiveIntensity = 1.0;
}

function clearSquareHighlight(squareName) {
    const square = squares3D[squareName];
    if (!square) return;
    
    square.material.color = new THREE.Color(square.userData.baseColor);
    square.material.emissive = new THREE.Color(0x000000);
    square.material.emissiveIntensity = 0;
}

function clearAllHighlights() {
    Object.keys(squares3D).forEach(sq => clearSquareHighlight(sq));
}

function animateSquareHighlight(squareName, color, duration = 500) {
    const square = squares3D[squareName];
    if (!square) return;
    
    let startTime = null;
    const targetColor = new THREE.Color(color);
    
    function pulse(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const intensity = Math.sin(progress * Math.PI) * 0.8;
        square.material.emissive = targetColor;
        square.material.emissiveIntensity = intensity;
        
        if (progress < 1) {
            requestAnimationFrame(pulse);
        }
    }
    
    requestAnimationFrame(pulse);
}

let pendingFenSync = null;
let currentAnimationCallback = null;
let currentMoveFen = null;
let currentMoveToSquare = null;
let currentCastlingMove = null;
let lastSyncedFen = null;
let currentlyAnimatingPiece = null;
let currentlyCapturedPiece = null;
let currentAnimationId = 0;

function forceFinishAnimation() {
    if (animationPhase === 'idle') return;
    
    console.log('[3D] Force finishing animation, phase was:', animationPhase, 'toSquare:', currentMoveToSquare);
    
    currentAnimationId++;
    
    animationPhase = 'idle';
    clearAllHighlights();
    
    if (currentlyAnimatingPiece && currentMoveToSquare) {
        const toPos = squareToPosition(currentMoveToSquare);
        currentlyAnimatingPiece.position.set(toPos.x, 0.08, toPos.z);
        pieces3D[currentMoveToSquare] = currentlyAnimatingPiece;
        currentlyAnimatingPiece.userData.square = currentMoveToSquare;
        console.log('[3D] Force finish - piece moved to:', currentMoveToSquare);
    }
    
    if (currentlyCapturedPiece && currentlyCapturedPiece.parent) {
        currentlyCapturedPiece.parent.remove(currentlyCapturedPiece);
    }
    
    currentlyAnimatingPiece = null;
    currentlyCapturedPiece = null;
    
    if (currentMoveFen) {
        lastSyncedFen = currentMoveFen;
        currentMoveFen = null;
    }
    currentMoveToSquare = null;
    
    cameraTargetPos = {
        x: Math.sin(targetCameraAngle) * CAMERA_NORMAL_RADIUS,
        y: CAMERA_NORMAL_HEIGHT,
        z: Math.cos(targetCameraAngle) * CAMERA_NORMAL_RADIUS
    };
    cameraLookAt = { x: 0, y: 0, z: 0 };
    
    currentCastlingMove = null;
}


function executeMove3D(fromSquare, toSquare, isCapture, capturedPieceType, captureSquare, fenAfterMove, castlingMove, callback) {
    console.log('[3D] executeMove3D called:', fromSquare, '->', toSquare, 'isCapture:', isCapture);
    
    isAnimatingMove = true;
    
    if (animationPhase !== 'idle') {
        console.log('[3D] Previous animation in progress (phase:', animationPhase, '), forcing finish');
        forceFinishAnimation();
        if (currentAnimationCallback) {
            currentAnimationCallback();
            currentAnimationCallback = null;
        }
    }
    
    animationPhase = 'starting';
    
    if (!pieces3D[fromSquare]) {
        console.log('[3D] Piece not found at', fromSquare, '- available:', Object.keys(pieces3D).join(', '));
        isAnimatingMove = false;
        animationPhase = 'idle';
        if (fenAfterMove) {
            updateBoard3D(fenAfterMove, false);
        }
        if (callback) callback();
        return;
    }
    
    console.log('[3D] Found piece at', fromSquare, '- starting animation to', toSquare);
    
    currentAnimationCallback = callback;
    currentMoveFen = fenAfterMove;
    currentMoveToSquare = toSquare;
    currentCastlingMove = castlingMove;
    animationPhase = 'zoom';
    
    const piece = pieces3D[fromSquare];
    const fromPos = squareToPosition(fromSquare);
    const toPos = squareToPosition(toSquare);
    
    if (pieces3D[toSquare] && pieces3D[toSquare] !== piece && !isCapture) {
        const ghostPiece = pieces3D[toSquare];
        if (ghostPiece.parent) ghostPiece.parent.remove(ghostPiece);
        delete pieces3D[toSquare];
    }
    
    piece.position.set(fromPos.x, 0.08, fromPos.z);
    
    const midX = (fromPos.x + toPos.x) / 2;
    const midZ = (fromPos.z + toPos.z) / 2;
    
    const highlightColor = isCapture ? 0xff2222 : 0x22ff22;
    highlightSquare(toSquare, highlightColor);
    highlightSquare(fromSquare, 0x22aaff);
    
    const actualCaptureSquare = captureSquare || toSquare;
    if (isCapture && captureSquare && captureSquare !== toSquare) {
        highlightSquare(captureSquare, 0xff2222);
    }
    
    const dx = toPos.x - fromPos.x;
    const dz = toPos.z - fromPos.z;
    const cameraAngle = Math.atan2(dx, dz) + Math.PI;
    
    cameraTargetPos = {
        x: midX + Math.sin(cameraAngle) * CAMERA_ZOOM_RADIUS,
        y: CAMERA_ZOOM_HEIGHT,
        z: midZ + Math.cos(cameraAngle) * CAMERA_ZOOM_RADIUS
    };
    cameraLookAt = { x: midX, y: 0.3, z: midZ };
    
    currentlyAnimatingPiece = piece;
    
    let capturedPiece = null;
    if (isCapture) {
        if (pieces3D[actualCaptureSquare]) {
            capturedPiece = pieces3D[actualCaptureSquare];
            delete pieces3D[actualCaptureSquare];
            currentlyCapturedPiece = capturedPiece;
        }
    }
    
    delete pieces3D[fromSquare];
    
    currentAnimationId++;
    const thisAnimId = currentAnimationId;
    
    setTimeout(() => {
        if (thisAnimId !== currentAnimationId) return;
        
        animationPhase = 'move';
        
        if (capturedPiece) {
            animatePieceCapture(capturedPiece);
            if (capturedPieceType) {
                show3DNotification('CAPTURED', capturedPieceType);
            }
        } else if (isCapture && capturedPieceType) {
            show3DNotification('CAPTURED', capturedPieceType);
        }
        
        animatePieceMove(piece, fromPos, toPos, () => {
            if (thisAnimId !== currentAnimationId) return;
            
            pieces3D[toSquare] = piece;
            piece.userData.square = toSquare;
            currentlyAnimatingPiece = null;
            currentlyCapturedPiece = null;
            
            setTimeout(() => {
                if (thisAnimId !== currentAnimationId) return;
                
                animationPhase = 'return';
                clearAllHighlights();
                
                cameraTargetPos = {
                    x: Math.sin(targetCameraAngle) * CAMERA_NORMAL_RADIUS,
                    y: CAMERA_NORMAL_HEIGHT,
                    z: Math.cos(targetCameraAngle) * CAMERA_NORMAL_RADIUS
                };
                cameraLookAt = { x: 0, y: 0, z: 0 };
                
                setTimeout(() => {
                    if (thisAnimId !== currentAnimationId) return;
                    
                    animationPhase = 'idle';
                    
                    if (currentCastlingMove) {
                        handleCastling3D(currentCastlingMove);
                        currentCastlingMove = null;
                    }
                    
                    const fenToSync = currentMoveFen;
                    currentMoveFen = null;
                    currentMoveToSquare = null;
                    pendingFenSync = null;
                    
                    const cb = currentAnimationCallback;
                    currentAnimationCallback = null;
                    
                    isAnimatingMove = false;
                    
                    if (fenToSync) {
                        updateBoard3D(fenToSync, false);
                        lastSyncedFen = fenToSync;
                    }
                    
                    if (cb) cb();
                }, 1200);
            }, 400);
        });
    }, 800);
}


const PIECE_NAMES = {
    'p': 'PAWN',
    'n': 'KNIGHT', 
    'b': 'BISHOP',
    'r': 'ROOK',
    'q': 'QUEEN',
    'k': 'KING'
};

function show3DNotification(type, extra) {
    const container = document.getElementById('chess-board-3d');
    if (!container) return;
    
    let existingNotif = container.querySelector('.chess3d-notification');
    if (existingNotif) existingNotif.remove();
    
    const notif = document.createElement('div');
    notif.className = 'chess3d-notification';
    
    let text = type;
    let colorClass = 'notif-default';
    
    if (type === 'CAPTURED' && extra) {
        const pieceName = PIECE_NAMES[extra.toLowerCase()] || extra.toUpperCase();
        text = `${pieceName} CAPTURED!`;
        colorClass = 'notif-capture';
    } else if (type === 'CHECK') {
        text = 'CHECK!';
        colorClass = 'notif-check';
    } else if (type === 'CHECKMATE') {
        text = 'CHECKMATE!';
        colorClass = 'notif-checkmate';
    } else if (type === 'STALEMATE') {
        text = 'STALEMATE!';
        colorClass = 'notif-draw';
    } else if (type === 'DRAW') {
        text = 'DRAW!';
        colorClass = 'notif-draw';
    }
    
    notif.classList.add(colorClass);
    notif.textContent = text;
    container.appendChild(notif);
    
    requestAnimationFrame(() => {
        notif.classList.add('show');
    });
    
    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 500);
    }, 1500);
}

window.show3DNotification = show3DNotification;

function animatePieceMove(piece, fromPos, toPos, callback) {
    const duration = 1200;
    const startTime = Date.now();
    const startY = 0.08;
    const peakHeight = 0.8;
    const animId = currentAnimationId;
    
    piece.position.set(fromPos.x, startY, fromPos.z);
    
    function animate() {
        if (animId !== currentAnimationId) {
            console.log('[3D] Animation cancelled (id mismatch)');
            return;
        }
        
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const eased = 1 - Math.pow(1 - progress, 3);
        
        piece.position.x = fromPos.x + (toPos.x - fromPos.x) * eased;
        piece.position.z = fromPos.z + (toPos.z - fromPos.z) * eased;
        
        const arcProgress = Math.sin(progress * Math.PI);
        piece.position.y = startY + arcProgress * peakHeight;
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            piece.position.set(toPos.x, startY, toPos.z);
            if (callback) callback();
        }
    }
    
    animate();
}

function animatePieceCapture(piece) {
    const duration = 800;
    const startTime = Date.now();
    const startY = piece.position.y;
    const startX = piece.position.x;
    const startZ = piece.position.z;
    const randomAngle = Math.random() * Math.PI * 2;
    const throwDistance = 0.6;
    const animId = currentAnimationId;
    
    function animate() {
        if (animId !== currentAnimationId) {
            if (piece.parent) piece.parent.remove(piece);
            return;
        }
        
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        piece.position.y = startY + Math.sin(progress * Math.PI) * 1.0 - progress * 3;
        piece.position.x = startX + Math.cos(randomAngle) * throwDistance * easeOut;
        piece.position.z = startZ + Math.sin(randomAngle) * throwDistance * easeOut;
        
        piece.rotation.x = progress * Math.PI * 1.5;
        piece.rotation.z = progress * Math.PI * 0.8;
        
        piece.scale.setScalar(1 - easeOut * 0.9);
        
        piece.traverse((child) => {
            if (child.material) {
                child.material.opacity = 1 - easeOut;
                child.material.transparent = true;
            }
        });
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            if (piece.parent) piece.parent.remove(piece);
        }
    }
    
    animate();
}

function setCameraTurn(turn) {
    currentTurn3D = turn;
    targetCameraAngle = turn === 'white' ? 0 : Math.PI;
    
    if (!isAnimatingMove) {
        cameraTargetPos = {
            x: Math.sin(targetCameraAngle) * CAMERA_NORMAL_RADIUS,
            y: CAMERA_NORMAL_HEIGHT,
            z: Math.cos(targetCameraAngle) * CAMERA_NORMAL_RADIUS
        };
        cameraLookAt = { x: 0, y: 0, z: 0 };
    }
}

function setThinking3D(thinking) {
    isThinking3D = thinking;
}

function onWindowResize() {
    const container = document.getElementById('chess-board-3d');
    if (!container || !camera || !renderer) return;
    
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    cinematicTime += 0.002;
    
    let targetX = cameraTargetPos.x;
    let targetY = cameraTargetPos.y;
    let targetZ = cameraTargetPos.z;
    
    if (isThinking3D && animationPhase === 'idle') {
        const wobble = Math.sin(cinematicTime) * 0.8;
        const baseAngle = targetCameraAngle + wobble * 0.1;
        targetX = Math.sin(baseAngle) * CAMERA_NORMAL_RADIUS;
        targetZ = Math.cos(baseAngle) * CAMERA_NORMAL_RADIUS;
        targetY = CAMERA_NORMAL_HEIGHT + Math.sin(cinematicTime * 0.7) * 0.5;
    }
    
    const lerpSpeed = animationPhase === 'zoom' ? 0.04 : 
                      animationPhase === 'return' ? 0.03 : 0.02;
    
    camera.position.x += (targetX - camera.position.x) * lerpSpeed;
    camera.position.y += (targetY - camera.position.y) * lerpSpeed;
    camera.position.z += (targetZ - camera.position.z) * lerpSpeed;
    
    const currentLookAt = new THREE.Vector3();
    camera.getWorldDirection(currentLookAt);
    
    const targetLookAtVec = new THREE.Vector3(cameraLookAt.x, cameraLookAt.y, cameraLookAt.z);
    camera.lookAt(targetLookAtVec);
    
    currentCameraAngle = Math.atan2(camera.position.x, camera.position.z);
    
    renderer.render(scene, camera);
}

window.addEventListener('load', () => {
    setTimeout(init3DChess, 50);
});

function handleCastling3D(move) {
    const isKingside = move.flags.includes('k');
    const rank = move.color === 'w' ? '1' : '8';
    
    let rookFrom, rookTo;
    if (isKingside) {
        rookFrom = 'h' + rank;
        rookTo = 'f' + rank;
    } else {
        rookFrom = 'a' + rank;
        rookTo = 'd' + rank;
    }
    
    const rook = pieces3D[rookFrom];
    if (rook) {
        const toPos = squareToPosition(rookTo);
        rook.position.x = toPos.x;
        rook.position.z = toPos.z;
        pieces3D[rookTo] = rook;
        delete pieces3D[rookFrom];
        rook.userData.square = rookTo;
    }
}

window.update3DBoard = updateBoard3D;
window.set3DCameraTurn = setCameraTurn;
window.set3DThinking = setThinking3D;
window.execute3DMove = executeMove3D;
window.handleCastling3D = handleCastling3D;
window.forceFinish3DAnimation = forceFinishAnimation;
window.sync3DBoard = syncBoardIfNeeded;
