# usage-graph

Claude Code の残り使用量(レート制限の 5 時間枠・週間枠)を、ペインにグラフで表示する mod です。

- 枠ごとに「残り ◯%」とバー、リセットまでの時間を表示します(残り 10% 未満で赤)
- 残り使用量の推移を折れ線グラフで表示します(`5h` / `24h` / `7d` で切り替え)
- 履歴は 7 日分保存され、セッションをまたいで残ります
- セッション開始時に自動で開きます。閉じたあとは `/usage-graph` で開き直せます
- デスクトップアプリでは SVG のグラフ、ターミナルでは文字のバーと簡易グラフで表示します

値が表示されるのは、サブスクリプション(Pro / Max など)でログインしているときだけです。API キーでの利用では表示されません。値はセッションの最初の応答のあとに表示されます。

## インストール

ターミナルのセッションのプロンプトで:

```
/plugin install usage-graph --marketplace narumincho/claude-usage-graph
```

`Add marketplace?` に `y` と答え、スコープを選びます。

シェルから:

```
claude plugin install usage-graph --marketplace narumincho/claude-usage-graph
```

デスクトップアプリ(`/plugin` は使えません): プロンプト欄の横の + → Plugins → Add marketplace に `narumincho/claude-usage-graph` を入力し、Add plugin を押します。

## 開発

```
claude plugin validate .
claude plugin test .
```
