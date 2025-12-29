import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sympy as sp
import numpy as np
import matplotlib
import time
# サーバー環境でGUIウィンドウを開かないように設定
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64
import uuid
import random
from typing import Dict, Optional

# ★修正1: convert_xor を追加インポート
from sympy.parsing.sympy_parser import (
    parse_expr, 
    standard_transformations, 
    implicit_multiplication,
    implicit_multiplication_application,
    convert_xor
)

TIME_LIMIT_SECONDS = 10 * 60

# --- 1. アプリケーション設定 ---
app = FastAPI(title="FunGuessr API")

# CORS設定
origins = ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. 数式生成ロジック ---
x = sp.Symbol('x')
MAX_TERMS = 2

def get_coeff():
    return sp.Integer(random.choice([-3, -2, -1, 1, 2, 3]))

def get_power_term():
    exponent = random.choice([1, 2, 3])
    return x ** exponent

def get_simple_func_term():
    func = random.choice([sp.sin, sp.cos, sp.tan, sp.exp, sp.log])
    if func == sp.log:
        return sp.log(sp.Abs(x))
    else:
        return func(x)

def get_fraction_term():
    numerator = random.choice([1, x])
    denom_type = random.choice(['monomial', 'safe_quad'])
    if denom_type == 'monomial':
        denominator = x ** random.choice([1, 2])
    else:
        denominator = x**2 + 1
    return numerator / denominator

def generate_term():
    term_type = random.choices(
        ['poly', 'simple', 'product', 'fraction'],
        weights=[0.2, 0.35, 0.35, 0.1],
        k=1
    )[0]
    
    coeff = get_coeff()

    if term_type == 'poly':
        return coeff * get_power_term()
    elif term_type == 'simple':
        return coeff * get_simple_func_term()
    elif term_type == 'product':
        poly_part = get_power_term()
        func_part = get_simple_func_term()
        return coeff * poly_part * func_part
    elif term_type == 'fraction':
        return coeff * get_fraction_term()

def generate_math_problem(max_terms=MAX_TERMS):
    num_terms = random.randint(1, max_terms)
    expr = 0
    for _ in range(num_terms):
        expr += generate_term()
    return sp.expand(expr)

# --- 3. グラフ生成ロジック ---
def generate_graph_image(expr) -> str:
    try:
        f = sp.lambdify(x, expr, modules=['numpy'])
        t = np.linspace(-4, 4, 800)
        y = f(t)
        
        if np.iscomplexobj(y):
            y = np.real(y)

        y = np.clip(y, -15, 15)
        y_diff = np.diff(y, prepend=y[0])
        y[np.abs(y_diff) > 5] = np.nan

    except Exception as e:
        print(f"Graph generation error: {e}")
        return ""

    fig = plt.figure(figsize=(10, 6))
    
    plt.plot(t, y, linewidth=2.5, color='#00695C', label='y = f(x)')
    plt.axhline(0, color='black', linewidth=1)
    plt.axvline(0, color='black', linewidth=1)
    plt.grid(True, linestyle=':', alpha=0.7)
    plt.ylim(-10, 10)
    plt.xlim(-4, 4)
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    
    return base64.b64encode(buf.read()).decode('utf-8')

# --- 4. 管理オブジェクトとセッション管理 ---
class GameSession:
    def __init__(self, expr, session_hash: str, img_b64: str):
        self.session_hash = session_hash
        self.expr = expr
        self.latex = sp.latex(expr)
        self.img_b64 = img_b64
        self.created_at = None
        self.start_time = time.time()
        self.end_time = self.start_time + TIME_LIMIT_SECONDS
        self.is_done = False
        self.is_succeed = False
        self.clear_time = None

class AnswerRequest(BaseModel):
    user_formula: str

class AnswerResponse(BaseModel):
    is_correct: bool
    message: str
    correct_formula: Optional[str] = None

class ChatRequest(BaseModel):
    question: str

class InputRequest(BaseModel):
    x_value: float

games_db: Dict[str, GameSession] = {}

class GameStartResponse(BaseModel):
    session_hash: str
    initial_hint: str
    time_limit: int
    end_time: float

# --- 5. APIエンドポイント ---

@app.post("/api/game/start", response_model=GameStartResponse)
async def start_game():
    for _ in range(5):
        expr = generate_math_problem()
        img_b64 = generate_graph_image(expr)
        if img_b64:
            break
    else:
        raise HTTPException(status_code=500, detail="Failed to generate valid function graph")

    session_hash = str(uuid.uuid4())
    session_obj = GameSession(expr, session_hash, img_b64)
    games_db[session_hash] = session_obj
    
    # ★修正2: ログに正解を明確に表示
    print("="*50)
    print(f"DEBUG: New Game Created.")
    print(f"Session: {session_hash}")
    print(f"Answer (SymPy): {expr}")
    print(f"Answer (LaTeX): {sp.latex(expr)}")
    print("="*50)

    ai_hint = "グラフの特徴：原点付近の挙動に注目してください。"

    return {
        "session_hash": session_hash,
        "initial_hint": ai_hint,
        "time_limit": TIME_LIMIT_SECONDS,
        "end_time": session_obj.end_time
    }

