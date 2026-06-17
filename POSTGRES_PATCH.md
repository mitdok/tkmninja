# PostgreSQL persistence patch

このパッチは Redis を主保存、PostgreSQL を副保存として使います。
Redis から状態が取れないときは `room_states` から復帰し、チャットに復帰メッセージを流します。

## 必須環境変数

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require
REDIS_TLS_URL=rediss://default:xxxxx@xxxxx:6379
```

Render / Neon / Supabase などの TLS 必須 Postgres では `DATABASE_URL` をそのまま入れてください。
ローカルで SSL 無しにする場合だけ以下を入れます。

```env
PGSSLMODE=disable
```

## 作成されるテーブル

- `room_states`: 各卓の最新状態。Redis 消失時の復帰元。
- `game_sessions`: ゲーム開始・終了日時、勝者、開始/終了時スナップショット。
- `game_participants`: 参加者、座席、色、勝敗。
- `app_users`: トリップ単位のユーザー管理。
- `chat_logs`: チャットログ。
- `user_game_stats`: 勝率集計ビュー。

## 2ちゃんねる互換トリップ

`unix-crypt-td-js` を使って DES crypt(3) ベースのトリップを生成します。
依存が入っていない場合は SHA-1 fallback でログイン自体は止めませんが、2ch互換ではありません。

## 確認SQL

```sql
SELECT * FROM room_states ORDER BY updated_at DESC LIMIT 10;
SELECT * FROM game_sessions ORDER BY started_at DESC LIMIT 10;
SELECT * FROM user_game_stats ORDER BY games DESC, win_rate_percent DESC LIMIT 20;
```

## 復旧テスト

1. 卓でゲームを開始する。
2. `room_states` に該当 `room_id` が保存されていることを確認する。
3. Redis 側の `room-N` を削除する、または Redis を再作成する。
4. WebSocket サーバを再起動する。
5. PostgreSQL から復帰した旨のチャット通知が出ることを確認する。
