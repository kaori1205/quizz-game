const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("Thiếu biến môi trường MONGODB_URI — xem README phần cấu hình MongoDB.");
}

const client = new MongoClient(uri);
let gamesCol = null;
let qsetsCol = null;
let connecting = null;

function connect() {
  if (gamesCol) return Promise.resolve();
  if (!connecting) {
    connecting = client.connect().then(() => {
      const database = client.db(process.env.MONGODB_DB || "quizgame");
      gamesCol = database.collection("games");
      qsetsCol = database.collection("questionSets");
    });
  }
  return connecting;
}

function genId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// Bỏ _id (Mongo) và trả lại dạng {id, ...} như API cũ vẫn trả về
function withId(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

// Lưu một trận đấu đã kết thúc, trả về id của bản ghi
async function saveGame(record) {
  await connect();
  const id = genId();
  await gamesCol.insertOne({ _id: id, ...record });
  return id;
}

// Danh sách tóm tắt các trận (mới nhất trước).
// Chỉ lấy các field cần cho danh sách, bỏ qua "answers" (chiếm phần lớn dung lượng mỗi trận).
async function listGames() {
  await connect();
  const games = await gamesCol
    .find({}, { projection: { roomCode: 1, endedAt: 1, numQuestions: 1, players: 1 } })
    .sort({ endedAt: -1 })
    .toArray();
  return games.map((g) => ({
    id: g._id,
    roomCode: g.roomCode,
    endedAt: g.endedAt,
    numQuestions: g.numQuestions,
    numPlayers: g.players.length,
    topPlayer: g.players.slice().sort((a, b) => b.score - a.score)[0] || null,
  }));
}

async function getGame(id) {
  await connect();
  const g = await gamesCol.findOne({ _id: id });
  return withId(g);
}

// Xoá một trận đấu khỏi lịch sử, trả về true nếu xoá thành công
async function deleteGame(id) {
  await connect();
  const res = await gamesCol.deleteOne({ _id: id });
  return res.deletedCount > 0;
}

// ================== BỘ CÂU HỎI (tái sử dụng khi tạo phòng) ==================

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
async function listQuestionSets() {
  await connect();
  const sets = await qsetsCol
    .find({}, { projection: { name: 1, duration: 1, questions: 1, updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .toArray();
  return sets.map((s) => ({
    id: s._id,
    name: s.name,
    duration: s.duration,
    numQuestions: (s.questions || []).length,
    updatedAt: s.updatedAt,
  }));
}

async function getQuestionSet(id) {
  await connect();
  const s = await qsetsCol.findOne({ _id: id });
  return withId(s);
}

async function createQuestionSet(data) {
  await connect();
  const questions = sanitizeQuestions(data.questions);
  if (questions.length === 0) return null;
  const doc = {
    _id: genId(),
    name: String(data.name || "Bộ câu hỏi").trim().slice(0, 80) || "Bộ câu hỏi",
    duration: Number(data.duration) > 0 ? Number(data.duration) : 20,
    questions,
    updatedAt: Date.now(),
  };
  await qsetsCol.insertOne(doc);
  return withId(doc);
}

async function updateQuestionSet(id, data) {
  await connect();
  const existing = await qsetsCol.findOne({ _id: id });
  if (!existing) return null;
  const questions = sanitizeQuestions(data.questions);
  if (questions.length === 0) return null;
  const changes = {
    name: String(data.name || existing.name).trim().slice(0, 80) || existing.name,
    duration: Number(data.duration) > 0 ? Number(data.duration) : existing.duration,
    questions,
    updatedAt: Date.now(),
  };
  await qsetsCol.updateOne({ _id: id }, { $set: changes });
  return withId({ ...existing, ...changes });
}

async function deleteQuestionSet(id) {
  await connect();
  const res = await qsetsCol.deleteOne({ _id: id });
  return res.deletedCount > 0;
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
