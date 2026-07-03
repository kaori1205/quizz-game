# Đấu Trường Tri Thức — Live Quiz (Node.js + Socket.io)

Game quiz trực tiếp nhiều người chơi kiểu Kahoot, dùng WebSocket thật (Socket.io) nên
đồng bộ gần như tức thời, chịu tải tốt cho ~100 người chơi cùng lúc.

---

## 1. Cài Node.js (chỉ làm 1 lần)

1. Vào https://nodejs.org
2. Tải bản **LTS** (khuyên dùng) cho hệ điều hành của bạn, cài như phần mềm bình thường.
3. Mở Terminal (macOS/Linux) hoặc Command Prompt/PowerShell (Windows), gõ:
   ```
   node -v
   npm -v
   ```
   Nếu hiện ra số phiên bản (vd `v20.11.0`) là cài thành công.

## 2. Chạy thử ở máy của bạn (local)

1. Giải nén thư mục `quiz-game` mình gửi, mở Terminal tại thư mục đó (macOS: chuột phải > "New Terminal at Folder"; Windows: gõ `cd đường-dẫn-tới-thư-mục`).
2. Cài các thư viện cần thiết:
   ```
   npm install
   ```
   (Lệnh này đọc file `package.json`, tự tải `express` và `socket.io` vào thư mục `node_modules`.)
3. Chạy server:
   ```
   npm start
   ```
   Thấy dòng `Server đang chạy tại http://localhost:3000` là server đã chạy.
4. Mở trình duyệt vào `http://localhost:3000` → chọn "Tạo phòng (Host)".
5. Mở thêm 1-2 tab khác (hoặc điện thoại cùng mạng wifi, dùng địa chỉ IP máy tính thay vì `localhost`) → chọn "Tham gia chơi", nhập mã phòng để test nhiều người cùng lúc.
6. Dừng server bằng `Ctrl + C` trong Terminal.

**Lưu ý:** để test bằng điện thoại cùng mạng, thay `localhost` bằng địa chỉ IP nội bộ của máy tính, ví dụ `http://192.168.1.5:3000` (xem IP bằng `ipconfig` trên Windows hoặc `ifconfig`/`ipconfig getifaddr en0` trên macOS).

## 3. Đưa code lên GitHub

Vì bạn đã dùng GitHub rồi nên phần này chỉ là quy trình quen thuộc:

```
git init
git add .
git commit -m "Live quiz game với Node.js + Socket.io"
```

Sau đó tạo repo mới trên GitHub (nút "New repository"), rồi:

```
git remote add origin https://github.com/<tên-bạn>/<tên-repo>.git
git branch -M main
git push -u origin main
```

**Quan trọng:** đừng push thư mục `node_modules` lên GitHub — file `.gitignore` mình đã kèm sẵn sẽ tự loại trừ nó.

## 4. Deploy lên Render (miễn phí, có link public cho mọi người truy cập)

1. Vào https://render.com, đăng ký/đăng nhập bằng tài khoản GitHub.
2. Bấm **New +** → **Web Service**.
3. Chọn repo GitHub bạn vừa push ở bước 3.
4. Điền cấu hình:
   - **Name**: tuỳ ý, ví dụ `quiz-game-live`
   - **Region**: chọn gần bạn nhất (Singapore nếu có)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: chọn **Free**
5. Trong mục **Environment Variables**, thêm biến `MONGODB_URI` với connection string MongoDB Atlas (xem hướng dẫn lấy connection string ở mục "Lưu lịch sử trận đấu" bên dưới).
6. Bấm **Create Web Service** → Render tự build và deploy, mất khoảng 1-2 phút.
7. Sau khi deploy xong, Render cho bạn 1 link dạng `https://quiz-game-live.onrender.com` — gửi link này cho người chơi là xong.

**Lưu ý về gói Free của Render:** server sẽ "ngủ" sau ~15 phút không có ai truy cập, và mất khoảng 30-50 giây để "thức dậy" ở lượt truy cập đầu tiên sau đó. Nếu bạn tổ chức sự kiện, nên mở link trước vài phút để server sẵn sàng. Nếu cần server luôn hoạt động không delay, cần nâng cấp gói trả phí.

## 5. Cập nhật / sửa code sau này

