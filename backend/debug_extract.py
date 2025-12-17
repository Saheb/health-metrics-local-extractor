#!/usr/bin/env python3
"""Debug script to test extraction from a specific PDF."""

import sys
from extractor import extract_text_from_pdf_by_pages

def main():
    if len(sys.argv) < 2:
        print("Usage: python debug_extract.py <path_to_pdf>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    
    print(f"Reading PDF: {pdf_path}")
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()
    
    print(f"PDF size: {len(pdf_bytes)} bytes")
    
    # Step 1: Test text extraction
    print("\n=== STEP 1: Testing Text Extraction ===")
    pages = extract_text_from_pdf_by_pages(pdf_bytes)
    
    print(f"Number of pages extracted: {len(pages)}")
    for i, page in enumerate(pages):
        print(f"\n--- Page {i+1} ({len(page)} chars) ---")
        preview = page[:500] if len(page) > 500 else page
        print(preview)
        if len(page) > 500:
            print("... [truncated]")
    
    total_text = "".join(pages)
    print(f"\n=== Total extracted text: {len(total_text)} characters ===")
    
    if len(total_text.strip()) < 50:
        print("\n⚠️  WARNING: Very little text extracted! This might be a scanned/image PDF.")
        print("Checking if OCR is available...")
        try:
            from pdf2image import convert_from_bytes
            import pytesseract
            print("✓ OCR dependencies available")
        except ImportError as e:
            print(f"✗ OCR dependencies missing: {e}")
            return
    
    # Step 2: Test LLM extraction
    print("\n=== STEP 2: Testing LLM Extraction ===")
    try:
        from llm_engine import get_llm_engine
        llm = get_llm_engine()
        
        # Only use first 14000 chars to stay in context
        test_text = total_text[:14000]
        print(f"Sending {len(test_text)} chars to LLM...")
        
        print("\n--- LLM Output ---")
        full_output = ""
        for chunk in llm.extract_health_parameters(test_text):
            print(chunk, end="", flush=True)
            full_output += chunk
        print("\n--- End LLM Output ---")
        
        print(f"\nTotal output length: {len(full_output)} chars")
        
        # Try to parse as JSON lines
        import json
        lines = full_output.strip().split('\n')
        valid_json_count = 0
        for line in lines:
            line = line.strip()
            if line and not line.startswith('#'):
                try:
                    obj = json.loads(line)
                    valid_json_count += 1
                    print(f"✓ Valid JSON: {obj.get('test_name', 'unknown')}")
                except json.JSONDecodeError:
                    print(f"✗ Invalid JSON: {line[:100]}")
        
        print(f"\nTotal valid JSON objects: {valid_json_count}")
        
    except Exception as e:
        print(f"Error during LLM extraction: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
