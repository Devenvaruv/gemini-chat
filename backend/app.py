import os
import threading
from io import BytesIO
from pathlib import Path

import numpy as np
import openvino as ov
from flask import Flask, jsonify, request
from openvino_genai import GenerationConfig, VLMPipeline
from PIL import Image, UnidentifiedImageError

BACKEND_DIR = Path(__file__).resolve().parent
MODEL_DIR = Path(
    os.getenv(
        "MODEL_DIR",
        str(BACKEND_DIR / "models" / "Phi-3.5-vision-instruct-int4-ov"),
    )
).resolve()
DEVICE = os.getenv("DEVICE", "CPU")
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "150"))
CORS_ALLOW_ORIGIN = os.getenv("CORS_ALLOW_ORIGIN", "http://localhost:3000")

app = Flask(__name__)

pipeline = None
pipeline_lock = threading.Lock()


def image_to_tensor(upload) -> ov.Tensor:
    data = upload.read()
    if not data:
        raise ValueError("Uploaded image is empty.")

    try:
        image = Image.open(BytesIO(data)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise ValueError("Could not read the uploaded image format.") from exc

    return ov.Tensor(np.asarray(image, dtype=np.uint8))


@app.get("/")
def index():
    return jsonify(
        {
            "service": "openvino-vlm-backend",
            "status": "ok",
            "health_endpoint": "/api/health",
            "chat_endpoint": "/api/chat",
        }
    )


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "model_dir": str(MODEL_DIR), "device": DEVICE})


@app.route("/api/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return "", 204

    prompt = (request.form.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "Prompt is required."}), 400

    images = []
    upload = request.files.get("image")
    if upload and upload.filename:
        try:
            images.append(image_to_tensor(upload))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    try:
        global pipeline
        if pipeline is None:
            if not MODEL_DIR.exists():
                raise FileNotFoundError(f"Model directory not found: {MODEL_DIR}")
            pipeline = VLMPipeline(str(MODEL_DIR), DEVICE)

        with pipeline_lock:
            result = pipeline.generate(
                prompt,
                images=images,
                generation_config=GenerationConfig(max_new_tokens=MAX_NEW_TOKENS),
            )
    except Exception as exc:
        return jsonify({"error": f"Inference failed: {exc}"}), 500

    texts = getattr(result, "texts", None)
    return jsonify({"answer": texts[0] if texts else str(result)})


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = CORS_ALLOW_ORIGIN
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=False)
