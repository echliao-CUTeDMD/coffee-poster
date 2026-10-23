# Supabase 連線驗證

2026-10-23 已使用目前 cloud-config.js 的公開設定完成真實 API 驗證：

- 公開設定讀取及匿名登入成功。
- sync_learning 寫入成功，讀回自己的玩家紀錄成功。
- 匿名測試帳號沒有管理者權限。
- 已呼叫 delete_my_learning 清除測試學習紀錄。

Authentication → Users 仍會保留測試匿名帳號，UID 為 `6ae07db3-c50b-4882-8b07-5dd7fff743f6`，可由專案擁有者刪除。

尚未驗證管理者登入、正式 GitHub Pages 網址及瀏覽器端完整流程。GitHub 尚未發布。本文件的連線結果取代舊教學中「尚未連接」的初始狀態描述。
