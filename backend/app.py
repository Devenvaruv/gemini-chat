import os  # Reads environment variables like MODEL_DIR, DEVICE, and CORS settings.
import threading  # Gives us a lock so only one model generation runs at a time.
from io import BytesIO  # Lets PIL open image bytes that come from an HTTP upload.
from pathlib import Path  # Safe and clear path handling for local folders/files.

import numpy as np  # Converts PIL image data into a NumPy array for OpenVINO.
import openvino as ov  # Provides ov.Tensor used by the OpenVINO pipeline.
from flask import Flask, jsonify, request  # Flask web server + request/response helpers.
from openvino_genai import GenerationConfig, VLMPipeline  # VLM model loading + generation.
from PIL import Image, UnidentifiedImageError  # Image decoding + error for invalid images.

# Absolute directory that contains this app.py file.
BACKEND_DIR = Path(__file__).resolve().parent

# Model directory can be overridden with MODEL_DIR, else use local default folder.
MODEL_DIR = Path(
    os.getenv(
        "MODEL_DIR",
        str(BACKEND_DIR / "models" / "Phi-3.5-vision-instruct-int4-ov"),
    )
).resolve()

# Inference device (CPU by default). Can be set with DEVICE environment variable.
DEVICE = os.getenv("DEVICE", "CPU")

# Maximum number of new tokens generated per request (default: 150).
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "150"))

# Browser origin allowed for CORS (frontend URL allowed to call this backend).
CORS_ALLOW_ORIGIN = os.getenv("CORS_ALLOW_ORIGIN", "http://localhost:3000")

# Create Flask app instance.
app = Flask(__name__)

# Global pipeline object, lazily initialized on first chat request.
pipeline = None

# Lock so two requests cannot call generate() at the same exact moment.
pipeline_lock = threading.Lock()


def image_to_tensor(upload) -> ov.Tensor:
    """Convert an uploaded file object into an OpenVINO tensor image (H, W, C)."""
    # Read all bytes from the uploaded file stream.
    data = upload.read()

    # If no bytes were uploaded, reject the request as invalid input.
    if not data:
        raise ValueError("Uploaded image is empty.")

    try:
        # Open the bytes as an image and force RGB so the model gets 3 channels.
        image = Image.open(BytesIO(data)).convert("RGB")
    except UnidentifiedImageError as exc:
        # If PIL cannot decode the file, return a clean user-facing validation error.
        raise ValueError("Could not read the uploaded image format.") from exc

    # Convert image to uint8 NumPy array, then wrap as OpenVINO tensor.
    return ov.Tensor(np.asarray(image, dtype=np.uint8))


@app.get("/")
def index():
    """Simple metadata endpoint so callers can see available routes."""
    return jsonify(
        {
            "service": "openvino-vlm-backend",
            "status": "ok",
            "health_endpoint": "/api/health",
            "chat_endpoint": "/api/chat",
        }
    )


@app.route("/api/chat", methods=["POST", "OPTIONS"])
def chat():
    """Main endpoint: accepts form data with prompt + optional image and returns model answer."""
    # CORS preflight request: return empty success immediately.
    if request.method == "OPTIONS":
        return "", 204

    # Read prompt from form-data and trim leading/trailing spaces.
    prompt = (request.form.get("prompt") or "").strip()

    # Prompt is required to run generation.
    if not prompt:
        return jsonify({"error": "Prompt is required."}), 400

    # We always pass a list of images to the model (empty list for text-only chat).
    images = []

    # Read optional uploaded image from multipart field named "image".
    upload = request.files.get("image")
    if upload and upload.filename:
        try:
            # Validate and convert the uploaded image into model-ready tensor.
            images.append(image_to_tensor(upload))
        except ValueError as exc:
            # Input validation issues (bad image format, empty image) return 400.
            return jsonify({"error": str(exc)}), 400

    try:
        # We mutate/read the module-level pipeline variable.
        global pipeline

        # Lazy-load model on first chat request to avoid startup cost at import time.
        if pipeline is None:
            # Fail early with clear error if the model directory is missing.
            if not MODEL_DIR.exists():
                raise FileNotFoundError(f"Model directory not found: {MODEL_DIR}")

            # Create VLM pipeline using configured model directory and device.
            pipeline = VLMPipeline(str(MODEL_DIR), DEVICE)

        # Serialize generation calls. This avoids race issues in shared pipeline usage.
        with pipeline_lock:
            result = pipeline.generate(
                prompt,
                images=images,
                generation_config=GenerationConfig(max_new_tokens=MAX_NEW_TOKENS),
            )
    except Exception as exc:
        # Any unexpected inference/init error becomes a 500 response.
        return jsonify({"error": f"Inference failed: {exc}"}), 500

    # Many OpenVINO GenAI responses expose generated text in result.texts.
    texts = getattr(result, "texts", None)

    # Return first generated text if available, else fallback to string conversion.
    return jsonify({"answer": texts[0] if texts else str(result)})


@app.after_request
def add_cors_headers(response):
    """Attach CORS headers to every response so browser frontend can call this API."""
    response.headers["Access-Control-Allow-Origin"] = CORS_ALLOW_ORIGIN
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


if __name__ == "__main__":
    # Local development server bind/port.
    app.run(host="127.0.0.1", port=8000, debug=False)
