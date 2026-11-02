import fitz # PyMuPDF
from PIL import Image
import os

pdf_path = r"C:\Users\Admin\.gemini\antigravity-ide\brain\7df91433-f9c8-4a99-88c4-ce3f2e491778\.user_uploaded\media_1793159618809.pdf"
output_dir = r"c:\Users\Admin\OneDrive\Desktop\cft\public"
os.makedirs(output_dir, exist_ok=True)

doc = fitz.open(pdf_path)
print(f"Total pages: {len(doc)}")

# Render Page 1 at 3x resolution (high DPI)
page1 = doc[0]
pix1 = page1.get_pixmap(dpi=300)
page1_path = os.path.join(output_dir, "logo-page1.png")
pix1.save(page1_path)
print(f"Saved page 1 to {page1_path} ({pix1.width}x{pix1.height})")

# Render Page 2 at 3x resolution
page2 = doc[1]
pix2 = page2.get_pixmap(dpi=300)
page2_path = os.path.join(output_dir, "logo-page2.png")
pix2.save(page2_path)
print(f"Saved page 2 to {page2_path} ({pix2.width}x{pix2.height})")

# Open page 1 with Pillow
img1 = Image.open(page1_path)
width, height = img1.size

# In page 1:
# The logo content is centered. Let's find bounding box of non-cream background or crop nicely.
# Let's crop the emblem/icon on the left:
# In page 1 (approx 2:1 aspect ratio), the circular saw icon is on the left, roughly x: 4% to 30%, y: 20% to 80%
icon_crop = img1.crop((int(width * 0.04), int(height * 0.22), int(width * 0.30), int(height * 0.78)))
icon_path = os.path.join(output_dir, "logo-icon.png")
icon_crop.save(icon_path)
print(f"Saved icon to {icon_path} ({icon_crop.size})")

# Crop the full horizontal logo (icon + text):
# Roughly x: 4% to 96%, y: 20% to 80%
full_crop = img1.crop((int(width * 0.04), int(height * 0.22), int(width * 0.96), int(height * 0.78)))
full_path = os.path.join(output_dir, "logo.png")
full_crop.save(full_path)
print(f"Saved logo to {full_path} ({full_crop.size})")

# Let's also create a transparent version of the icon for dark navbar
# The cream background is around RGB(244, 240, 228) or similar
icon_rgba = icon_crop.convert("RGBA")
datas = icon_rgba.getdata()
new_data = []
# Sample top-left corner color as background
bg_r, bg_g, bg_b, _ = datas[0]
threshold = 30

for item in datas:
    r, g, b, a = item
    if abs(r - bg_r) < threshold and abs(g - bg_g) < threshold and abs(b - bg_b) < threshold:
        new_data.append((255, 255, 255, 0)) # transparent
    else:
        new_data.append(item)

icon_rgba.putdata(new_data)
icon_transparent_path = os.path.join(output_dir, "logo-icon-transparent.png")
icon_rgba.save(icon_transparent_path)
print(f"Saved transparent icon to {icon_transparent_path}")
