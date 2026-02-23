from pathlib import Path

import numpy as np
import openvino as ov
from openvino_genai import GenerationConfig, VLMPipeline
from PIL import Image

backend_dir = Path(__file__).resolve().parent.parent
model_dir = backend_dir / "models" / "Phi-3.5-vision-instruct-int4-ov"
image_path = backend_dir / "samples" / "test.jpg"

image = Image.open(image_path).convert("RGB")
image_tensor = ov.Tensor(np.asarray(image, dtype=np.uint8))

pipeline = VLMPipeline(str(model_dir), "CPU")
result = pipeline.generate(
    "What's in this image? Be specific.",
    images=[image_tensor],
    generation_config=GenerationConfig(max_new_tokens=150),
)

print(result.texts[0] if getattr(result, "texts", None) else result)
