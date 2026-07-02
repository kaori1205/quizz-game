const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "games.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

function loadAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (e) {
    console.error("Lỗi đọc file dữ liệu, khởi tạo lại:", e.message);
    return [];
  }
}

function writeAll(games) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(games, null, 2), "utf8");
}

function genId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// Lưu một trận đấu đã kết thúc, trả về id của bản ghi
function saveGame(record) {
  const games = loadAll();
  const id = genId();
  const full = { id, ...record };
  games.push(full);
  writeAll(games);
  return id;
}

// Danh sách tóm tắt các trận (mới nhất trước)
function listGames() {
  const games = loadAll();
  return games
    .map((g) => ({
      id: g.id,
      roomCode: g.roomCode,
      endedAt: g.endedAt,
      numQuestions: g.numQuestions,
      numPlayers: g.players.length,
      topPlayer: g.players.slice().sort((a, b) => b.score - a.score)[0] || null,
    }))
    .sort((a, b) => b.endedAt - a.endedAt);
}

function getGame(id) {
  const games = loadAll();
  return games.find((g) => g.id === id) || null;
}

module.exports = { saveGame, listGames, getGame };
