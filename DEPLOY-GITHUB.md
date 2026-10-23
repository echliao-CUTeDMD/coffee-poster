# 深坑 USR：Supabase 與 GitHub Pages 設定

目前程式已備妥，但未連接你的 Supabase，也尚未發布 GitHub。未填設定時，玩家仍可在本機遊玩。GitHub Pages 放網頁；Supabase 保存自願啟用雲端的玩家紀錄。

## 1. 建立 Supabase 專案

1. 前往 https://supabase.com/dashboard 登入，按 New project。
2. 選擇自己的 Organization，專案名稱可填 `shenkeng-usr`。
3. 設定並妥善保存資料庫密碼，選擇合適的地區，建立專案並等待準備完成。資料庫密碼不需填進網頁。

## 2. 啟用玩家匿名登入

在專案的 Authentication 設定中找到 Anonymous Sign-Ins 並啟用、儲存；介面可能位於 Sign In / Providers。匿名登入不要求玩家提供 Email 或密碼。

玩家仍須選暱稱及居民、店家、學生、老師、遊客其中一種角色，並勾選雲端紀錄同意。沒勾選就只存在本機。不要關閉 RLS。

目前版本尚未接入 CAPTCHA 挑戰介面；若專案要求 CAPTCHA，需先完成挑戰介面整合才能匿名登入。正式公開前應依活動規模設定匿名登入速率與防濫用措施，尤其同一校園網路多人同時建立帳號時。參考：https://supabase.com/docs/guides/auth/auth-anonymous

## 3. 建立資料表及權限

1. 在 Supabase 開啟 SQL Editor → New query。
2. 開啟此資料夾的 `cloud/schema.sql`，複製**整份內容**貼入並執行 Run。
3. 成功後，Table Editor 的 public schema 應有 `learning_players` 和 `learning_events`。

SQL 同時建立 RLS 和資料寫入函式：一般玩家只能讀取自己的資料，寫入時由登入帳號決定歸屬；只有另外授權的管理者能讀取全體資料。不要另外增加「所有人皆可讀寫」政策。

## 4. 填入公開連線資訊

在專案的 Connect 面板或設定頁取得 Project URL；到 Settings → API Keys 取得 Publishable key（`sb_publishable_...`，也相容舊版 anon 公開金鑰）。

用文字編輯器開啟 `cloud-config.js`，只改兩個空字串：

```js
window.SHENKENG_CLOUD_CONFIG = Object.freeze({
  url: 'https://你的專案代碼.supabase.co',
  publishableKey: '你的Publishable公開金鑰',
  consentVersion: '2026-10-23-v1'
});
```

這兩項可存在 GitHub 網頁程式中，資料安全由資料庫權限控制。**不可填入 secret、service_role、資料庫密碼或管理者密碼。** 官方說明：https://supabase.com/docs/guides/getting-started/api-keys

## 5. 建立管理者

1. 在 Authentication → Users，使用新增使用者功能建立管理者 Email／密碼帳號，確認此帳號 Email 已驗證。這是另外的管理帳號，不是遊戲中的「老師」角色。
2. 複製該使用者的 UUID（User UID）。
3. 在 SQL Editor 執行以下內容，把 UUID 換成剛才的值：

```sql
insert into shenkeng_private.admins (user_id)
values ('貼上管理者UUID'::uuid)
on conflict do nothing;
```

4. 網站發布後，開啟同一網址下的 `admin.html`，使用管理者 Email／密碼登入，即可篩選角色、查看統計，匯出玩家與活動 CSV。

撤銷權限可在 SQL Editor 執行 `delete from shenkeng_private.admins where user_id = '該UUID'::uuid;`。不要在網頁程式裡放管理者密碼。

## 6. 上傳 GitHub Pages

1. 建立 GitHub repository，例如 `shenkeng-usr`。
2. 將上傳包**解壓縮**，把內容上傳到 repository 根目錄。根目錄要直接看到 `index.html`；不要只上傳 ZIP。
3. 必要執行檔為 `index.html`、`cloud-config.js`、`cloud-client.js`、`admin.html`、`admin.js`。保留 `.nojekyll`；其他教學與 SQL 可一起保存。
4. Repository → Settings → Pages → Build and deployment，選 Deploy from a branch，再選 `main` 與 `/ (root)`，儲存。
5. 等待發布完成，開啟 Pages 顯示的 HTTPS 網址，通常為 `https://你的帳號.github.io/shenkeng-usr/`。

此專案不需要 npm build。網頁的 Three.js 與 Supabase SDK 由 CDN 載入，需網路連線。GitHub Pages 是靜態網站，玩家紀錄存到 Supabase，不會寫回 GitHub repository。官方說明：https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

## 7. 實際驗收

1. 從正式 HTTPS 網址開啟遊戲，選暱稱、角色，勾選雲端紀錄並登入。
2. 查看玩家帳戶中的同步狀態，必須顯示已同步；「本機保存」或「尚未同步」不代表已上傳。
3. 探索地點、作答與完成任務，等待同步。
4. 在 Supabase Table Editor 確認兩張表出現紀錄。
5. 到 `admin.html` 登入管理者，確認玩家、活動與 CSV 內容。
6. 測試斷網後的待送紀錄、恢復網路後重試，以及兩個不同玩家的資料隔離。

尚未建立真實 Supabase 專案前，無法驗證你的金鑰、Auth 設定、網路、配額及正式部署；本地資料庫測試不能取代這一步。

## 紀錄行為與限制

- 保存暱稱、角色、探索項目、作答選項及是否答對、完成任務、登入與重設事件、裝置回報及伺服器收件時間。XP 依目前完成任務數計算。
- 匿名帳號靠此瀏覽器保存的登入憑證識別，**暱稱不是密碼**。同一暱稱在另一裝置不會自動接回帳號；清除瀏覽器資料後也無法憑暱稱找回。需要跨裝置續玩時，應再加入 Email 或其他正式帳號綁定。
- 共用電腦上的本機玩家選單不是私人帳號保護。管理者請使用自己的裝置，離開管理頁時登出。
- 本機 `file://`、測試伺服器、GitHub Pages 屬於不同儲存來源，本機舊進度不會自動搬到正式網址。
- 離線待送資料保存在瀏覽器，清除瀏覽器資料會失去尚未同步的事件。重設進度保留雲端歷史事件；刪除玩家紀錄則刪除該玩家資料及活動。匿名 Auth 帳號本身仍可能保留在 Supabase Users 中，可由專案管理者後續清理。
- 管理者 CSV 為當次載入資料，載入時新增的事件可能需再次更新。匿名帳號數不等於實際人數；事件是前端回報，不適合作為不可作弊的正式成績。
- 上線前由計畫團隊決定保存期限與聯絡窗口，向參與者說明用途，定期清理不再需要的資料。

## 常見問題

| 訊息／現象 | 處理方式 |
|---|---|
| 尚未設定 Supabase | 檢查 cloud-config.js 兩個字串已填好、更新後已重新發布 |
| Anonymous sign-ins are disabled | 啟用 Authentication 的匿名登入 |
| 找不到 sync_learning／資料表 | 在同一專案執行完整 cloud/schema.sql |
| Invalid API key | 確認 URL 與公開金鑰來自同一專案 |
| 管理者沒有權限 | 確認 Users UUID 已加入私有 admins 表，且為正式 Email 帳號 |
| 雲端沒有玩家 | 玩家須同意雲端並顯示同步成功；本機模式不會上傳 |
| Too many requests／rate limit | 等待限制解除，依活動人數檢查 Auth 速率設定，不要反覆建立帳號 |
