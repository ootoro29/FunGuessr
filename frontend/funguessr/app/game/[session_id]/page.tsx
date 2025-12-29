import { redirect } from 'next/navigation';
import GameChatClient from '@/components/GameChatClient'; // パスは適宜調整してください

// 1. 型定義を Promise<{ session_id: string }> に変更します
export default async function GamePage({ params }: { params: Promise<{ session_id: string }> }) {
    
    // 2. params を await して解決してから値を取り出します
    const { session_id } = await params;
    const sessionId = session_id;

    // --- 以降は元のコードと同じ ---
    let isValid = false;
    try {
        const res = await fetch(`http://127.0.0.1:8000/api/game/${sessionId}/is_alive`, {
            cache: 'no-store'
        });
        if (res.ok) {
            isValid = true;
        }
    } catch (e) {
        console.error(e);
    }

    if (!isValid) {
        redirect('/');
    }

    return <GameChatClient sessionId={sessionId} />;
}