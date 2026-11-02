import base64
from PIL import Image
import io

img = Image.open('public/logo-icon.png')
img.thumbnail((200, 200), Image.Resampling.LANCZOS)
buf = io.BytesIO()
img.save(buf, format='PNG')
b64_icon = base64.b64encode(buf.getvalue()).decode('utf-8')

# Also horizontal logo
img_horiz = Image.open('public/logo.png')
img_horiz.thumbnail((450, 150), Image.Resampling.LANCZOS)
buf_h = io.BytesIO()
img_horiz.save(buf_h, format='PNG')
b64_logo = base64.b64encode(buf_h.getvalue()).decode('utf-8')

with open('src/utils/logoBase64.ts', 'w', encoding='utf-8') as f:
    f.write(f'export const LOGO_ICON_BASE64 = "data:image/png;base64,{b64_icon}";\n\n')
    f.write(f'export const LOGO_BANNER_BASE64 = "data:image/png;base64,{b64_logo}";\n')

print(f"Generated logoBase64.ts successfully. Icon: {len(b64_icon)} chars, Banner: {len(b64_logo)} chars")
