from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI()

@app.get("/", response_class=HTMLResponse)
def read_home():
    with open("./frontend/home.html", "r", encoding="utf-8") as f:
        return f.read()
