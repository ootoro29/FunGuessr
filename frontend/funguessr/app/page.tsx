"use client"; // ← これが必須です（onClickを使うため）

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleGameStart = async () => {
    // 連打防止のためローディング中は処理しない
    if (isLoading) return;
    setIsLoading(true);

    try {
      // 1. Pythonサーバー(FastAPI)へPOSTリクエスト
      const res = await fetch("http://127.0.0.1:8000/api/game/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error("サーバーエラーが発生しました");
      }

      // 2. レスポンスから session_hash を取得
      const data = await res.json();
      const sessionHash = data.session_hash;

      // 3. ゲーム画面へ遷移 (/game/ハッシュ値)
      router.push(`/game/${sessionHash}`);

    } catch (error) {
      console.error("ゲーム開始に失敗:", error);
      alert("ゲームを開始できませんでした。サーバーが起動しているか確認してください。");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6">
      <p className="text-2xl font-bold">FunGuessr - ホーム</p>
      
      <button 
        onClick={handleGameStart}
        disabled={isLoading}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
      >
        {isLoading ? "準備中..." : "ゲームスタート"}
      </button>
    </div>
  );
}