Mỗi khi sửa code:
```
git add .
git commit -m "Mô tả thay đổi"
git push
```
Render tự động phát hiện push mới và deploy lại (bật sẵn "Auto-Deploy").

---

## Tuỳ chỉnh nhanh

- **Đổi bộ câu hỏi**: sửa mảng `DEFAULT_QUESTIONS` trong `server.js`.
- **Đổi thời gian mỗi câu**: sửa `QUESTION_DURATION` (đơn vị mili-giây) trong `server.js`.
- **Giao diện**: toàn bộ nằm trong `public/index.html`, phần `<style>` để đổi màu/font, phần các hàm `view...()` để đổi bố cục.

## Cấu trúc thư mục

```
quiz-game/
├── package.json       ← khai báo thư viện cần dùng
├── server.js           ← toàn bộ logic server (phòng, câu hỏi, chấm điểm, realtime, lưu lịch sử)
├── db.js                ← đọc/ghi lịch sử trận đấu & bộ câu hỏi vào MongoDB
├── .env.example         ← mẫu file cấu hình MONGODB_URI (copy thành .env, không commit .env)
├── public/
│   ├── index.html         ← giao diện + logic client (host & player dùng chung 1 file)
│   └── history.html        ← trang xem lịch sử trận đấu & tải báo cáo
└── README.md            ← file hướng dẫn này
```

## Lưu lịch sử trận đấu & xuất báo cáo

Sau mỗi trận đấu, hệ thống tự động lưu lại vào MongoDB (xem mục cấu hình `MONGODB_URI` bên dưới). Dữ liệu lưu gồm:
- Tên & điểm tổng của từng người chơi
- Chi tiết từng câu: ai chọn đáp án nào, đúng/sai, được bao nhiêu điểm, trả lời mất bao nhiêu giây

**Xem lại lịch sử**: vào trang chủ → bấm "📜 Lịch sử trận đấu" (hoặc trực tiếp `/history.html`) để xem danh sách các trận đã chơi, xem chi tiết bảng điểm + từng câu trả lời.

**Tải báo cáo**: ở mỗi trận trong trang lịch sử (hoặc ngay màn hình kết quả chung cuộc của host) có nút **"📥 Tải CSV"** — file CSV mở được trực tiếp bằng Excel/Google Sheets, gồm 2 phần: bảng xếp hạng và chi tiết từng câu trả lời của từng người.

### Nơi lưu trữ: MongoDB Atlas (miễn phí, không mất dữ liệu khi deploy lại)

Dữ liệu (lịch sử trận đấu + bộ câu hỏi) được lưu ở **MongoDB Atlas** thay vì file trên ổ đĩa server, vì trên **Render gói Free** ổ đĩa không đảm bảo tồn tại vĩnh viễn (mất khi deploy lại hoặc Render di chuyển service). Cần cấu hình 1 lần:

1. Vào https://www.mongodb.com/cloud/atlas/register, tạo tài khoản miễn phí.
2. Tạo cluster **M0 Free**, tạo 1 Database User (username/password), và ở mục Network Access thêm `0.0.0.0/0` (cho phép Render kết nối tới).
3. Bấm **Connect** → **Drivers** → copy connection string dạng:
   ```
   mongodb+srv://<user>:<password>@<cluster-url>/?retryWrites=true&w=majority
   ```
4. **Chạy local**: copy file `.env.example` thành `.env`, dán connection string vào biến `MONGODB_URI` (file `.env` đã được `.gitignore` loại trừ, không lo lộ mật khẩu).
5. **Deploy trên Render**: vào service → tab **Environment** → thêm biến môi trường `MONGODB_URI` với giá trị connection string tương tự.

Nếu chưa cấu hình `MONGODB_URI`, server sẽ báo lỗi ngay khi khởi động — đây là kiểm tra chủ đích để tránh chạy nhầm mà không có nơi lưu dữ liệu.

## Vì sao cách này khác bản demo trước?

Bản demo trước dùng bộ nhớ dùng chung của artifact + polling (kiểm tra định kỳ mỗi 1-2s) —
không cần server riêng nhưng có độ trễ nhẹ. Bản này dùng **WebSocket thật** qua Socket.io:
server chủ động đẩy dữ liệu tới mọi client ngay khi có thay đổi, gần như tức thời, và xử lý
tốt hơn nhiều khi có ~100 người chơi cùng lúc.
