import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont


def _draw_slot(width, height):
    img = Image.new("RGB", (width, height), (44, 48, 56))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, width - 1, height - 1], outline=(120, 130, 140), width=max(1, min(width, height) // 64))
    label = f"{width}x{height}"
    font = ImageFont.load_default()
    box = draw.textbbox((0, 0), label, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    draw.text(((width - tw) / 2, (height - th) / 2), label, fill=(230, 235, 240), font=font)
    return img


def generate(manifest_path, out_root):
    with open(manifest_path) as f:
        manifest = json.load(f)
    written = []
    for slot in manifest["slots"]:
        out = os.path.join(out_root, slot["path"])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        img = _draw_slot(int(slot["width"]), int(slot["height"]))
        img.save(out, "PNG")
        written.append(out)
    return written


if __name__ == "__main__":
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    manifest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "art", "slots.json")
    paths = generate(manifest, root)
    for p in paths:
        print(f"wrote {p}")
