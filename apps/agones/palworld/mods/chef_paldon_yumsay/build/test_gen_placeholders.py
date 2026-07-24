import json
import os
import tempfile
from PIL import Image
from gen_placeholders import generate


def test_generates_png_at_correct_dimensions():
    with tempfile.TemporaryDirectory() as d:
        manifest = os.path.join(d, "slots.json")
        with open(manifest, "w") as f:
            json.dump({"slots": [{"path": "workshop/thumbnail.png", "width": 512, "height": 512}]}, f)
        written = generate(manifest, d)
        assert len(written) == 1
        out = os.path.join(d, "workshop/thumbnail.png")
        assert os.path.exists(out)
        with Image.open(out) as img:
            assert img.size == (512, 512)


def test_generates_multiple_and_creates_dirs():
    with tempfile.TemporaryDirectory() as d:
        manifest = os.path.join(d, "slots.json")
        slots = {"slots": [
            {"path": "a/one.png", "width": 128, "height": 128},
            {"path": "b/two.png", "width": 256, "height": 64},
        ]}
        with open(manifest, "w") as f:
            json.dump(slots, f)
        written = generate(manifest, d)
        assert len(written) == 2
        with Image.open(os.path.join(d, "b/two.png")) as img:
            assert img.size == (256, 64)
