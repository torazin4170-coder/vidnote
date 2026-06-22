# VidNote — 動画要点まとめアプリ

YouTube 動画の字幕取得・Gemini API による章立て要約・リッチテキスト学習ノートを、4 ペイン UI で管理する個人向けデスクトップアプリです。

## 必要環境

- Node.js 20+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)（PATH に配置・ローカル開発用）
- Gemini API キー（要約機能）— [Google AI Studio](https://aistudio.google.com/apikey)
- Turso アカウント（Vercel 公開・複数端末共有時）— [turso.tech](https://turso.tech)

## セットアップ

```bash
cd video-summary-app
npm install
cp .env.example .env.local
npm run db:init
npm run dev
```

ブラウザで http://localhost:3000 を開きます。**最小幅 1280px（推奨 1440px）** のデスクトップ向け UI です。

### Turso データベース

セッション（字幕・要約・ノート）は **Turso（libSQL）** に保存します。

`TURSO_DATABASE_URL` 未設定時は `data/sessions.db`（ローカルファイル）にフォールバックするため、すぐに開発を始められます。

#### 1. Turso ダッシュボードで DB 作成（CLI 不要・Windows 推奨）

Turso のクラウド管理 CLI は Windows ネイティブ非対応のため、**ブラウザから作成**するのが最も簡単です。

1. [Turso ダッシュボード](https://turso.tech/app) にログイン（GitHub アカウント可）
2. **Create database** → 名前例: `vidnote`
3. 作成した DB を開き **Connect** から以下をコピー:
   - **Database URL**（`libsql://...`）
   - **Auth Token**
4. `.env.local` に貼り付け:

```env
TURSO_DATABASE_URL=libsql://vidnote-xxxxx.turso.io
TURSO_AUTH_TOKEN=eyJ...
```

5. スキーマ初期化・接続確認:

```bash
npm run db:init
npm run check:turso
```

#### CLI を使う場合（任意・WSL が必要）

```bash
# PowerShell で WSL に入る
wsl

# WSL 内で実行
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db create vidnote
```

> `winget install ChiselStrike.Turso` はパッケージが見つからないため使えません。

#### 既存ローカルデータの移行（任意）

Turso クラウド URL を設定したあと、ローカル `data/sessions.db` からコピー:

```bash
npm run db:migrate-local
```

### Gemini API キー（AI 要約）

1. [Google AI Studio](https://aistudio.google.com/apikey) に Google アカウントでログイン
2. **Create API key** をクリックし、キーをコピー
3. `.env.local` の `GEMINI_API_KEY=` に貼り付け
4. `npm run check:gemini` で接続確認
5. 開発サーバーを再起動

**既存セッション:** キー設定前に作成した動画は **「要約を再生成」** で要約できます。

> 無料枠ではプロンプトが Google の製品改善に使われる場合があります。機密情報は入れないでください。

## 機能

- YouTube URL から字幕取得（`youtube-transcript` 優先、yt-dlp フォールバック）
- **Gemini 2.5 Flash** による章立て要約（概要 / 重要ポイント / 用語 / アクション）
- **TipTap** リッチテキストノート（太字・赤字・箇条書き）
- **Turso** によるセッション永続化（リロード・別端末でも保持）
- フォーカスモード（全表示 / 字幕 / ノート）

## キーボードショートカット

| 操作 | キー |
|------|------|
| 新規セッション | Ctrl+N |
| 字幕内検索 | Ctrl+F |
| 全文コピー | Ctrl+Shift+C |
| ノート太字 | Ctrl+B |
| ノート赤字 | Ctrl+Shift+R |

## 環境変数

| 変数 | 説明 |
|------|------|
| `TURSO_DATABASE_URL` | Turso DB URL（`libsql://...`）。未設定時はローカルファイル |
| `TURSO_AUTH_TOKEN` | Turso 認証トークン（クラウド接続時に必要） |
| `GEMINI_API_KEY` | Google AI Studio の API キー（要約に必要） |
| `GEMINI_MODEL` | モデル ID（既定: `gemini-2.5-flash`） |
| `YTDLP_PATH` | yt-dlp 実行ファイル（既定: `yt-dlp`・ローカルのみ） |
| `YTDLP_COOKIES_BROWSER` | ブラウザ Cookie（`none` 推奨・ローカルのみ） |
| `SITE_PASSWORD` | 公開時の簡易パスワード（未設定なら認証なし） |

## Vercel デプロイ

### 前提

- Git リポジトリ（GitHub / GitLab 等）にプッシュ済みであること
- Turso クラウド DB が作成済みで `npm run db:init` 済みであること
- Vercel 上では **yt-dlp は使えません**。字幕取得は `youtube-transcript` 経路のみです

### 手順

1. [Vercel ダッシュボード](https://vercel.com/new) でリポジトリをインポート
2. **Environment Variables** に以下を設定（Production / Preview 両方推奨）:

| 変数 | 必須 | 説明 |
|------|------|------|
| `TURSO_DATABASE_URL` | はい | `libsql://...` |
| `TURSO_AUTH_TOKEN` | はい | Turso ダッシュボードの Auth Token |
| `GEMINI_API_KEY` | はい | Google AI Studio の API キー |
| `SITE_PASSWORD` | 推奨 | 公開 URL の簡易パスワード保護 |
| `GEMINI_MODEL` | 任意 | 既定: `gemini-2.5-flash` |

3. **Deploy** を実行
4. デプロイ後、`SITE_PASSWORD` を設定した場合は `/login` でパスワード入力

### ローカルから CLI でデプロイする場合

```bash
npx vercel login
npx vercel link
npx vercel env pull .env.vercel.local   # 任意: 環境変数を取得
npx vercel --prod
```

### 注意

- `file:data/sessions.db` は Vercel では使えません。Turso 未設定だと起動時にエラーになります
- 字幕取得・要約は最大 60 秒のサーバーレス関数で実行されます（長い動画はタイムアウトする場合あり）
- `vercel.json` でリージョン `hnd1`（東京）を指定しています

## 字幕なし動画

MVP では字幕付き YouTube 動画のみ対応です。Whisper フォールバックは今後追加予定です。

## 開発メモ

- 処理中は `next dev` を再起動しないでください（ジョブが途中で消えます）
- API キーはサーバー側 `.env.local` / Vercel 環境変数のみ
- ノートは編集後 600ms で自動保存（`PATCH /api/sessions/:id`）

## ライセンス

個人利用向けプロジェクト
