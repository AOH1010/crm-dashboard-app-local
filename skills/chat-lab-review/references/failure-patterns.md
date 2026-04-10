# Known Failure Patterns

This file mirrors the verified lessons in [docs/eval/chat-lab-know-how.md](../../../docs/eval/chat-lab-know-how.md).

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
- Prompt `tom tat cho toi` quá chung chung nên cần clarify thay vì auto default vào KPI.
- Multi-intent rõ ràng nên fallback thay vì hỏi user chọn một nhánh.
- Seller alias có thể false-positive trên token chung như `thu`, `thang`, `nao`.
- Follow-up team phải carry team entity tới tận skill execution.
- Operations summary cross-view nên mặc định theo tháng hiện tại và trả snapshot giàu hơn.
- User-facing reply phải là tiếng Việt có dấu.
