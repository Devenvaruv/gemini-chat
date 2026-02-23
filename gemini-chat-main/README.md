# Vision Chat Frontend (Next.js)

This frontend sends prompts (text-only or text + image) directly to the Flask backend.

## Run

1. Start backend in another terminal:

```powershell
cd ..\backend
.\ov-vision\Scripts\python.exe app.py
```

2. Start frontend:

```powershell
$env:NEXT_PUBLIC_BACKEND_URL="http://127.0.0.1:8000"
npm run dev
```

3. Open `http://localhost:3000`

## Backend URL (direct from browser)

By default, the frontend calls:

`http://127.0.0.1:8000`

To change it, set:

```powershell
$env:NEXT_PUBLIC_BACKEND_URL="http://127.0.0.1:8000"
npm run dev
```

## CORS

Flask allows `http://localhost:3000` by default. To change that:

```powershell
$env:CORS_ALLOW_ORIGIN="http://localhost:3000"
.\ov-vision\Scripts\python.exe app.py
```
