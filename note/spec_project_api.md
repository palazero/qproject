1. 取得使用者的所有專案
   GET /api/projects/
   需登入
   回傳該使用者參與的所有專案及統計資料
2. 建立新專案
   POST /api/projects/
   需登入
   參數：name, description, settings
   回傳新專案資料及統計
3. 取得單一專案詳細資料
   GET /api/projects/:id
   需登入且必須是該專案成員
   回傳專案詳細、統計、成員列表
4. 更新專案
   PUT /api/projects/:id
   需登入且必須是 owner 或 admin
   參數同建立專案
   回傳更新後專案資料
5. 刪除專案
   DELETE /api/projects/:id
   需登入且必須是 owner
   回傳刪除成功訊息
6. 取得專案成員
   GET /api/projects/:id/members
   需登入且必須是該專案成員
   回傳成員列表
7. 新增專案成員
   POST /api/projects/:id/members
   需登入且必須是 owner 或 admin
   參數：user_id, role（member/admin）
   回傳新增成功訊息
8. 移除專案成員
   DELETE /api/projects/:id/members/:user_id
   需登入且必須是 owner 或 admin
   不能移除 owner
   回傳移除成功訊息
   如需查詢 API 參數格式、驗證規則或有其他專案相關需求，請告訴我！