@app.get("/api/game/{session_hash}/is_alive")
async def get_game_alive(session_hash: str):
    if session_hash not in games_db:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if time.time() > games_db[session_hash].end_time:
        games_db[session_hash].is_done = True
        raise HTTPException(status_code=404, detail="Session not found")
    
    if games_db[session_hash].is_done == True:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {"is_alive": "ALIVE!!!"}

@app.get("/api/game/{session_hash}/image")
async def get_game_image(session_hash: str):
    if session_hash not in games_db:
        raise HTTPException(status_code=404, detail="Session not found")
    
    game_data = games_db[session_hash]

    if time.time() > game_data.end_time:
        games_db[session_hash].is_done = True
        raise HTTPException(status_code=404, detail="Game Over (Time expired)")
    
    if games_db[session_hash].is_done == True:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "image_base64": game_data.img_b64,
        "end_time": game_data.end_time,
        "start_time": game_data.start_time
    }
    
@app.post("/api/game/{session_hash}/chat")
async def get_game_func_chat(session_hash: str, req: ChatRequest):
    if session_hash not in games_db:
        raise HTTPException(status_code=404, detail="Session not found")
    
    game = games_db[session_hash]
    
    if games_db[session_hash].is_done == True:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if time.time() > game.end_time:
        games_db[session_hash].is_done = True
        raise HTTPException(status_code=408, detail="Time limit exceeded")
    
    try:

        return {"response": "AIはまだ未実装です。"}

    except Exception as e:
        print(f"Calculation Error: {e}")
        return {"y_value": "Error (e.g. Division by Zero)"}
    
@app.post("/api/game/{session_hash}/answer", response_model=AnswerResponse)
async def judge_answer(session_hash: str, req: AnswerRequest):
    if session_hash not in games_db:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if games_db[session_hash].is_done == True:
        raise HTTPException(status_code=404, detail="Session not found")
    
    game_data = games_db[session_hash]
    
    elapsed_time = time.time() - game_data.start_time
    if elapsed_time > TIME_LIMIT_SECONDS:
         return {
            "is_correct": False,
            "message": "Time's up! 制限時間を過ぎています。",
            "correct_formula": game_data.latex
        }
    
    try:
        # ★修正1: convert_xor を追加して ^ を ** に変換
        transformations = (standard_transformations + (implicit_multiplication_application, implicit_multiplication, convert_xor))

        user_expr = parse_expr(
            req.user_formula, 
            local_dict={'x': x}, 
            transformations=transformations
        )
        
        diff = sp.simplify(game_data.expr - user_expr)
        is_correct = (diff == 0)
        
        if is_correct:
            clear_time = time.time() - game_data.start_time
            game_data.is_done = True
            game_data.clear_time = clear_time
            return {
                "is_correct": True,
                "message": f"正解！クリアタイム: {clear_time:.1f}秒",
                "correct_formula": game_data.latex
            }
        else:
            return {
                "is_correct": False,
                "message": f"不正解です。",
            }
            
    except Exception as e:
        print(f"Parse Error: {e}")
        return {
            "is_correct": False,
            "message": f"数式の形式エラー: {str(e)}"
        }
        
@app.post("/api/game/{session_hash}/input")
async def get_game_func_input(session_hash: str, req: InputRequest):
    if session_hash not in games_db:
        raise HTTPException(status_code=404, detail="Session not found")
    
    game = games_db[session_hash]
    
    if games_db[session_hash].is_done == True:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if time.time() > game.end_time:
        games_db[session_hash].is_done = True
        raise HTTPException(status_code=408, detail="Time limit exceeded")
    
    try:
        result = game.expr.subs(x, req.x_value)
        y_val_sympy = result.evalf()
        
        if not y_val_sympy.is_real:
            return {"y_value": "Undefined (Complex Number)"}

        y_value = float(y_val_sympy)
        
        if np.isinf(y_value) or np.isnan(y_value):
            return {"y_value": "Undefined (Infinity or NaN)"}

        return {"y_value": y_value}

    except Exception as e:
        print(f"Calculation Error: {e}")
        return {"y_value": "Error (e.g. Division by Zero)"}
    
@app.get("/api/game/{session_hash}/result")
async def get_game_func_result(session_hash: str):
    if session_hash not in games_db:
        raise HTTPException(status_code=404, detail="Session not found")
    
    game = games_db[session_hash]
    
    if games_db[session_hash].is_done == False:
        raise HTTPException(status_code=404, detail="Session not found")
    
    try:
        return {
            "is_succeed": games_db[session_hash].is_succeed,
            "clear_time": games_db[session_hash].clear_time,
            "correct_formula": games_db[session_hash].latex
        }

    except Exception as e:
        print(f"Error: {e}")
        return {"message": "Error"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)