import os, json, base64, io, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
os.makedirs(ASSETS_DIR, exist_ok=True)

random.seed(606)

def make_gradient(w, h, stops):
    """Vertical linear gradient from list of (pos 0..1, (r,g,b))"""
    img = Image.new("RGB", (1, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                f = (t - p0) / max(1e-6, (p1 - p0))
                r = int(c0[0] + (c1[0] - c0[0]) * f)
                g = int(c0[1] + (c1[1] - c0[1]) * f)
                b = int(c0[2] + (c1[2] - c0[2]) * f)
                px[0, y] = (r, g, b)
                break
    return img.resize((w, h), Image.Resampling.BILINEAR)

def add_glow_sun(img, cx, cy, radius, color_top=(255, 210, 90), color_bot=(255, 46, 136)):
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    # Outer glow
    for r in range(int(radius * 1.6), radius, -8):
        alpha = int(35 * (1 - (r - radius) / (radius * 0.6)))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 70, 140, max(0, alpha)))
    # Sun disc with scanline blinds
    sun = Image.new("RGBA", (radius * 2, radius * 2), (0, 0, 0, 0))
    sp = sun.load()
    for y in range(radius * 2):
        t = y / (radius * 2)
        # Synthwave horizontal stripes in lower half
        if t > 0.48 and int(y / max(4, int(18 * (1.1 - t)))) % 3 == 0:
            continue
        r_c = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        g_c = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        b_c = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        dy = y - radius
        dx_max = radius * radius - dy * dy
        if dx_max > 0:
            xm = int(math.sqrt(dx_max))
            for x in range(radius - xm, radius + xm):
                sp[x, y] = (r_c, g_c, b_c, 240)
    overlay.alpha_composite(sun, (cx - radius, cy - radius))
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

def draw_palm(draw, bx, by, height, lean, color=(10, 6, 18, 255), scale=1.0):
    # Curved trunk
    pts = []
    steps = 16
    tx, ty = bx, by
    for i in range(steps + 1):
        t = i / steps
        tx = bx + lean * (t ** 1.6) * height
        ty = by - t * height
        w = max(2, int((1 - t * 0.65) * 14 * scale))
        pts.append((tx, ty, w))
    for i in range(len(pts) - 1):
        x0, y0, w0 = pts[i]
        x1, y1, w1 = pts[i + 1]
        draw.line([(x0, y0), (x1, y1)], fill=color, width=w0)
    # Fronds at crown
    cx, cy, _ = pts[-1]
    angles = [-155, -130, -100, -70, -35, -10, 15, 45]
    for ang in angles:
        rad = math.radians(ang)
        flen = height * 0.42
        fx = cx + math.cos(rad) * flen
        fy = cy + math.sin(rad) * flen + flen * 0.28
        mx = (cx + fx) / 2
        my = (cy + fy) / 2 - height * 0.09
        draw.polygon([(cx, cy), (mx, my), (fx, fy), (mx, my + 8 * scale)], fill=color)

