require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const db = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const QUESTION_DURATION = 20000; // 20 giây mỗi câu

// Bộ câu hỏi mặc định — có thể sửa/thêm tuỳ ý
const DEFAULT_QUESTIONS = [
  { q: "Thủ đô của Việt Nam là gì?", options: ["TP. Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Huế"], correct: 1 },
  { q: "Hành tinh nào gần Mặt Trời nhất?", options: ["Trái Đất", "Sao Kim", "Sao Thủy", "Sao Hỏa"], correct: 2 },
  { q: "1 + 2 x 3 bằng bao nhiêu?", options: ["9", "7", "6", "5"], correct: 1 },
  { q: "Đại dương nào lớn nhất thế giới?", options: ["Đại Tây Dương", "Ấn Độ Dương", "Bắc Băng Dương", "Thái Bình Dương"], correct: 3 },
  { q: "Ngôn ngữ lập trình nào chạy được trên trình duyệt?", options: ["Python", "JavaScript", "C++", "Java"], correct: 1 },
];

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ---- API: lịch sử trận đấu & báo cáo ----
app.get("/api/games", async (req, res) => {
  res.json(await db.listGames());
});

app.get("/api/games/:id/detail", async (req, res) => {
  const g = await db.getGame(req.params.id);
  if (!g) return res.status(404).json({ error: "Không tìm thấy trận đấu." });
  res.json(g);
});

