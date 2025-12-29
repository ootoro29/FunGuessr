# FunGuessr

## 起動の仕方
1. backend/に移動する。
2. main.pyを実行する。
3. frontend/funguessr/に移動する。
4. npm run devを実行する。
5. これで恐らく起動できるはず。

## やって欲しいこと
1. このリポジトリをcloneで落とす。
2. branchを作成する。(ブランチ名は任意でok)
3. 作成したブランチに移って開発をする。
4. frontendのコンポーネント分け  
`frontend/funguessr/app/game/[session_id]/page.tsx`  
が問題解答ページである。そして  
`frontend/funguessr/components/GameChatClient.tsx`  
にその問題解答ページのUI機能の大部分が詰まっている。
ただし、生成AIに大部分を書かせたのでコンポーネント分けが適切に行われていない。なので機能は現在のものを参考にしてコンポーネント分けをしていただきたい。(components/に自由に.tsxファイルを作成して実装してもらいたい。)
5. 結果ページの作成  
`frontend/funguessr/app/game/[session_id]/result/page.tsx`  
が結果の画面である。ここに最低限、結果ページに必要な情報を簡易的に表示させている。このページを作成していただきたい。  
6. 時間があれば以下もやりたい  
- 解答ページの機能改善  
　ショートカットキーでコマンドと尋問モードに切り替え、コマンドを自然言語風に書けるように等々  
- バックエンド機能の拡充  
  コマンドの数を増やしたい