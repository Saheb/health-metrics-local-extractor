import pypdf
import io

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extracts text from a PDF file provided as bytes.
    First tries regular text extraction, then falls back to OCR for scanned PDFs.
    """
    # First, try regular text extraction (fast)
    text = _extract_text_regular(pdf_bytes)
    
    # If we got meaningful text, return it
    if text and len(text.strip()) > 50:
        return text.strip()
    
    # Otherwise, try OCR (slower, but works for scanned PDFs)
    print("Regular text extraction yielded little/no text. Attempting OCR...")
    ocr_text = _extract_text_ocr(pdf_bytes)
    
    if ocr_text:
        return ocr_text.strip()
    
    # Return whatever we got from regular extraction
    return text.strip() if text else ""


def extract_text_from_pdf_by_pages(pdf_bytes: bytes) -> list[str]:
    """
    Extracts text from each page of a PDF separately.
    Returns a list of strings, one per page.
    First tries regular text extraction, then falls back to OCR for scanned pages.
    """
    # First, try regular text extraction (fast)
    pages = _extract_text_regular_by_pages(pdf_bytes)
    
    # Check if we got meaningful text
    total_text = "".join(pages)
    if total_text and len(total_text.strip()) > 50:
        return pages
    
    # Otherwise, try OCR (slower, but works for scanned PDFs)
    print("Regular text extraction yielded little/no text. Attempting OCR...")
    return _extract_text_ocr_by_pages(pdf_bytes)


def _extract_text_regular(pdf_bytes: bytes) -> str:
    """Extract text using pypdf (for PDFs with embedded text)."""
    try:
        pdf_stream = io.BytesIO(pdf_bytes)
        reader = pypdf.PdfReader(pdf_stream)
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text
    except Exception as e:
        print(f"Error in regular text extraction: {e}")
        return ""


def _extract_text_regular_by_pages(pdf_bytes: bytes) -> list[str]:
    """Extract text from each page using pypdf."""
    try:
        pdf_stream = io.BytesIO(pdf_bytes)
        reader = pypdf.PdfReader(pdf_stream)
        pages = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            pages.append(page_text)
        return pages
    except Exception as e:
        print(f"Error in regular text extraction: {e}")
        return []


def _extract_text_ocr(pdf_bytes: bytes) -> str:
    """Extract text using OCR (for scanned PDFs)."""
    pages = _extract_text_ocr_by_pages(pdf_bytes)
    return "\n".join(pages)


def _extract_text_ocr_by_pages(pdf_bytes: bytes) -> list[str]:
    """Extract text from each page using OCR."""
    try:
        from pdf2image import convert_from_bytes
        import pytesseract
        
        # Convert PDF pages to images
        # Use higher DPI for better OCR accuracy
        images = convert_from_bytes(pdf_bytes, dpi=300)
        
        pages = []
        for i, image in enumerate(images):
            print(f"  OCR processing page {i + 1}/{len(images)}...")
            # Extract text from each page image
            page_text = pytesseract.image_to_string(image, lang='eng')
            pages.append(page_text if page_text else "")
        
        return pages
    except ImportError as e:
        print(f"OCR dependencies not installed: {e}")
        print("Install with: pip install pdf2image pytesseract")
        print("Also install Tesseract OCR: brew install tesseract (macOS)")
        return []
    except Exception as e:
        print(f"Error in OCR extraction: {e}")
        return []
