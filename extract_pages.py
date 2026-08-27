import fitz
import os

pdf_path = "/Users/yangchengyu/Desktop/test/旅遊手冊管理系統 | 雙卡刷卡攻略 & 多國行程自訂.pdf"
output_dir = "/Users/yangchengyu/.gemini/antigravity/brain/1bb97181-7997-4d39-952f-5a62aed902c3/pdf_pages"
os.makedirs(output_dir, exist_ok=True)

doc = fitz.open(pdf_path)
print(f"Total pages: {len(doc)}")
for i in range(len(doc)):
    page = doc.load_page(i)
    pix = page.get_pixmap(dpi=150)
    out_path = os.path.join(output_dir, f"page_{i+1}.png")
    pix.save(out_path)
    print(f"Saved {out_path}")
