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
const rooms = {}; // { code: { questions, currentIndex, phase, phaseStartTime, duration, hostSocketId, players: {clientId:{name,score}}, answers: {qIdx:{clientId:{choice,correct,points}}}, socketToClient: {socketId:clientId} } }

function genCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function genClientId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Trạng thái hiện tại của phòng để 1 client vừa (re)connect bắt kịp đúng màn hình
function buildResumePayload(room, clientId) {
  if (room.phase === "question") {
    return {
      phase: "question",
      index: room.currentIndex,
      total: room.questions.length,
      question: room.questions[room.currentIndex].q,
      options: room.questions[room.currentIndex].options,
      duration: room.duration,
      startTime: room.phaseStartTime,
    };
  }
  if (room.phase === "results") {
    const qAnswers = room.answers[room.currentIndex] || {};
    const myAnswer = clientId ? qAnswers[clientId] : null;
    return {
      phase: "results",
      leaderboard: leaderboard(room),
      previousLeaderboard: room.lastPreviousLeaderboard || leaderboard(room),
      isFirstQuestion: room.currentIndex === 0,
      question: room.questions[room.currentIndex].q,
      options: room.questions[room.currentIndex].options,
      correctIndex: room.lastCorrectIndex,
      correctText: room.lastCorrectText,
      explanation: room.lastExplanation || "",
      resultsRevealed: !!room.resultsRevealed,
      chosenIndex: myAnswer ? myAnswer.choice : null,
      lastCorrect: myAnswer ? myAnswer.correct : null,
      lastPoints: myAnswer ? myAnswer.points : 0,
    };
  }
  if (room.phase === "ended") {
    return { phase: "ended", leaderboard: leaderboard(room), gameId: room.lastGameId };
  }
  return null;
}

function leaderboard(room) {
  return Object.entries(room.players)
    .map(([cid, p]) => ({ clientId: cid, name: p.name, icon: p.icon, score: p.score }))
    .sort((a, b) => b.score - a.score);
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
      socketToClient: {},
    };
    socket.join(code);
    socket.data.role = "host";
    socket.data.roomCode = code;
    cb({ ok: true, code, totalQuestions: questions.length });
  });

  // ---- PLAYER: tham gia phòng (hoặc rejoin sau khi mất kết nối tạm thời) ----
  socket.on("player:join", ({ code, name, icon, clientId }, cb) => {
    const room = rooms[code];
    if (!room) return cb({ ok: false, error: "Không tìm thấy phòng với mã này." });

    const cid = typeof clientId === "string" && clientId ? clientId : genClientId();
    const isRejoin = !!room.players[cid];
    if (room.phase !== "lobby" && !isRejoin) {
      return cb({ ok: false, error: "Phòng đã bắt đầu chơi, không thể vào lúc này." });
    }

    const safeIcon = typeof icon === "string" ? icon.slice(0, 2).toUpperCase() : (name || "?").slice(0, 1).toUpperCase();
    if (isRejoin) {
      // Giữ nguyên điểm số đã có, chỉ cập nhật lại tên/icon nếu đổi
      room.players[cid].name = name.slice(0, 20) || room.players[cid].name;
      room.players[cid].icon = safeIcon;
    } else {
      room.players[cid] = { name: name.slice(0, 20), icon: safeIcon, score: 0 };
    }
    room.socketToClient[socket.id] = cid;
    socket.join(code);
    socket.data.role = "player";
    socket.data.roomCode = code;
    socket.data.clientId = cid;

    cb({ ok: true, code, clientId: cid, totalQuestions: room.questions.length, resume: buildResumePayload(room, cid) });
    if (room.phase === "lobby") {
      io.to(code).emit("lobby:update", {
        players: Object.values(room.players).map((p) => ({ name: p.name, icon: p.icon })),
      });
    }
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
    const cid = socket.data.clientId;
    if (!cid || !room.players[cid]) return;

    const qIdx = room.currentIndex;
    if (!room.answers[qIdx]) room.answers[qIdx] = {};
    if (room.answers[qIdx][cid]) return; // đã trả lời rồi, không cho gửi lại

    const q = room.questions[qIdx];
    const remaining = Math.max(0, room.phaseStartTime + room.duration - Date.now());
    const correct = choice === q.correct;
    const points = correct ? Math.round(500 + 500 * (remaining / room.duration)) : 0;

    room.answers[qIdx][cid] = { choice, correct, points, ts: Date.now() };
    room.players[cid].score += points;

    socket.emit("answer:ack", { correct, points });
    const answeredCount = Object.keys(room.answers[qIdx]).length;
    const totalPlayers = Object.keys(room.players).length;
    io.to(room.hostSocketId).emit("answer:count", { answered: answeredCount, total: totalPlayers });

    // Tu dong ket thuc cau hoi ngay khi 100% nguoi choi da tra loi, khong can cho het gio
    if (totalPlayers > 0 && answeredCount >= totalPlayers) {
      endQuestion(code);
    }
  });

  // ---- PLAYER: xem kết quả từng câu của riêng mình (dùng ở màn kết quả chung cuộc) ----
  socket.on("player:myResults", (payload, cb) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    const cid = socket.data.clientId;
    if (!room || !cid || !room.players[cid]) return cb({ ok: false });

    const perQuestion = room.questions.map((q, qIdx) => {
      const a = (room.answers[qIdx] || {})[cid];
      return {
        questionIndex: qIdx,
        question: q.q,
        answered: !!a,
        correct: a ? !!a.correct : false,
        points: a ? a.points : 0,
      };
    });
    const board = leaderboard(room);
    const rank = board.findIndex((p) => p.clientId === cid) + 1;
    const me = room.players[cid];
    cb({ ok: true, perQuestion, rank, name: me.name, icon: me.icon, score: me.score, total: board.length });
  });

  // ---- HOST: kết thúc câu hỏi sớm ----
  socket.on("host:endQuestion", () => {
    endQuestion(socket.data.roomCode);
  });

  // ---- HOST: chuyển từ màn "reveal đáp án + giải thích" sang bảng xếp hạng ----
  // (chỉ cần khi câu hỏi có giải thích — host chủ động bấm thay vì tự động chuyển sau vài giây)
  socket.on("host:showLeaderboard", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || socket.data.role !== "host") return;
    room.resultsRevealed = true;
    io.to(code).emit("results:show");
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
      room.lastGameId = gameId;
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
      const cid = socket.data.clientId;
      delete room.socketToClient[socket.id];
      // Chỉ xoá khỏi danh sách khi còn ở sảnh chờ VÀ không còn socket nào khác của cùng
      // client này đang giữ kết nối (tránh mất người khi họ chỉ đang reconnect tạm thời).
      if (room.phase === "lobby") {
        const stillConnected = Object.values(room.socketToClient).includes(cid);
        if (!stillConnected) {
          delete room.players[cid];
          io.to(code).emit("lobby:update", {
            players: Object.values(room.players).map((p) => ({ name: p.name, icon: p.icon })),
          });
        }
      }
    } else if (socket.data.role === "host" && room.hostSocketId === socket.id) {
      // Host rời phòng (đóng tab / thoát) -> đá toàn bộ người chơi về màn hình tham gia, dọn phòng.
      clearTimeout(room._timer);
      io.to(code).emit("room:closed");
      delete rooms[code];
    }
  });
});