app.delete("/api/games/:id", async (req, res) => {
  const ok = await db.deleteGame(req.params.id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy trận đấu." });
  res.json({ ok: true });
});

app.get("/api/rooms/:code", (req, res) => {
  const room = rooms[req.params.code];
  if (!room) return res.status(404).json({ ok: false, error: "Không tìm thấy phòng với mã này." });
  if (room.phase !== "lobby") return res.json({ ok: false, error: "Phòng đã bắt đầu chơi, không thể vào lúc này." });
  res.json({ ok: true, code: req.params.code });
});

// ---- API: bộ câu hỏi (đề thi có thể lưu và tái sử dụng) ----
app.get("/api/question-sets", async (req, res) => {
  res.json(await db.listQuestionSets());
});

app.get("/api/question-sets/:id", async (req, res) => {
  const set = await db.getQuestionSet(req.params.id);
  if (!set) return res.status(404).json({ error: "Không tìm thấy bộ câu hỏi." });
  res.json(set);
});

app.post("/api/question-sets", async (req, res) => {
  const { name, duration, questions } = req.body || {};
  const set = await db.createQuestionSet({ name, duration, questions });
  if (!set) return res.status(400).json({ error: "Cần ít nhất 1 câu hỏi hợp lệ (có đủ 4 đáp án)." });
  res.json(set);
});

app.put("/api/question-sets/:id", async (req, res) => {
  const { name, duration, questions } = req.body || {};
  const set = await db.updateQuestionSet(req.params.id, { name, duration, questions });
  if (!set) return res.status(400).json({ error: "Không tìm thấy bộ câu hỏi hoặc dữ liệu không hợp lệ." });
  res.json(set);
});

app.delete("/api/question-sets/:id", async (req, res) => {
  const ok = await db.deleteQuestionSet(req.params.id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy bộ câu hỏi." });
  res.json({ ok: true });
});

app.get("/api/games/:id/report.csv", async (req, res) => {
  const g = await db.getGame(req.params.id);
  if (!g) return res.status(404).send("Không tìm thấy trận đấu.");
  const csv = buildCsvReport(g);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="bao-cao-phong-${g.roomCode}.csv"`);
  res.send("\uFEFF" + csv); // BOM để Excel hiển thị đúng tiếng Việt
});

function csvEscape(val) {
  const s = val === null || val === undefined ? "" : String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsvReport(g) {
  const lines = [];
  lines.push("BẢNG XẾP HẠNG CHUNG CUỘC");
  lines.push(["Hạng", "Tên người chơi", "Tổng điểm"].map(csvEscape).join(","));
  const ranked = g.players.slice().sort((a, b) => b.score - a.score);
  ranked.forEach((p, i) => lines.push([i + 1, p.name, p.score].map(csvEscape).join(",")));
  lines.push("");
  lines.push("CHI TIẾT TỪNG CÂU TRẢ LỜI");
  lines.push(
    ["Tên người chơi", "Câu số", "Câu hỏi", "Đáp án đã chọn", "Đúng/Sai", "Điểm", "Thời gian trả lời (giây)"]
      .map(csvEscape)
      .join(",")
  );
  g.answers.forEach((a) => {
    lines.push(
      [
        a.playerName,
        a.questionIndex + 1,
        a.questionText,
        a.choiceText || "(không trả lời)",
        a.correct ? "Đúng" : "Sai",
        a.points,
        a.timeTakenMs != null ? (a.timeTakenMs / 1000).toFixed(1) : "",
      ]
        .map(csvEscape)
        .join(",")
    );
  });
  return lines.join("\n");
}

// Lưu trạng thái các phòng trong bộ nhớ server (mất khi restart server — phù hợp demo/quy mô vừa)
const rooms = {}; // { code: { questions, currentIndex, phase, phaseStartTime, duration, hostSocketId, players: {socketId:{name,score}}, answers: {qIdx:{socketId:{choice,correct,points}}} } }

function genCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function leaderboard(room) {
  return Object.values(room.players)
    .sort((a, b) => b.score - a.score)
    .map((p) => ({ name: p.name, score: p.score }));
}

io.on("connection", (socket) => {
  // ---- HOST: tạo phòng ----
  socket.on("host:create", async (payload, cb) => {
    const questionSetId = payload && payload.questionSetId;
    let code;
    do { code = genCode(); } while (rooms[code]);

    let questions = DEFAULT_QUESTIONS;
    let duration = QUESTION_DURATION;
    if (questionSetId) {
      const set = await db.getQuestionSet(questionSetId);
      if (set && Array.isArray(set.questions) && set.questions.length > 0) {
        questions = set.questions;
        if (set.duration > 0) duration = set.duration * 1000;
      }
    }

    rooms[code] = {
      questions,
      currentIndex: -1,
      phase: "lobby",
      phaseStartTime: 0,
      duration,
      hostSocketId: socket.id,
      players: {},
      answers: {},
    };
    socket.join(code);
    socket.data.role = "host";
    socket.data.roomCode = code;
    cb({ ok: true, code, totalQuestions: questions.length });
  });

  // ---- PLAYER: tham gia phòng ----
  socket.on("player:join", ({ code, name, icon }, cb) => {
    const room = rooms[code];
    if (!room) return cb({ ok: false, error: "Không tìm thấy phòng với mã này." });
    if (room.phase !== "lobby") return cb({ ok: false, error: "Phòng đã bắt đầu chơi, không thể vào lúc này." });

    const safeIcon = typeof icon === "string" ? icon.slice(0, 2).toUpperCase() : (name || "?").slice(0, 1).toUpperCase();
    room.players[socket.id] = { name: name.slice(0, 20), icon: safeIcon, score: 0 };
    socket.join(code);
    socket.data.role = "player";
    socket.data.roomCode = code;

    cb({ ok: true, code, totalQuestions: room.questions.length });
    io.to(code).emit("lobby:update", {
      players: Object.values(room.players).map((p) => ({ name: p.name, icon: p.icon })),
    });
  });

  // ---- HOST: bắt đầu game ----
  socket.on("host:start", () => {
    const room = rooms[socket.data.roomCode];
    if (!room || socket.data.role !== "host") return;
    startQuestion(socket.data.roomCode, 0);
  });

  // ---- PLAYER: gửi đáp án ----
  socket.on("player:answer", ({ choice }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== "question") return;

    const qIdx = room.currentIndex;
    if (!room.answers[qIdx]) room.answers[qIdx] = {};
    if (room.answers[qIdx][socket.id]) return; // đã trả lời rồi, không cho gửi lại

    const q = room.questions[qIdx];
    const remaining = Math.max(0, room.phaseStartTime + room.duration - Date.now());
    const correct = choice === q.correct;
    const points = correct ? Math.round(500 + 500 * (remaining / room.duration)) : 0;

    room.answers[qIdx][socket.id] = { choice, correct, points, ts: Date.now() };
    if (room.players[socket.id]) room.players[socket.id].score += points;

    socket.emit("answer:ack", { correct, points });
    io.to(room.hostSocketId).emit("answer:count", {
      answered: Object.keys(room.answers[qIdx]).length,
      total: Object.keys(room.players).length,
    });
  });

  // ---- HOST: kết thúc câu hỏi sớm ----
  socket.on("host:endQuestion", () => {
    endQuestion(socket.data.roomCode);
  });

  // ---- HOST: chuyển câu tiếp theo ----
  socket.on("host:next", async () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const nextIdx = room.currentIndex + 1;
    if (nextIdx >= room.questions.length) {
      room.phase = "ended";
      const gameId = await saveRoomHistory(code);
      io.to(code).emit("game:ended", { leaderboard: leaderboard(room), gameId });
    } else {
      startQuestion(code, nextIdx);
    }
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    if (socket.data.role === "player") {
      // Chỉ xoá khỏi danh sách khi còn ở sảnh chờ. Sau khi đã bắt đầu chơi, vẫn giữ lại
      // để điểm số và lịch sử trả lời của người đó không bị mất khỏi báo cáo cuối trận.
      if (room.phase === "lobby") {
        delete room.players[socket.id];
        io.to(code).emit("lobby:update", {
          players: Object.values(room.players).map((p) => ({ name: p.name, icon: p.icon })),
        });
      }
    }
    // Nếu host rời đi, phòng vẫn giữ nguyên trong bộ nhớ cho tới khi server restart (demo đơn giản).
  });
});

function startQuestion(code, idx) {
  const room = rooms[code];
  if (!room) return;
  room.currentIndex = idx;
  room.phase = "question";
  room.phaseStartTime = Date.now();
  room.answers[idx] = {};
  if (!room.startedAt) room.startedAt = room.phaseStartTime;
  if (!room.questionStartTimes) room.questionStartTimes = {};
  room.questionStartTimes[idx] = room.phaseStartTime;

  io.to(code).emit("game:question", {
    index: idx,
    total: room.questions.length,
    question: room.questions[idx].q,
    options: room.questions[idx].options,
    duration: room.duration,
    startTime: room.phaseStartTime,
  });

  clearTimeout(room._timer);
  room._timer = setTimeout(() => endQuestion(code), room.duration + 300);
}

function endQuestion(code) {
  const room = rooms[code];
  if (!room || room.phase !== "question") return;
  clearTimeout(room._timer);
  room.phase = "results";
  io.to(code).emit("game:results", { leaderboard: leaderboard(room) });
}

async function saveRoomHistory(code) {
  const room = rooms[code];
  if (!room) return null;

  const players = Object.values(room.players).map((p) => ({ name: p.name, score: p.score }));

  const answers = [];
  for (let qIdx = 0; qIdx < room.questions.length; qIdx++) {
    const q = room.questions[qIdx];
    const qAnswers = room.answers[qIdx] || {};
    const startTime = (room.questionStartTimes || {})[qIdx];
    for (const [sid, p] of Object.entries(room.players)) {
      const a = qAnswers[sid];
      answers.push({
        playerName: p.name,
        questionIndex: qIdx,
        questionText: q.q,
        choiceText: a && a.choice != null ? q.options[a.choice] : null,
        correct: a ? !!a.correct : false,
        points: a ? a.points : 0,
        timeTakenMs: a && startTime ? a.ts - startTime : null,
      });
    }
  }

  return db.saveGame({
    roomCode: code,
    startedAt: room.startedAt || null,
    endedAt: Date.now(),
    numQuestions: room.questions.length,
    players,
    answers,
  });
}

server.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
