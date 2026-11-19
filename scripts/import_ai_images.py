import os, json, base64, io
from PIL import Image, ImageFilter, ImageOps

BRAIN_DIR = r"C:\Users\elton.lima\.gemini\antigravity\brain\9c16a6c2-8846-45c9-9740-c35b2eb7bd88"
ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")

MAP = [
    ("hero_sky_1795108272032.jpg", "hero-sky.avif", (2560, 1097), (480, 960, 1600, 2560)),
    ("char_lucia_1795108302121.jpg", "char-lucia.webp", (1200, 1600), (480, 960, 1200)),
    ("char_jason_1795108328962.jpg", "char-jason.webp", (1200, 1600), (480, 960, 1200)),
    ("city_ocean_strip_1795108278114.jpg", "city-ocean-strip.avif", (1600, 900), (480, 960, 1600, 2560)),
    ("city_everglades_1795108288814.jpg", "city-everglades.avif", (1600, 900), (480, 960, 1600, 2560)),
    ("city_port_1795108383083.jpg", "city-port.avif", (1600, 900), (480, 960, 1600, 2560)),
    ("city_downtown_1795108393845.jpg", "city-downtown.avif", (1600, 900), (480, 960, 1600, 2560)),
    ("vehicle_convertible_1795108280315.jpg", "vehicle-convertible.webp", (1600, 900), (480, 960, 1600)),
    ("vehicle_speedboat_1795108289188.jpg", "vehicle-speedboat.webp", (1600, 900), (480, 960, 1600)),
    ("gallery_01_1795108303470.jpg", "gallery-01.avif", (1600, 1000), (480, 960, 1600)),
    ("gallery_02_1795108341355.jpg", "gallery-02.avif", (1600, 1000), (480, 960, 1600)),
    ("gallery_03_1795108352729.jpg", "gallery-03.avif", (1600, 1000), (480, 960, 1600)),
    ("gallery_05_1795108308868.jpg", "gallery-05.avif", (1600, 1000), (480, 960, 1600)),
    ("gallery_06_1795108321752.jpg", "gallery-06.avif", (1600, 1000), (480, 960, 1600)),
]

placeholders_path = os.path.join(ASSETS_DIR, "placeholders.json")
with open(placeholders_path, "r", encoding="utf-8") as f:
    placeholders = json.load(f)

def make_blur_b64(img):
    small = img.convert("RGB").resize((24, max(14, int(24 * img.height / img.width))), Image.Resampling.BILINEAR)
    small = small.filter(ImageFilter.GaussianBlur(1.2))
    buf = io.BytesIO()
    small.save(buf, format="WEBP", quality=50)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

for src_name, out_name, (tw, th), widths in MAP:
    src_path = os.path.join(BRAIN_DIR, src_name)
    if not os.path.exists(src_path):
        print(f"[SKIP] Missing {src_path}")
        continue
    img = Image.open(src_path).convert("RGB")
    fitted = ImageOps.fit(img, (tw, th), method=Image.Resampling.LANCZOS)
    base, ext = os.path.splitext(out_name)
    fmt = "AVIF" if ext == ".avif" else "WEBP"
    fitted.save(os.path.join(ASSETS_DIR, out_name), format=fmt, quality=82)
    for w in widths:
        h = max(1, int(th * (w / tw)))
        v = fitted.resize((w, h), Image.Resampling.LANCZOS)
        v.save(os.path.join(ASSETS_DIR, f"{base}-{w}{ext}"), format=fmt, quality=82)
    placeholders[out_name] = make_blur_b64(fitted)
    print(f"[OK] {src_name} -> {out_name} + srcset {widths}")

# Update og-image.png from city_ocean_strip AI image
og_src = os.path.join(BRAIN_DIR, "city_ocean_strip_1795108278114.jpg")
if os.path.exists(og_src):
    og = ImageOps.fit(Image.open(og_src).convert("RGB"), (1200, 630), method=Image.Resampling.LANCZOS)
    og.save(os.path.join(ASSETS_DIR, "og-image.png"), format="PNG", optimize=True)
    print("[OK] og-image.png updated")

with open(placeholders_path, "w", encoding="utf-8") as f:
    json.dump(placeholders, f, indent=2)
print("Done updating placeholders.json")
