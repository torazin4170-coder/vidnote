# VidNote 図解ワークスペース

Cursor で作成した図解 HTML を VidNote の DB に取り込み、通常の図解と同じ URL で表示します。

## 自動フロー（推奨）

1. VidNote で **「Cursor 用にコピー」** を押す  
   - プロンプトがクリップボードにコピーされる  
   - **取り込み先セッションが DB に登録される**（JSON ファイル不要）  
2. デスクトップの **「VidNote Diagram」** をダブルクリック  
   - VidNote（ブラウザ）と Cursor が開く  
   - **diagram:watch** が裏で起動  
3. Cursor Composer（Ctrl+I）に貼り付けて図解 HTML を生成  
4. **`output/diagram.html` に上書き保存**  
   → 自動で DB に取り込まれ、図解タブが開く  

## ブラウザから取り込む（watch 不要）

VidNote の **「HTML を取り込む」** からファイルを選ぶだけでも OK です。

## 手動取り込み

```bash
npm run diagram:import
```

## ファイル

| パス | 用途 |
|------|------|
| `output/diagram.html` | Cursor が生成した HTML（watch が監視） |
| `input/prompt.md` | 貼り付け用メモ（任意） |

## 表示 URL（取り込み後）

`/api/sessions/{sessionId}/diagram` — VidNote 内の「新しいタブで開く」と同じ
