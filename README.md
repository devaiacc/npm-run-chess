# npm run chess 🎮

A real-time AI vs AI chess streaming platform where different AI models compete against each other. Watch as GPT, Claude, Gemini, Grok, and other AI models battle it out on a beautiful 3D chess board!

![Chess Board](https://img.shields.io/badge/Chess-3D-green) ![Node.js](https://img.shields.io/badge/Node.js-v18+-blue) ![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-orange) ![Three.js](https://img.shields.io/badge/Three.js-3D_Graphics-purple)

## 🎯 Features

### Core Gameplay
- **AI vs AI Chess**: Two randomly selected AI models play against each other
- **AI Referee**: A third AI validates all moves to ensure fair play
- **Auto-Restart**: New game starts automatically with different AI models after each match
- **Move Validation**: Robust retry mechanism (5 attempts) for invalid AI moves

### 3D Visualization
- **Three.js Chess Board**: Beautiful 3D rendered chess board and pieces
- **Cinematic Camera**: Smooth camera movements during AI thinking
- **Piece Animations**: Arc trajectory movement animations for pieces
- **Capture Effects**: Dramatic throw animation when pieces are captured
- **Dynamic Highlighting**: Green for moves, red for captures
- **Camera Rotation**: Camera rotates to face the current player's perspective

### Real-time Features
- **Live Streaming**: All moves broadcast to all connected viewers via Socket.io
- **Thinking Indicators**: Real-time display of AI thinking time
- **Move History**: Complete move list with thinking times
- **AI Commentary**: Each AI explains their strategic thinking before moves
- **AI Thinking Log**: Live feed of AI requests and responses
- **Game Alerts**: CHECK, CHECKMATE, STALEMATE, and DRAW notifications

### Statistics Display
- **Round Counter**: Current game round
- **Total Game Time**: Running timer for the match
- **Per-Player Stats**: Move count, total thinking time, average thinking time
- **Captured Pieces**: Visual display of captured pieces for each side

### UI/UX
- **Dark Theme**: Modern dark aesthetic design
- **Responsive Design**: Works on desktop and mobile devices
- **Full-Screen Layout**: No scrolling required on desktop
- **Typewriter Effect**: AI commentary appears with typing animation

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.io
- **Chess Logic**: chess.js
- **3D Graphics**: Three.js
- **AI Integration**: OpenRouter API (supports multiple AI models)
- **Deployment**: Heroku

## 📦 Installation

### Prerequisites
- Node.js v18 or higher
- npm or yarn
- OpenRouter API key

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ai-chess.git
cd ai-chess
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
OPENROUTER_API_KEY=your_openrouter_api_key
AI_LOG=true
CONTRACT=your_contract_address
DEV=your_developer_link
```

4. Start the server:
```bash
npm start
```

5. Open your browser and navigate to `http://localhost:3000`

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key for AI model access | Yes |
| `AI_LOG` | Enable/disable detailed AI logging (`true`/`false`) | No |
| `CONTRACT` | Contract address displayed in header | No |
| `DEV` | Developer link displayed in header | No |

## 🤖 Supported AI Models

The platform supports various AI models through OpenRouter:

- **OpenAI**: GPT-4o, GPT-4o-mini, GPT-3.5-turbo
- **Anthropic**: Claude Sonnet 4.5, Claude Sonnet 4
- **Google**: Gemini 2.5 Flash, Gemini 2.0 Flash
- **xAI**: Grok 4.1 Fast
- **DeepSeek**: DeepSeek Chat V3
- **Meta**: Llama 4 Scout

## 🎮 How It Works

1. **Game Start**: Two AI models are randomly selected (ensuring they're different)
2. **Move Generation**: The current player AI receives the board state and legal moves
3. **Move Validation**: AI's move is validated by chess.js and an AI referee
4. **Retry Mechanism**: If a move is invalid, the AI gets feedback and retries (up to 5 times)
5. **Broadcasting**: Valid moves are broadcast to all viewers in real-time
6. **Animation**: The 3D board animates the piece movement
7. **Next Turn**: Camera rotates and the other AI begins thinking
8. **Game End**: On checkmate/stalemate/draw, a new game starts after countdown

## 📁 Project Structure

```
ai-chess/
├── server.js           # Main server file with game logic and AI integration
├── public/
│   ├── index.html      # Main HTML structure
│   ├── style.css       # Styling and animations
│   ├── main.js         # Client-side game logic and Socket.io
│   └── chess3d.js      # Three.js 3D chess board implementation
├── package.json        # Dependencies and scripts
├── Procfile           # Heroku deployment configuration
└── .env               # Environment variables (not in repo)
```

## 🚀 Deployment

### Heroku

1. Create a Heroku app:
```bash
heroku create your-app-name
```

2. Set environment variables:
```bash
heroku config:set OPENROUTER_API_KEY=your_key
heroku config:set AI_LOG=false
```

3. Deploy:
```bash
git push heroku main
```

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serves the main chess application |
| `/api/config` | GET | Returns public configuration (contract, dev link) |

## 🔄 Socket Events

### Server → Client
| Event | Description |
|-------|-------------|
| `gameStarted` | New game has started with AI players info |
| `gameState` | Current game state update |
| `aiThinking` | AI has started thinking |
| `moveMade` | A move has been made |
| `gameOver` | Game has ended |
| `nextGameCountdown` | Countdown to next game |
| `aiLog` | AI thinking log entry |
| `aiCommentary` | AI's strategic commentary |

### Client → Server
| Event | Description |
|-------|-------------|
| `connection` | Client connected |
| `disconnect` | Client disconnected |

## 🎨 Customization

### Changing AI Models
Edit the `AI_PLAYERS` array in `server.js` to add or remove AI models.

### Adjusting Camera
Modify constants in `chess3d.js`:
- `CAMERA_NORMAL_RADIUS` - Distance from board
- `CAMERA_NORMAL_HEIGHT` - Camera height
- `CAMERA_ZOOM_RADIUS` - Zoom distance for moves

### Piece Colors
Edit `PIECE_COLORS` in `chess3d.js` to change piece appearances.

## 📄 License

ISC License

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

Made with ♟️ by AI Chess Team
