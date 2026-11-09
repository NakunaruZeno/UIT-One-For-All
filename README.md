# UIT One For All (v1.5.0)

> **Bộ tiện ích mở rộng học vụ toàn diện (All-in-One Extension) dành riêng cho sinh viên Trường Đại học Công nghệ Thông tin - ĐHQG-HCM (UIT).**  
> Xây dựng trên chuẩn **Manifest V3**, thiết kế theo phong cách **Minimalist Bento UI**, tập trung tối đa vào hiệu năng, trải nghiệm người dùng và bảo mật thông tin cá nhân.

---

## 🌟 Tổng Quan Tính Năng Chính

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           UIT ONE FOR ALL                              │
  ├──────────────────┬──────────────────┬──────────────────────────────────┤
  │  THEO DÕI HỌC VỤ │  TỰ ĐỘNG HÓA     │  CÔNG CỤ HỖ TRỢ                  │
  │  • TKB Tuần      │  • Auto SSO      │  • Xếp Lớp Học (.xlsx)           │
  │  • Bảng Điểm GPA │  • Hẹn Giờ ĐKHP  │  • Quét Đổi Phòng Học (DAA)      │
  │  • Lịch Thi      │  • Auto Khảo Sát │  • Bảo Mật AES-256 (Web Crypto)  │
  └──────────────────┴──────────────────┴──────────────────────────────────┘
