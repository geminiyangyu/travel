import sys
try:
    from pdf2image import convert_from_path
    pages = convert_from_path(sys.argv[1], 100)
    for i, page in enumerate(pages):
        page.save(f'page_{i+1}.png', 'PNG')
    print("pdf2image successful")
except Exception as e:
    print("pdf2image failed:", e)
    
    # Try using macOS Cocoa/Quartz via PyObjC (often built-in in system python on mac)
    try:
        import objc
        from Foundation import NSURL
        from AppKit import NSImage
        # Actually Quartz is the CoreGraphics/PDFKit framework
        objc.loadBundle('PDFKit', bundle_path='/System/Library/Frameworks/PDFKit.framework', module_globals=globals())
        pdf_url = NSURL.fileURLWithPath_(sys.argv[1])
        pdf_doc = PDFDocument.alloc().initWithURL_(pdf_url)
        for i in range(pdf_doc.pageCount()):
            page = pdf_doc.pageAtIndex_(i)
            # Create an NSImage from the page data or draw it
            # To draw PDF page to image:
            rect = page.boundsForBox_(0) # kPDFDisplayBoxMediaBox = 0
            # simple rendering using custom script
        print("Quartz imported, trying to render...")
    except Exception as e2:
        print("Quartz failed:", e2)
