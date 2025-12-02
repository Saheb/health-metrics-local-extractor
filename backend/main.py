from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from extractor import extract_text_from_pdf
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
        text = extract_text_from_pdf(contents)
        
        if not text:
            return {"error": "Could not extract text from PDF. It might be an image-only PDF."}
        
        llm = get_llm_engine()
        
        # Generator function for StreamingResponse
        # Generator function for StreamingResponse
        async def generate():
            # Acquire lock to ensure only one inference runs at a time
            async with llm_lock:
                try:
                    # Run the blocking generator in a thread pool to not block the event loop
                    # We use anyio.to_thread.run_sync to run the next() call in a separate thread
                    from anyio import to_thread
                    
                    iterator = llm.extract_health_parameters(text)
                    
                    while True:
                        try:
                            # This runs the blocking next(iterator) in a thread
                            chunk = await to_thread.run_sync(next, iterator)
                            yield chunk
                        except StopIteration:
                            break
                        except Exception as e:
                            print(f"ERROR during generation: {e}")
                            yield f"\n\n[ERROR] Generation failed: {str(e)}"
                            break
                            
                except Exception as e:
                    print(f"ERROR during streaming: {e}")
                    yield f"\n\n[ERROR] Stream interrupted: {str(e)}"

        return StreamingResponse(generate(), media_type="text/plain")
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