```

---

### 1. 📅 Thời Khóa Biểu Tuần (Weekly Timetable)
- **Tương thích Portal mới (bản build `r3487`)**: Cào dữ liệu trực tiếp từ bảng **Theo ĐKHP** của `portal.uit.edu.vn/sinh-vien/tkb` với tốc độ siêu tốc (<100ms), đồng thời hỗ trợ chế độ dự phòng quét lưới **Lịch tuần**.
- **Hỗ trợ học Cách tuần**: Tự động tính toán chu kỳ tuần chẵn/lẻ cho các môn có lịch cách tuần (`interval = 2`), hiển thị nhãn `CÁCH TUẦN` rõ ràng.
- **Tự động đồng bộ Nghỉ / Học bù**: Tự động quét thông báo từ **DAA** (`daa.uit.edu.vn`) và **OEP** (`oep.uit.edu.vn`) để cập nhật trực tiếp lên ô lịch (`HỌC BÙ` màu xanh lá, `BÁO NGHỈ` màu đỏ).
- **Linh hoạt & Cá nhân hóa**:
  - Thêm lịch học ngoài, lịch tự học, họp nhóm đồ án vào lưới tuần.
  - Nhấp vào bất kỳ buổi học nào để xem chi tiết (Mã lớp, Phòng, Giảng viên, Thời gian) hoặc ẩn buổi học đó khỏi lưới.
  - Nút **Làm mới từ Portal** ngay trên thanh công cụ TKB để cập nhật dữ liệu 1-click.
  - Cảnh báo qua Chrome Notification khi học kỳ kết thúc để kịp thời đồng bộ kỳ mới.

---

### 2. 🎓 Bảng Điểm & Phân Tích GPA
- **Xử lý Radix UI Tabs thông minh**: Tự động kích hoạt chuyển đổi giữa tab *Tổng kết theo kỳ* và *Chi tiết môn học* thông qua chuỗi sự kiện `pointerdown/mousedown`.
- **4 Thẻ Thống Kê Tổng Quan (Bento Grid)**:
  - **GPA Tích Lũy**: Lấy số liệu chính thức từ Portal hoặc tự tính có trọng số, kèm huy hiệu xếp loại học lực (*Xuất sắc, Giỏi, Khá, Trung bình, Yếu*).
  - **GPA Toàn Khóa**: Điểm trung bình có trọng số của toàn bộ các môn đã học.
  - **Tín Chỉ Tích Lũy**: Đếm tín chỉ đạt và miễn, kèm thanh tiến độ hoàn thành chương trình đào tạo (~132 TC).
  - **Số Học Phần**: Thống kê số lượng môn học và tỷ lệ Đạt/Miễn môn.
- **Bảng điểm phân chia theo từng học kỳ**:
  - Đầy đủ các cột: Mã MH, Tên học phần, Tín chỉ, QT, TH, GK, CK, Điểm TB (HP) và Ghi chú.
  - Dòng tiêu đề từng học kỳ hiển thị tổng TC và GPA HK riêng biệt.
  - Tìm kiếm tức thời theo mã môn / tên môn và bộ lọc theo học kỳ.
- **Thông báo điểm mới**: Tự động so sánh dữ liệu cũ và mới để gửi Chrome Notification ngay khi giảng viên công bố điểm môn mới.

---

### 3. 📝 Lịch Thi Học Kỳ
- **Tra cứu Portal tự động**: Mở và quét lịch thi từ `portal.uit.edu.vn/sinh-vien/lich-thi`, hỗ trợ lọc nhanh theo Học kỳ và Năm học.
- **Đếm ngược ngày thi**: Tự động tính khoảng cách ngày thi tới hiện tại (*Hôm nay!*, *Còn X ngày*, *Đã qua*).
- **Thêm lịch thi thủ công**: Cho phép tự thêm các môn thi riêng tại lớp, thi đồ án, kiểm tra vấn đáp vào danh sách.

---

### 4. 📊 Xếp Lớp Học & Mô Phỏng ĐKHP (XLSX Scheduler)
- **Đọc file Excel phòng Đào tạo**: Tải trực tiếp file `.xlsx` danh sách lớp mở của Trường để mô phỏng thời khóa biểu dự kiến.
- **Khóa cặp Lý thuyết – Thực hành**: Tự động nhận diện và ràng buộc lớp LT với các lớp TH đi kèm (VD: `IT001.Q31` đi cùng `IT001.Q31.1`).
- **Phát hiện trùng lịch**: Cảnh báo tức thì nếu hai môn học bị trùng thứ hoặc trùng tiết học.
- **Quản lý phương án**: Lưu trữ nhiều kịch bản xếp lớp (Phương án A, Phương án B) để đối phó khi lớp bị hết chỗ.
- **1-Click chuyển sang ĐKHP**: Nhấn nút chuyển danh sách mã lớp đã chọn trực tiếp sang tab Hẹn giờ ĐKHP mà không cần sao chép thủ công.

---

### 5. ⏰ Hẹn Giờ Đăng Ký Học Phần Tự Động (Auto ĐKHP)
- **Đếm ngược thời gian thực**: Thiết lập thời điểm mở cổng ĐKHP chính xác đến từng giây.
- **Tự động mở cổng**: Khi đồng hồ đếm về `00:00:00`, tự động mở `dkhp.uit.edu.vn/app/reg`.
- **Đăng nhập dự phòng**: Nếu phiên đăng nhập bị hết hạn giữa chừng, tiện ích tự động điền thông tin và đăng nhập lại ngay lập tức.
- **Tự động chọn lớp & Đăng ký**: Tự động lọc và tích chọn các lớp trong bảng TanStack Table (hỗ trợ React controlled components và xử lý phân trang) rồi nhấn nút **Đăng ký**.

---

### 6. 📋 Tự Động Khảo Sát Giảng Dạy (Auto Survey)
- **Hỗ trợ đa nền tảng**: Hoạt động trơn tru trên cả `portal.uit.edu.vn` (mục Khảo sát ý kiến sinh viên) và hệ thống khảo sát cũ `survey.uit.edu.vn`.
- **Tùy biến tiêu chí đánh giá**: Chọn nhanh mức đánh giá từ Mức 1 đến Mức 4, hoặc tùy chọn Ngẫu nhiên (Mức 3 & 4) để tạo độ tự nhiên cho kết quả.
- **Tự động điền ý kiến mở**: Cấu hình trước câu trả lời đóng góp ý kiến cho môn học và giảng viên.

---

### 7. 🔔 Cảnh Báo Đổi Phòng Học Tự Động
- Chạy định kỳ ở background thông qua Service Worker (`chrome.alarms`).
- Tự động quét thông báo phòng học trên DAA (`https://daa.uit.edu.vn/thong-bao-phong-hoc`).
- So khớp với mã các lớp sinh viên đang theo học; nếu phát hiện phòng học bị đổi hoặc chuyển sang học online/nghỉ, gửi thông báo Chrome Notification kèm link trực tiếp đến bài viết của trường.

---

### 8. 🛡️ Tự Động Đăng Nhập SSO & Bảo Mật Tuyệt Đối
- **Tự động đăng nhập hàng loạt cổng UIT**:
  - Keycloak SSO: `sso.uit.edu.vn`
  - Portal Sinh viên: `portal.uit.edu.vn` (hỗ trợ cả nút "Đăng nhập với UIT SSO" lẫn form xác thực)
  - Hệ thống Moodle LMS: `courses.uit.edu.vn`
  - Cổng Đào tạo Drupal: `daa.uit.edu.vn`, `oep.uit.edu.vn`
  - Cổng Đăng ký học phần: `dkhp.uit.edu.vn`
