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

// Xoá một trận đấu khỏi lịch sử, trả về true nếu xoá thành công
function deleteGame(id) {
  const games = loadAll();
  const next = games.filter((g) => g.id !== id);
  const changed = next.length !== games.length;
  if (changed) writeAll(next);
  return changed;
}

// ================== BỘ CÂU HỎI (tái sử dụng khi tạo phòng) ==================
// Lưu ở file riêng data/question-sets.json — hoàn toàn tách biệt với games.json,
// không ảnh hưởng gì tới lịch sử trận đấu hiện có.
const QSETS_FILE = path.join(DATA_DIR, "question-sets.json");

function ensureQSetsFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(QSETS_FILE)) fs.writeFileSync(QSETS_FILE, "[]", "utf8");
}

function loadQSets() {
  ensureQSetsFile();
  try {
    const raw = fs.readFileSync(QSETS_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (e) {
    console.error("Lỗi đọc file bộ câu hỏi, khởi tạo lại:", e.message);
    return [];
  }
}

function writeQSets(sets) {
  ensureQSetsFile();
  fs.writeFileSync(QSETS_FILE, JSON.stringify(sets, null, 2), "utf8");
}

// Chuẩn hoá + loại bỏ câu hỏi không hợp lệ (thiếu câu hỏi hoặc thiếu đủ 4 đáp án)
function sanitizeQuestions(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((q) => ({
      q: String((q && q.q) || "").trim().slice(0, 300),
      options: Array.isArray(q && q.options)
        ? q.options.slice(0, 4).map((o) => String(o || "").trim().slice(0, 120))
        : [],
      correct: Number.isInteger(q && q.correct) ? q.correct : 0,
      explanation: String((q && q.explanation) || "").trim().slice(0, 400),
    }))
    .filter((q) => q.q && q.options.length === 4 && q.options.every((o) => o));
}

// Danh sách tóm tắt các bộ câu hỏi (mới cập nhật trước)
function listQuestionSets() {
  return loadQSets()
    .map((s) => ({
      id: s.id,
      name: s.name,
      duration: s.duration,
      numQuestions: (s.questions || []).length,
      updatedAt: s.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function getQuestionSet(id) {
  return loadQSets().find((s) => s.id === id) || null;
}

function createQuestionSet(data) {
  const sets = loadQSets();
  const questions = sanitizeQuestions(data.questions);
  if (questions.length === 0) return null;
  const full = {
    id: genId(),
    name: String(data.name || "Bộ câu hỏi").trim().slice(0, 80) || "Bộ câu hỏi",
    duration: Number(data.duration) > 0 ? Number(data.duration) : 20,
    questions,
    updatedAt: Date.now(),
  };
  sets.push(full);
  writeQSets(sets);
  return full;
}

function updateQuestionSet(id, data) {
  const sets = loadQSets();
  const idx = sets.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const questions = sanitizeQuestions(data.questions);
  if (questions.length === 0) return null;
  sets[idx] = {
    ...sets[idx],
    name: String(data.name || sets[idx].name).trim().slice(0, 80) || sets[idx].name,
    duration: Number(data.duration) > 0 ? Number(data.duration) : sets[idx].duration,
    questions,
    updatedAt: Date.now(),
  };
  writeQSets(sets);
  return sets[idx];
}

function deleteQuestionSet(id) {
  const sets = loadQSets();
  const next = sets.filter((s) => s.id !== id);
  const changed = next.length !== sets.length;
  if (changed) writeQSets(next);
  return changed;
}

module.exports = {
  saveGame,
  listGames,
  getGame,
  deleteGame,
  listQuestionSets,
  getQuestionSet,
  createQuestionSet,
  updateQuestionSet,
  deleteQuestionSet,
};
