"use client"

import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

// メッセージ型の定義
type Message = {
    role: 'user' | 'system' | 'ai';
    content: string;
    type?: 'text' | 'success' | 'error' | 'image';
    imageUrl?: string;
}

export default function GameChatClient({ sessionId }: { sessionId: string }) {
    // --- State: ゲームデータ ---
    const [hiddenImageUrl, setHiddenImageUrl] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    
    // --- State: UI操作 ---
    const [mode, setMode] = useState<'command' | 'chat'>('command');
    const [commandType, setCommandType] = useState<'ANS' | 'INPUT'>('ANS');
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    
    // ★追加: ゲーム終了状態 (正解 or タイムアップ)
    const [isGameEnded, setIsGameEnded] = useState(false);

    // --- State: 時間管理 (サーバー同期用) ---
    const [endTime, setEndTime] = useState<number | null>(null);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [timeLeft, setTimeLeft] = useState(100); // 秒単位
    const [isImageRevealed, setIsImageRevealed] = useState(false);

    // --- Refs ---
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isInitialized = useRef(false);
    const isRedirecting = useRef(false);

    // --- router ---
    const router = useRouter()

    // ---------------------------------------------------------
    // 1. 初期化: サーバーから画像と時刻情報を取得
    // ---------------------------------------------------------
    useEffect(() => {
        if (isInitialized.current) return;
        isInitialized.current = true;

        const initGame = async () => {
            try {
                const res = await fetch(`http://127.0.0.1:8000/api/game/${sessionId}/image`);
                if (res.ok) {
                    const data = await res.json();
                    
                    setHiddenImageUrl(`data:image/png;base64,${data.image_base64}`);
                    
                    setEndTime(data.end_time);
                    setStartTime(data.start_time);
                    
                    // 初期残り時間の計算
                    const now = Date.now() / 1000;
                    const remaining = Math.max(0, Math.floor(data.end_time - now));
                    setTimeLeft(remaining);
                    
                    // もしロードした時点ですでに時間が切れていたら終了状態にする
                    if (remaining <= 0) {
                         setIsGameEnded(true);
                    }
                    
                    addMessage('system', 'ゲーム開始。解析を開始してください。\n制限時間が残り少なくなるとヒント画像が表示されます。');
                } else {
                    addMessage('system', 'セッションが無効か、タイムアウトしました。', 'error');
                    setIsGameEnded(true); // 操作不能にする
                }
            } catch (error) {
                console.error("Init Error:", error);
                addMessage('system', 'サーバー通信エラーが発生しました。', 'error');
            }
        };
        initGame();
    }, [sessionId]);

    // ---------------------------------------------------------
    // 2. タイマー同期ロジック (1秒ごとに再計算)
    // ---------------------------------------------------------
    useEffect(() => {
        // ★修正: ゲーム終了フラグが立っていたらタイマーを更新しない（停止）
        if (!endTime || isGameEnded) return;

        const syncTimer = () => {
            const now = Date.now() / 1000;
            const remaining = Math.max(0, Math.floor(endTime - now));
            
            setTimeLeft(remaining);

            // 残り時間が0になったら終了状態へ
            if (remaining <= 0) {
                setIsGameEnded(true);
            }
        };

        syncTimer();
        const timerId = setInterval(syncTimer, 1000);

        return () => clearInterval(timerId);
    }, [endTime, isGameEnded]); // isGameEndedを依存配列に追加

    // ---------------------------------------------------------
    // 3. ゲームイベント監視 (画像公開 & タイムアップ)
    // ---------------------------------------------------------
    useEffect(() => {
        if (!endTime || !startTime) return;

        const totalDuration = endTime - startTime;
        const threshold = totalDuration / 3;

        // A. 画像公開ロジック
        if (!isImageRevealed && timeLeft <= threshold && timeLeft > 0 && hiddenImageUrl) {
            setIsImageRevealed(true);
            addMessage('system', '⚠️ 緊急ヒント: 制限時間が残りわずかです！グラフ画像を公開します。', 'image', hiddenImageUrl);
        }
        
        // B. タイムアップ処理
        // timeLeftが0になり、まだリダイレクト処理が始まっていない場合
        if (timeLeft === 0 && !isRedirecting.current) {
            isRedirecting.current = true;
            setIsGameEnded(true); // 念のためここでも終了フラグを立てる
            
            addMessage('system', '⏰ 制限時間終了です！結果画面へ移動します...', 'error');
            
            setTimeout(() => {
                router.push(`/game/${sessionId}/result`); 
            }, 1500);
        }

    }, [timeLeft, endTime, startTime, isImageRevealed, hiddenImageUrl, router, sessionId]);


    // ---------------------------------------------------------
    // ヘルパー関数 & ハンドラ
    // ---------------------------------------------------------
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const addMessage = (role: Message['role'], content: string, type: Message['type'] = 'text', imgUrl?: string) => {
        setMessages(prev => [...prev, { role, content, type, imageUrl: imgUrl }]);
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // ★修正: isGameEnded もチェックに追加
        if (!inputValue.trim() || isLoading || isGameEnded) return;

        setIsLoading(true);

        try {
            if (mode === 'command') {
                await handleCommandMode();
            } else {
                await handleChatMode();
            }
        } catch (error) {
            console.error(error);
            addMessage('system', '通信エラーが発生しました。', 'error');
        } finally {
            // ゲームが終わっていない場合のみローディングを解除
            if (!isGameEnded && !isRedirecting.current) {
                setIsLoading(false);
            }
            setInputValue("");
        }
    };

    const handleCommandMode = async () => {
        const displayCmd = commandType === 'ANS' ? `解答: f(x) = ${inputValue}` : `代入: x = ${inputValue}`;
        addMessage('user', `[COMMAND: ${commandType}] ${inputValue}`);

        if (commandType === 'ANS') {
            const res = await fetch(`http://127.0.0.1:8000/api/game/${sessionId}/answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_formula: inputValue })
            });
            const data = await res.json();
            
            if (data.is_correct) {
                // 正解時の処理
                addMessage('system', `🎉 ${data.message}`, 'success');
                
                // ★修正: ゲーム終了状態にする（これでタイマーが止まり、入力が無効化される）
                setIsGameEnded(true); 
                
                if (!isRedirecting.current) {
                    isRedirecting.current = true;
                    setTimeout(() => {
                        router.push(`/game/${sessionId}/result`); 
                    }, 1500);
                }
            } else {
                addMessage('system', `❌ 不正解... ${data.message}`, 'error');
                // 不正解の場合は finally ブロックで isLoading が false に戻る
            }

        } else if (commandType === 'INPUT') {
            const res = await fetch(`http://127.0.0.1:8000/api/game/${sessionId}/input`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ x_value: inputValue })
            });
            
            if (res.ok) {
                const data = await res.json();
                addMessage('system', `📝 Result: f(${inputValue}) = ${data.y_value}`);
            } else {
                addMessage('system', '計算エラー。有効な数値を入力してください。', 'error');
            }
        }
    };

    const handleChatMode = async () => {
        addMessage('user', inputValue);
        const res = await fetch(`http://127.0.0.1:8000/api/game/${sessionId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: inputValue })
        });

        if (res.ok) {
            const data = await res.json();
            addMessage('ai', data.response);
        } else {
            addMessage('system', 'AIからの応答取得に失敗しました。', 'error');
        }
    };

    // ---------------------------------------------------------
    // レンダリング
    // ---------------------------------------------------------
    return (
        <div className="max-w-4xl mx-auto p-4 flex flex-col h-screen max-h-screen font-sans">
            {/* 1. ヘッダー */}
            <div className="flex-none bg-white p-4 rounded-lg shadow mb-4 flex justify-between items-center border border-gray-200">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">FunGuessr</h1>
                    <p className="text-xs text-gray-500 font-mono">ID: {sessionId}</p>
                </div>
                
                {/* タイマー表示: 残り時間が少なくなると赤くなる演出 */}
                <div className={`text-3xl font-mono font-bold px-4 py-2 rounded 
                    ${timeLeft < 60 ? 'text-red-600 bg-red-50 animate-pulse' : 'text-gray-700 bg-gray-100'}
                    ${isGameEnded && timeLeft > 0 ? 'text-green-600 bg-green-50' : ''} 
                `}>
                    {/* 終了していたらその時点の時間を表示し続ける */}
                    {endTime ? formatTime(timeLeft) : "--:--"}
                </div>
            </div>

            {/* 2. チャットログ */}
            <div className="flex-1 overflow-y-auto bg-slate-50 rounded-lg p-4 mb-4 border border-gray-300 space-y-4 shadow-inner">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-lg p-4 shadow-sm text-sm 
                            ${msg.role === 'user' ? 'bg-blue-600 text-white' : 
                              msg.role === 'ai' ? 'bg-white text-gray-800 border-l-4 border-purple-500' :
                              msg.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
                              msg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200 font-bold' :
                              'bg-gray-200 text-gray-800 border border-gray-300'}`}>
                            
                            <div className="text-xs opacity-70 mb-2 font-bold uppercase tracking-wider flex items-center gap-2">
                                {msg.role === 'ai' ? '🤖 AI Analyst' : 
                                 msg.role === 'system' ? '💻 System' : '👤 You'}
                            </div>

                            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                            {msg.type === 'image' && msg.imageUrl && (
                                <div className="mt-3 bg-white p-2 rounded border border-gray-300">
                                    <img src={msg.imageUrl} alt="Hint Graph" className="w-full h-auto rounded" />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* 3. コントロールエリア */}
            <div className="flex-none bg-white p-4 rounded-lg shadow-lg border border-gray-200">
                <div className="flex gap-2 mb-4 border-b border-gray-100 pb-2">
                    <button 
                        onClick={() => setMode('command')}
                        className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-all ${mode === 'command' ? 'bg-gray-800 text-white shadow-md transform -translate-y-0.5' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        ⚙️ 解析 (Command)
                    </button>
                    <button 
                        onClick={() => setMode('chat')}
                        className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-all ${mode === 'chat' ? 'bg-purple-600 text-white shadow-md transform -translate-y-0.5' : 'text-gray-500 hover:bg-purple-50'}`}
                    >
                        🗣️ 尋問 (Interrogation)
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex gap-2">
                    {mode === 'command' && (
                        <select 
                            value={commandType}
                            onChange={(e) => setCommandType(e.target.value as 'ANS' | 'INPUT')}
                            className="border-2 border-gray-300 rounded-lg px-3 py-2 bg-gray-50 font-mono text-sm focus:border-blue-500 focus:outline-none"
                            // ★追加: ゲーム終了時に無効化
                            disabled={isLoading || isGameEnded}
                        >
                            <option value="ANS">ANS (解答)</option>
                            <option value="INPUT">INPUT (代入)</option>
                        </select>
                    )}

                    <input
                        type={mode === 'command' && commandType === 'INPUT' ? "number" : "text"}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={
                            isGameEnded ? "ゲーム終了" :
                            mode === 'chat' ? "AIに関数の特徴を聞く" :
                            commandType === 'ANS' ? "数式を入力 (例: x^2 + sin(x))" :
                            "xの値を入力 (例: 1.5)"
                        }
                        className="flex-1 border-2 border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all disabled:bg-gray-100 disabled:text-gray-500"
                        // ★修正: ゲーム終了時に無効化
                        disabled={isLoading || isGameEnded}
                    />

                    <button 
                        type="submit" 
                        // ★修正: ゲーム終了時に無効化
                        disabled={isLoading || !inputValue || isGameEnded}
                        className={`px-8 py-2 rounded-lg font-bold text-white transition-all shadow-md active:transform active:translate-y-0.5
                            ${isLoading || isGameEnded ? 'bg-gray-400 cursor-not-allowed' : 
                              mode === 'chat' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-800 hover:bg-gray-900'}`}
                    >
                        {isLoading ? '...' : 'SEND'}
                    </button>
                </form>
            </div>
        </div>
    );
}