def draw_skyline_layer(draw, w, h, base_y, min_h, max_h, b_color, win_colors, density=0.45):
    x = 0
    while x < w:
        bw = random.randint(int(w * 0.025), int(w * 0.065))
        bh = random.randint(min_h, max_h)
        top = base_y - bh
        draw.rectangle([x, top, x + bw, base_y], fill=b_color)
        # Art deco spire or stepped roof
        if random.random() < 0.45:
            step_w = int(bw * 0.6)
            step_h = int(bh * 0.14)
            sx = x + (bw - step_w) // 2
            draw.rectangle([sx, top - step_h, sx + step_w, top], fill=b_color)
            if random.random() < 0.5:
                draw.line([(x + bw // 2, top - step_h - 35), (x + bw // 2, top - step_h)], fill=win_colors[0], width=2)
        # Neon vertical strip or windows
        if random.random() < 0.35:
            nc = random.choice(win_colors)
            nx = x + random.choice([4, bw - 6, bw // 2])
            draw.line([(nx, top + 8), (nx, base_y - 10)], fill=nc, width=2)
        for wy in range(top + 14, base_y - 16, 14):
            for wx in range(x + 8, x + bw - 10, 12):
                if random.random() < density:
                    wc = random.choice(win_colors)
                    draw.rectangle([wx, wy, wx + 5, wy + 7], fill=wc)
        x += bw - random.randint(2, 10)

def make_blur_b64(img):
    small = img.convert("RGB").resize((24, max(14, int(24 * img.height / img.width))), Image.Resampling.BILINEAR)
    small = small.filter(ImageFilter.GaussianBlur(1.2))
    buf = io.BytesIO()
    small.save(buf, format="WEBP", quality=50)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

def save_with_srcset(img, filename, widths=(480, 960, 1600, 2560), make_variants=True):
    name, ext = os.path.splitext(filename)
    fmt = "AVIF" if ext == ".avif" else ("WEBP" if ext == ".webp" else "PNG")
    out_path = os.path.join(ASSETS_DIR, filename)
    save_kwargs = {"quality": 82} if fmt in ("AVIF", "WEBP") else {"optimize": True}
    img.save(out_path, format=fmt, **save_kwargs)
    if make_variants and fmt in ("AVIF", "WEBP"):
        for tw in widths:
            if tw <= img.width:
                th = max(1, int(img.height * (tw / img.width)))
                resized = img.resize((tw, th), Image.Resampling.LANCZOS)
                vpath = os.path.join(ASSETS_DIR, f"{name}-{tw}{ext}")
                resized.save(vpath, format=fmt, **save_kwargs)
    return make_blur_b64(img)

manifest = {}

# 1. hero-sky.avif (2560x1097)
print("Generating hero-sky.avif...")
sky = make_gradient(2560, 1097, [
    (0.0, (14, 6, 28)),
    (0.28, (55, 14, 78)),
    (0.58, (185, 28, 115)),
    (0.82, (255, 82, 95)),
    (1.0, (255, 155, 50))
])
sky = add_glow_sun(sky, 1280, 690, 310)
d_sky = ImageDraw.Draw(sky, "RGBA")
for _ in range(18):
    cx = random.randint(100, 2460)
    cy = random.randint(220, 820)
    cw = random.randint(240, 680)
    ch = random.randint(22, 58)
    d_sky.ellipse([cx - cw, cy - ch, cx + cw, cy + ch], fill=(255, 70, 140, 38))
manifest["hero-sky.avif"] = save_with_srcset(sky, "hero-sky.avif")

# 2. hero-skyline.png (2560x700, transparent)
print("Generating hero-skyline.png...")
skyline = Image.new("RGBA", (2560, 700), (0, 0, 0, 0))
d_sk = ImageDraw.Draw(skyline)
draw_skyline_layer(d_sk, 2560, 700, 700, 180, 480, (26, 8, 51, 245), [(20, 224, 208, 210), (255, 46, 136, 210), (255, 195, 110, 180)], 0.32)
draw_skyline_layer(d_sk, 2560, 700, 700, 100, 330, (15, 5, 30, 255), [(255, 46, 136, 230), (20, 224, 208, 230), (255, 140, 60, 200)], 0.4)
save_with_srcset(skyline, "hero-skyline.png", make_variants=False)

# 3. hero-palms.png (2560x1000, transparent)
print("Generating hero-palms.png...")
palms = Image.new("RGBA", (2560, 1000), (0, 0, 0, 0))
d_pm = ImageDraw.Draw(palms)
d_pm.rectangle([0, 930, 2560, 1000], fill=(10, 6, 18, 255))
palm_specs = [(140, 960, 740, 0.25, 1.2), (340, 970, 560, 0.35, 0.9), (2420, 960, 760, -0.25, 1.2), (2210, 970, 540, -0.32, 0.9)]
for bx, by, ph, ln, sc in palm_specs:
    draw_palm(d_pm, bx, by, ph, ln, (10, 6, 18, 255), sc)
save_with_srcset(palms, "hero-palms.png", make_variants=False)

# 4. char-lucia.webp & 5. char-jason.webp (1200x1600)
def make_character(name, primary, secondary, is_lucia=True):
    img = make_gradient(1200, 1600, [
        (0.0, (12, 6, 24)),
        (0.45, secondary),
        (0.85, primary),
        (1.0, (16, 8, 30))
    ])
    img = add_glow_sun(img, 600, 560, 340, color_top=primary, color_bot=secondary)
    d = ImageDraw.Draw(img, "RGBA")
    # Bokeh neon lights
    for _ in range(32):
        bx = random.randint(60, 1140)
        by = random.randint(120, 1450)
        br = random.randint(18, 85)
        bc = primary if random.random() < 0.5 else (20, 224, 208)
        d.ellipse([bx - br, by - br, bx + br, by + br], fill=(bc[0], bc[1], bc[2], 38))
    # Stylized anonymous silhouette (no real face)
    sil = (14, 7, 26, 250)
    rim = (20, 224, 208, 220) if is_lucia else (255, 46, 136, 220)
    if is_lucia:
        # Three-quarter determined jacket silhouette
        d.polygon([(260, 1600), (340, 930), (470, 820), (740, 830), (880, 960), (940, 1600)], fill=sil, outline=rim, width=4)
        # Collar & jacket lapel neon accent
        d.line([(470, 820), (585, 1080), (720, 830)], fill=primary + (230,), width=6)
        # Head & pulled-back hair silhouette
        d.ellipse([485, 450, 715, 745], fill=sil, outline=rim, width=4)
        d.ellipse([660, 520, 775, 635], fill=sil) # Ponytail/bun
        # Neck
        d.rectangle([555, 710, 645, 845], fill=sil)
        # Aviator / visor neon reflection (anonymous)
        d.polygon([(505, 565), (675, 560), (660, 620), (520, 620)], fill=(255, 46, 136, 210), outline=(20, 224, 208, 255))
    else:
        # Broad shoulder floral shirt + sunglasses fugitive silhouette
        d.polygon([(200, 1600), (280, 890), (450, 790), (760, 790), (920, 890), (1000, 1600)], fill=sil, outline=rim, width=4)
        # Subtle tropical palm pattern on jacket/shirt
        d.line([(460, 790), (600, 1140), (750, 790)], fill=(20, 224, 208, 220), width=6)
        # Head & cap/short hair silhouette
        d.ellipse([475, 420, 725, 735], fill=sil, outline=rim, width=4)
        d.polygon([(465, 500), (745, 470), (795, 510), (475, 525)], fill=sil, outline=rim, width=3)
        d.rectangle([545, 700, 660, 820], fill=sil)
        # Dark sunglasses with street light reflection
        d.rectangle([505, 548, 595, 602], fill=(20, 224, 208, 220))
        d.rectangle([615, 548, 705, 602], fill=(20, 224, 208, 220))
        d.line([(595, 565), (615, 565)], fill=(255, 244, 230, 240), width=4)
    return img

print("Generating character portraits...")
manifest["char-lucia.webp"] = save_with_srcset(make_character("lucia", (255, 46, 136), (42, 10, 74), True), "char-lucia.webp", widths=(480, 960, 1200))
manifest["char-jason.webp"] = save_with_srcset(make_character("jason", (20, 224, 208), (42, 10, 74), False), "char-jason.webp", widths=(480, 960, 1200))

# 6-9. City scenes & vehicles & gallery (16:9 - 1600x900)
def make_scene(theme, w=1600, h=900):
    if theme == "ocean-strip":
        img = make_gradient(w, h, [(0, (12, 6, 30)), (0.5, (90, 18, 95)), (0.72, (255, 46, 136)), (1, (18, 10, 32))])
        img = add_glow_sun(img, int(w * 0.72), int(h * 0.48), int(h * 0.24))
        d = ImageDraw.Draw(img, "RGBA")
        draw_skyline_layer(d, w, h, int(h * 0.65), 120, 340, (22, 8, 45, 255), [(20, 224, 208, 235), (255, 46, 136, 235)], 0.5)
        # Wet road reflection
        d.rectangle([0, int(h * 0.65), w, h], fill=(14, 8, 28, 245))
        for i in range(28):
            ry = random.randint(int(h * 0.67), h - 15)
            rw = random.randint(80, 360)
            rx = random.randint(0, w - rw)
            rc = random.choice([(255, 46, 136, 95), (20, 224, 208, 95), (255, 122, 26, 90)])
            d.rectangle([rx, ry, rx + rw, ry + 5], fill=rc)
        draw_palm(d, int(w * 0.14), int(h * 0.75), int(h * 0.48), 0.25)
        draw_palm(d, int(w * 0.88), int(h * 0.78), int(h * 0.52), -0.22)
    elif theme == "everglades":
        img = make_gradient(w, h, [(0, (18, 28, 42)), (0.45, (45, 95, 90)), (0.7, (255, 135, 65)), (1, (10, 24, 22))])
        img = add_glow_sun(img, int(w * 0.35), int(h * 0.52), int(h * 0.22), (255, 220, 130), (20, 224, 208))
        d = ImageDraw.Draw(img, "RGBA")
        # Swamp water & mist layers
        d.rectangle([0, int(h * 0.62), w, h], fill=(12, 32, 34, 230))
        for i in range(12):
            my = int(h * 0.52) + i * 26
            d.ellipse([-100, my, w + 100, my + 48], fill=(20, 224, 208, 24))
        # Cypress / mangrove silhouettes & airboat + distant alligator silhouette
        d.polygon([(int(w * 0.62), int(h * 0.74)), (int(w * 0.76), int(h * 0.74)), (int(w * 0.79), int(h * 0.71)), (int(w * 0.60), int(h * 0.71))], fill=(10, 6, 18, 255))
        d.rectangle([int(w * 0.62), int(h * 0.63), int(w * 0.67), int(h * 0.71)], outline=(20, 224, 208, 200), width=3)
        # Alligator ridges in water
        d.polygon([(int(w * 0.25), int(h * 0.83)), (int(w * 0.29), int(h * 0.81)), (int(w * 0.35), int(h * 0.83))], fill=(8, 12, 14, 255))
    elif theme == "port":
        img = make_gradient(w, h, [(0, (10, 6, 18)), (0.5, (42, 16, 48)), (0.75, (215, 95, 24)), (1, (12, 10, 22))])
        d = ImageDraw.Draw(img, "RGBA")
        # Cranes
        for cx in (int(w * 0.22), int(w * 0.54), int(w * 0.78)):
            d.line([(cx, int(h * 0.64)), (cx + 70, int(h * 0.22)), (cx + 260, int(h * 0.16))], fill=(15, 8, 24, 255), width=8)
            d.line([(cx + 70, int(h * 0.22)), (cx + 130, int(h * 0.64))], fill=(15, 8, 24, 255), width=6)
            d.ellipse([cx + 60, int(h * 0.20), cx + 84, int(h * 0.24)], fill=(255, 140, 26, 240))
        # Stacked containers
        for i in range(9):
            bx = 80 + i * 160
            bh = random.randint(70, 170)
            cc = random.choice([(38, 14, 58, 255), (85, 24, 55, 255), (20, 55, 68, 255)])
            d.rectangle([bx, int(h * 0.66) - bh, bx + 145, int(h * 0.66)], fill=cc, outline=(255, 122, 26, 160))
        d.rectangle([0, int(h * 0.66), w, h], fill=(10, 8, 20, 248))
    elif theme == "downtown":
        img = make_gradient(w, h, [(0, (15, 6, 35)), (0.5, (110, 20, 95)), (0.8, (255, 95, 45)), (1, (20, 8, 35))])
        img = add_glow_sun(img, int(w * 0.5), int(h * 0.55), int(h * 0.28))
        d = ImageDraw.Draw(img, "RGBA")
        draw_skyline_layer(d, w, h, int(h * 0.78), 260, 620, (16, 7, 34, 250), [(20, 224, 208, 220), (255, 46, 136, 220), (255, 165, 70, 210)], 0.55)
        # Light trails
        for i in range(14):
            y = int(h * 0.78) + i * 12
            d.line([(0, y), (w, y + 20)], fill=(255, 46, 136, 150) if i % 2 == 0 else (20, 224, 208, 150), width=4)
    elif theme == "convertible":
        img = make_scene("ocean-strip", w, h)
        d = ImageDraw.Draw(img, "RGBA")
        # Stylized lowrider convertible silhouette with neon underglow & tail lights
        d.ellipse([int(w * 0.22), int(h * 0.80), int(w * 0.78), int(h * 0.88)], fill=(20, 224, 208, 95))
        d.polygon([
            (int(w * 0.20), int(h * 0.78)),
            (int(w * 0.28), int(h * 0.67)),
            (int(w * 0.44), int(h * 0.67)),
            (int(w * 0.52), int(h * 0.60)),
            (int(w * 0.57), int(h * 0.67)),
            (int(w * 0.80), int(h * 0.69)),
            (int(w * 0.83), int(h * 0.79))
        ], fill=(14, 7, 26, 255), outline=(255, 46, 136, 240), width=4)
        for wx in (int(w * 0.32), int(w * 0.70)):
            d.ellipse([wx - 58, int(h * 0.72), wx + 58, int(h * 0.72) + 116], fill=(8, 5, 15, 255), outline=(20, 224, 208, 240), width=5)
        d.rectangle([int(w * 0.20), int(h * 0.70), int(w * 0.23), int(h * 0.74)], fill=(255, 30, 90, 255))
        d.rectangle([int(w * 0.79), int(h * 0.71), int(w * 0.82), int(h * 0.75)], fill=(255, 230, 170, 255))
    elif theme == "speedboat":
        img = make_gradient(w, h, [(0, (24, 8, 52)), (0.48, (225, 45, 125)), (0.68, (255, 130, 35)), (1, (14, 18, 42))])
        img = add_glow_sun(img, int(w * 0.65), int(h * 0.46), int(h * 0.26))
        d = ImageDraw.Draw(img, "RGBA")
        d.rectangle([0, int(h * 0.60), w, h], fill=(16, 14, 38, 235))
        # Sleek offshore speedboat silhouette + teal spray wake
        d.polygon([
            (int(w * 0.18), int(h * 0.73)),
            (int(w * 0.48), int(h * 0.64)),
            (int(w * 0.84), int(h * 0.67)),
            (int(w * 0.72), int(h * 0.75))
        ], fill=(12, 6, 24, 255), outline=(20, 224, 208, 240), width=4)
        d.line([(int(w * 0.05), int(h * 0.78)), (int(w * 0.45), int(h * 0.74))], fill=(255, 244, 230, 210), width=6)
    elif theme == "radio-booth":
        img = make_gradient(w, h, [(0, (16, 6, 32)), (0.6, (68, 12, 74)), (1, (12, 6, 22))])
        d = ImageDraw.Draw(img, "RGBA")
        # Neon ON AIR frame & retro studio condenser mic
        d.rounded_rectangle([int(w * 0.15), int(h * 0.12), int(w * 0.85), int(h * 0.30)], radius=24, outline=(255, 46, 136, 245), width=6)
        # Equalizer bars in background
        for i in range(16):
            bx = int(w * 0.14) + i * int(w * 0.045)
            bh = random.randint(int(h * 0.12), int(h * 0.42))
            d.rectangle([bx, int(h * 0.82) - bh, bx + 24, int(h * 0.82)], fill=(20, 224, 208, 130))
        # Microphone silhouette
        cx, cy = w // 2, int(h * 0.56)
        d.rounded_rectangle([cx - 75, cy - 140, cx + 75, cy + 40], radius=70, fill=(18, 10, 32, 255), outline=(20, 224, 208, 255), width=6)
        for gy in range(cy - 110, cy + 15, 22):
            d.line([(cx - 58, gy), (cx + 58, gy)], fill=(255, 46, 136, 210), width=3)
        d.arc([cx - 115, cy - 80, cx + 115, cy + 110], start=0, end=180, fill=(255, 244, 230, 230), width=8)
        d.line([(cx, cy + 110), (cx, h)], fill=(255, 244, 230, 230), width=12)
    return img

print("Generating city, vehicle and radio assets...")
manifest["city-ocean-strip.avif"] = save_with_srcset(make_scene("ocean-strip"), "city-ocean-strip.avif")
manifest["city-everglades.avif"] = save_with_srcset(make_scene("everglades"), "city-everglades.avif")
manifest["city-port.avif"] = save_with_srcset(make_scene("port"), "city-port.avif")
manifest["city-downtown.avif"] = save_with_srcset(make_scene("downtown"), "city-downtown.avif")
manifest["vehicle-convertible.webp"] = save_with_srcset(make_scene("convertible"), "vehicle-convertible.webp")
manifest["vehicle-speedboat.webp"] = save_with_srcset(make_scene("speedboat"), "vehicle-speedboat.webp")
manifest["radio-booth.webp"] = save_with_srcset(make_scene("radio-booth", 1080, 1080), "radio-booth.webp", widths=(480, 960, 1080))

# 13. gallery-01..08.avif
gallery_themes = [
    ("gallery-01.avif", "ocean-strip", (1600, 1000)),
    ("gallery-02.avif", "downtown", (1600, 1000)),
    ("gallery-03.avif", "convertible", (1600, 1000)),
    ("gallery-04.avif", "everglades", (1600, 1000)),
    ("gallery-05.avif", "speedboat", (1600, 1000)),
    ("gallery-06.avif", "port", (1600, 1000)),
    ("gallery-07.avif", "ocean-strip", (1600, 1000)),
    ("gallery-08.avif", "downtown", (1600, 1000)),
]
print("Generating gallery-01..08.avif...")
for idx, (gname, gtheme, (gw, gh)) in enumerate(gallery_themes, 1):
    gimg = make_scene(gtheme, gw, gh)
    gd = ImageDraw.Draw(gimg, "RGBA")
    # Distinct color wash & composition variation per gallery photo
    tint = [(255, 46, 136, 28), (20, 224, 208, 28), (255, 122, 26, 28), (140, 40, 255, 28)][idx % 4]
    gd.rectangle([0, 0, gw, gh], fill=tint)
    if idx in (1, 5, 7):
        draw_palm(gd, int(gw * (0.2 + 0.1 * (idx % 3))), gh, int(gh * 0.68), 0.18 if idx % 2 else -0.2)
    manifest[gname] = save_with_srcset(gimg, gname)

# 15. og-image.png (1200x630), icon-192.png, icon-512.png
print("Generating og-image.png, icon-192.png, icon-512.png...")
og = make_scene("ocean-strip", 1200, 630)
save_with_srcset(og, "og-image.png", make_variants=False)

for sz in (192, 512):
    ic = make_gradient(sz, sz, [(0, (42, 10, 74)), (0.55, (255, 46, 136)), (1, (255, 122, 26))])
    idraw = ImageDraw.Draw(ic, "RGBA")
    pad = int(sz * 0.08)
    idraw.rounded_rectangle([pad, pad, sz - pad, sz - pad], radius=int(sz * 0.18), fill=(10, 6, 18, 235), outline=(20, 224, 208, 255), width=max(3, sz // 48))
    # Geometric "VI" monogram without external font dependency
    # V
    v_top = int(sz * 0.26)
    v_bot = int(sz * 0.74)
    w_str = max(6, sz // 14)
    idraw.line([(int(sz * 0.24), v_top), (int(sz * 0.38), v_bot), (int(sz * 0.52), v_top)], fill=(255, 46, 136, 255), width=w_str, joint="curve")
    # I
    idraw.line([(int(sz * 0.68), v_top), (int(sz * 0.68), v_bot)], fill=(20, 224, 208, 255), width=w_str)
    save_with_srcset(ic, f"icon-{sz}.png", make_variants=False)

with open(os.path.join(ASSETS_DIR, "placeholders.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)

print("All assets generated successfully!")
