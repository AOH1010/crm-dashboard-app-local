# Known Failure Patterns

This file mirrors the verified lessons in [docs/eval/chat-lab-know-how.md](/d:/CRM/crm-dashboard-app-local/docs/eval/chat-lab-know-how.md).

## Current patterns

- Route đúng chưa đủ để kết luận answer đúng.
- Case nhóm A có thể fail ở formatter dù classifier và skill đúng.
- Natural query không nên phụ thuộc keyword schema cứng.
- Prompt overview mơ hồ phải giải nghĩa theo `viewId`.
- Follow-up ngắn phải reuse previous topic.
- `Tháng này` phải theo thời gian hệ thống, không theo tháng mới nhất của dữ liệu.
- Compare explicit phải ưu tiên kỳ mà user nói rõ.
- Dataset và runtime có thể lệch nhãn intent, cần lớp normalize.
- Usage bằng 0 là bug quan sát, không phải chỉ là chi tiết phụ.
