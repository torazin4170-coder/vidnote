# VidNote 図解ワークスペース

Cursor で作成した図解 HTML をプレビューし、VidNote へは手動で取り込みます。

## ワークフロー

1. VidNote で **「Cursor 用にコピー」** を押す（プロンプトがクリップボードにコピーされる）
2. デスクトップの **「VidNote Diagram」** をダブルクリック  
   - VidNote（ブラウザ）と Cursor が開く
3. Cursor Composer（Ctrl+I）に貼り付けて図解 HTML を生成
4. **`output/diagram.html` に上書き保存**（`<main>` 内断片のみ）
5. **`npm run diagram:preview`** を実行 → ダークモード付きでブラウザが自動で開く
6. VidNote の **「HTML を取り込む」** から `diagram.html` を選んで反映

> Cursor エージェントは **vidnote-diagram** スキルに従い、保存後に `npm run diagram:preview`（または `diagram:finish`）を実行してください。

## 図解 HTML の形式

| 項目 | ルール |
|------|--------|
| 保存内容 | `<main>` **内のコンテンツ断片のみ**（タグ自体は含めない） |
| ダークモード | `lib/visual-explainer/base.html` のシェルが自動付与（右上トグル） |
| プレビュー | `npm run diagram:preview` → `output/diagram.preview.html` |

## コマンド

| コマンド | 用途 |
|---------|------|
| `npm run diagram:preview` | ローカル file:// プレビュー（ダークモード付き） |
| `npm run diagram:finish` | `diagram:preview` のエイリアス（後方互換） |
| `npm run diagram:open` | VidNote + Cursor ワークスペースを開く |

## ファイル

| パス | 用途 |
|------|------|
| `output/diagram.html` | Cursor が生成した HTML 断片 |
| `output/diagram.preview.html` | ローカルプレビュー用（シェル付き・自動生成） |
| `input/prompt.md` | 貼り付け用メモ（任意） |

## 表示 URL（VidNote 取り込み後）

`/api/sessions/{sessionId}/diagram` — VidNote 内の「新しいタブで開く」と同じ
