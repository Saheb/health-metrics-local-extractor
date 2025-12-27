from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from extractor import extract_text_from_pdf_by_pages
from llm_engine import get_llm_engine
from database import init_db, save_metric, get_all_metrics, MetricData, save_processed_file, get_processed_files, ProcessedFileData
import uvicorn

import asyncio

app = FastAPI(title="Health Metrics Local Extractor")

# Global lock for LLM inference to prevent race conditions
llm_lock = asyncio.Lock()

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    # Preload model on startup
    get_llm_engine()
    init_db()

@app.post("/save")
async def save_metric_endpoint(data: MetricData):
    try:
        save_metric(data)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/metrics")
async def get_metrics_endpoint():
    try:
        return get_all_metrics()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history")
async def get_history_endpoint():
    try:
        return get_processed_files()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/record_file_processing")
async def record_file_processing_endpoint(data: ProcessedFileData):
    try:
        save_processed_file(data)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/extract")
async def extract_health_data(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    try:
        contents = await file.read()
        pages = extract_text_from_pdf_by_pages(contents)
        
        if not pages or not any(p.strip() for p in pages):
            return {"error": "Could not extract text from PDF. It might be an image-only PDF."}
        
        llm = get_llm_engine()
        
        # Generator function for StreamingResponse
        async def generate():
            # Acquire lock to ensure only one inference runs at a time
            async with llm_lock:
                try:
                    from anyio import to_thread
                    
                    # Group pages into chunks that fit within context limit
                    # Each chunk should be under ~14000 chars to be safe
                    MAX_CHUNK_SIZE = 14000
                    chunks = []
                    current_chunk = ""
                    
                    for i, page_text in enumerate(pages):
                        if len(current_chunk) + len(page_text) > MAX_CHUNK_SIZE:
                            if current_chunk:
                                chunks.append(current_chunk)
                            current_chunk = page_text
                        else:
                            current_chunk += f"\n\n--- Page {i+1} ---\n\n" + page_text
                    
                    if current_chunk:
                        chunks.append(current_chunk)
                    
                    print(f"Processing {len(pages)} pages in {len(chunks)} chunk(s)")
                    
                    # Process each chunk
                    for chunk_idx, chunk_text in enumerate(chunks):
                        if len(chunks) > 1:
                            # Use # prefix so frontend treats this as a comment, not JSON
                            yield f"# Processing chunk {chunk_idx + 1}/{len(chunks)}\n"
                        
                        iterator = llm.extract_health_parameters(chunk_text)
                        
                        # Buffer for accumulating partial lines
                        buffer = ""
                        
                        # Use sentinel pattern to avoid StopIteration in async generator
                        _sentinel = object()
                        
                        while True:
                            try:
                                output_chunk = await to_thread.run_sync(
                                    lambda it=iterator: next(it, _sentinel)
                                )
                                if output_chunk is _sentinel:
                                    break
                                
                                buffer += output_chunk
                                
                                # Process complete lines
                                while '\n' in buffer:
                                    line, buffer = buffer.split('\n', 1)
                                    line = line.strip()
                                    
                                    if not line:
                                        continue
                                        
                                    # Try to process as JSON
                                    try:
                                        import json
                                        from services.reference_service import reference_service
                                        
                                        data = json.loads(line)
                                        
                                        # Inject reference range if missing
                                        if "test_name" in data and ("reference_range" not in data or not data["reference_range"]):
                                            ref_range = reference_service.get_reference_range(data["test_name"])
                                            if ref_range:
                                                data["reference_range"] = ref_range
                                                # Mark as estimated/standard if needed? 
                                                # For now just fill it transparently
                                        
                                        # Yield the potentially modified line
                                        yield json.dumps(data) + "\n"
                                        
                                    except json.JSONDecodeError:
                                        # If not JSON (e.g. comments/headers), yield as is if it looks useful
                                        # or ignore if it's junk. The prompt says "No explanation", but safe to yield
                                        yield line + "\n"
                                        
                            except Exception as e:
                                print(f"ERROR during generation: {e}")
                                yield f"\n\n[ERROR] Generation failed: {str(e)}"
                                break
                        
                        # Process any remaining buffer
                        if buffer.strip():
                            try:
                                import json
                                from services.reference_service import reference_service
                                data = json.loads(buffer.strip())
                                if "test_name" in data and ("reference_range" not in data or not data["reference_range"]):
                                    ref_range = reference_service.get_reference_range(data["test_name"])
                                    if ref_range:
                                        data["reference_range"] = ref_range
                                yield json.dumps(data) + "\n"
                            except:
                                yield buffer + "\n"
                        
                        # Add newline between chunks
                        if chunk_idx < len(chunks) - 1:
                            yield "\n"
                            
                except Exception as e:
                    print(f"ERROR during streaming: {e}")
                    yield f"\n\n[ERROR] Stream interrupted: {str(e)}"

        return StreamingResponse(generate(), media_type="text/plain")
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