function startQuestion(code, idx) {
  const room = rooms[code];
  if (!room) return;
  room.currentIndex = idx;
  room.phase = "question";
  room.phaseStartTime = Date.now();
  room.answers[idx] = {};
  // Chụp lại điểm số của mọi người NGAY TRƯỚC câu hỏi này, để sau khi kết thúc có thể
  // animate phần điểm vừa cộng thêm (từ điểm cũ -> điểm mới) trên bảng xếp hạng.
  room.scoresBeforeQuestion = {};
  for (const [cid, p] of Object.entries(room.players)) room.scoresBeforeQuestion[cid] = p.score;
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

// Bảng xếp hạng TRƯỚC câu hỏi vừa rồi (dùng điểm đã chụp lại lúc bắt đầu câu hỏi),
// để client animate phần điểm mới cộng thêm.
function previousLeaderboard(room) {
  const before = room.scoresBeforeQuestion || {};
  return Object.entries(room.players)
    .map(([cid, p]) => ({ clientId: cid, name: p.name, icon: p.icon, score: before[cid] || 0 }))
    .sort((a, b) => b.score - a.score);
}

function endQuestion(code) {
  const room = rooms[code];
  if (!room || room.phase !== "question") return;
  clearTimeout(room._timer);
  room.phase = "results";
  const q = room.questions[room.currentIndex];
  room.lastCorrectIndex = q.correct;
  room.lastCorrectText = q.options[q.correct];
  room.lastExplanation = q.explanation || "";
  room.lastPreviousLeaderboard = previousLeaderboard(room);
  room.resultsRevealed = false;
  io.to(code).emit("game:results", {
    leaderboard: leaderboard(room),
    previousLeaderboard: room.lastPreviousLeaderboard,
    correctIndex: room.lastCorrectIndex,
    correctText: room.lastCorrectText,
    explanation: room.lastExplanation,
    isFirstQuestion: room.currentIndex === 0,
  });
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
