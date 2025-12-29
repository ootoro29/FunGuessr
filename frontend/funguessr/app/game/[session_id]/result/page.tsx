import { redirect } from 'next/navigation';
// クライアントコンポーネントを作成済みならここでインポート
// import ResultClient from './ResultClient'; 

export default async function GameResult({ params }: { params: Promise<{ session_id: string }> }) {
    const { session_id } = await params;
    const sessionId = session_id;

    let gameResultData = null; // ★データを格納する変数を初期化

    try {
        const res = await fetch(`http://127.0.0.1:8000/api/game/${sessionId}/result`, {
            cache: 'no-store'
        });
        
        if (res.ok) {
            // ★ResponseオブジェクトからJSONデータを取り出す
            gameResultData = await res.json();
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }

    // データが取得できなかった場合はリダイレクト
    if (!gameResultData) {
        redirect('/');
    }

    // ここまで来れば gameResultData に中身が入っていることが確定
    return (
        <div>
            <h1>結果画面</h1>
            {/* クライアントコンポーネントにデータを渡す例 */}
            {/* <ResultClient data={gameResultData} /> */}
            
            {/* デバッグ表示用 */}
            <pre>{JSON.stringify(gameResultData, null, 2)}</pre>
        </div>
    );
}