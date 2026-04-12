import fitz
import traceback

try:
    doc = fitz.open()
    page = doc.new_page()
    rect = fitz.Rect(100, 100, 300, 150)
    
    annot = page.add_stamp_annot(rect, stamp=10) # 10=Approved
    
    # Try different ways to create a stamp
    rect2 = fitz.Rect(100, 200, 300, 250)
    text_annot = page.add_freetext_annot(rect2, 'APPROVED\nBy Anuj', fontsize=12, fontname='helv', text_color=(0,1,0), fill_color=(0.9, 1, 0.9))
    text_annot.update()
    
    doc.save('test.pdf')
    print('SUCCESS')
except Exception as e:
    print('ERROR')
    traceback.print_exc()
