# VidNote 図解ワークスペース

Cursor で作成した図解 HTML を VidNote の DB に取り込み、通常の図解と同じ URL で表示します。

## 自動フロー（推奨）

1. VidNote で **「Cursor 用にコピー」** を押す  
   - プロンプトがクリップボードにコピーされる  
   - `session.target.json` がダウンロードされる  
2. ダウンロードした `session.target.json` を **このフォルダ（diagram-workspace）** に置く  
3. デスクトップの **「VidNote Diagram」** をダブルクリック  
   - VidNote（ブラウザ）と Cursor が開く  
   - **diagram:watch** が裏で起動（`output/diagram.html` を監視）  
4. Cursor Composer（Ctrl+I）に貼り付けて図解 HTML を生成  
5. **`output/diagram.html` に上書き保存**  
   → 自動で DB に取り込まれ、ブラウザで図解タブが開く  

## 手動取り込み

```bash
npm run diagram:import
```

## ブラウザから取り込む

VidNote の AI 要点ペイン **「HTML を取り込む」** から `diagram.html` を選択しても同じです。

## ファイル

| パス | 用途 |
|------|------|
| `session.target.json` | 取り込み先セッション ID（「Cursor 用にコピー」で取得） |
| `input/prompt.md` | 貼り付け用メモ（任意） |
| `output/diagram.html` | Cursor が生成した HTML（watch が監視） |

## 表示 URL（取り込み後）

`/api/sessions/{sessionId}/diagram` — VidNote 内の「新しいタブで開く」と同じ