- **Mã hóa AES-GCM 256-bit chuẩn Web Crypto API**: Mật khẩu của sinh viên được mã hóa hoàn toàn cục bộ trên máy với vector khởi tạo ngẫu nhiên (IV) và khóa mã hóa riêng biệt.
- **Privacy First & Offline First**: Tiện ích **KHÔNG** sử dụng bất kỳ máy chủ bên thứ ba nào, không thu thập cookie hay dữ liệu cá nhân của người dùng. Dữ liệu chỉ trao đổi trực tiếp giữa trình duyệt của bạn và các máy chủ chính thức của UIT.

---

## 📁 Cấu Trúc Thư Mục Dự Án

```
UIT One For All/
├── manifest.json              # Khai báo tiện ích chuẩn Chrome MV3
├── assets/
│   └── icons/                 # Bộ icon chuẩn kích thước (16, 24, 32, 64, 128)
├── docs/
│   └── references/            # Tài liệu cấu trúc DOM phân tích từ các trang web UIT
├── src/
│   ├── background/
│   │   └── index.js           # Service Worker quản lý alarm, thông báo, quét DAA
│   ├── content/
│   │   └── index.js           # Content Script tự động SSO, cào dữ liệu Portal, ĐKHP, Khảo sát
│   ├── dashboard/
│   │   ├── dashboard.html     # Giao diện Bảng điều khiển học vụ trung tâm
│   │   ├── dashboard.css      # CSS Bento UI, Minimalist, hỗ trợ Dark / Light Theme
│   │   └── dashboard.js       # Logic điều khiển TKB, Điểm số, Lịch thi, Xếp lớp
│   ├── lib/
│   │   ├── crypto.js          # Module mã hóa/giải mã AES-GCM 256-bit
│   │   └── xlsx.full.min.js   # Thư viện SheetJS đọc file Excel thời khóa biểu
│   └── popup/
│       ├── popup.html         # Giao diện popup nhanh trên thanh công cụ
│       ├── popup.css
│       └── popup.js           # Xử lý lưu tài khoản và kích hoạt đồng bộ
└── README.md
```

---

## 🚀 Hướng Dẫn Cài Đặt (Dành Cho Nhà Phát Triển / Tải Trực Tiếp)

1. **Chuẩn bị file**:
   Tải hoặc giải nén thư mục tiện ích về máy (ví dụ: `d:\UIT\Project_Ca_Nhan\UIT One For All v1.3.2\UIT One For All`).
2. **Cài vào Google Chrome / Microsoft Edge / Brave**:
   - Mở trình duyệt và truy cập `chrome://extensions` (hoặc `edge://extensions`).
   - Bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên bên phải.
   - Nhấn nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
   - Chọn thư mục gốc `UIT One For All` (thư mục chứa tệp `manifest.json`).
3. **Sử dụng**:
   - Nhấp vào biểu tượng UIT One For All trên thanh công cụ trình duyệt để mở cửa sổ Popup.
   - Nhập **MSSV** và **Mật khẩu** rồi nhấn **Lưu Thông Tin (Mã hóa AES-256)**.
   - Nhấn **Đồng bộ Điểm, TKB & Lịch thi** hoặc nhấn **Mở Bảng Điều Khiển** để bắt đầu trải nghiệm!

---

## 🎨 Giao Diện & Trải Nghiệm (Design Standards)
- **Font chữ**: Sử dụng bộ font hệ thống hiện đại, kết hợp `Inter` cho văn bản thông tin và `JetBrains Mono` cho các dữ liệu số, mã môn học, thời gian biểu và điểm số.
- **Bento Card Structure**: Các khối dữ liệu được tổ chức theo từng thẻ riêng biệt, phân cấp thị giác rõ ràng, giảm thiểu tối đa hiện tượng phân tâm.
- **Chế độ Sáng / Tối (Dark / Light Theme)**: Tùy biến linh hoạt theo sở thích cá nhân chỉ với 1 cú click chuột.

---

## ⚖️ Lưu Ý Sử Dụng
- Tiện ích được phát triển phục vụ mục đích học tập cá nhân và tối ưu hóa thời gian theo dõi học vụ của sinh viên UIT.
- Hãy bảo mật thiết bị cá nhân của bạn. Không chia sẻ file lưu trữ cục bộ của trình duyệt cho người khác.
- Mọi góp ý cải tiến hoặc báo lỗi xin vui lòng đóng góp qua repository của dự án.

