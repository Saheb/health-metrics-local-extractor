from llama_cpp import Llama
import json
import os

# Path to the downloaded model
MODEL_PATH = "models/mistral-7b-instruct-v0.2.Q4_K_M.gguf"

class LLMEngine:
    def __init__(self):
        print(f"Loading model from {MODEL_PATH}...")
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model not found at {MODEL_PATH}")
            
        # Initialize Llama model
        # n_ctx=2048 is standard, can increase if PDF text is long
        # n_gpu_layers=-1 tries to offload all to GPU (if available on Mac Metal)
        self.llm = Llama(
            model_path=MODEL_PATH,
            n_ctx=8192, # Increased context for larger PDFs
            n_gpu_layers=-1, 
            verbose=True
        )

    def extract_health_parameters(self, text: str):
        """
        Extracts health parameters from text using the LLM.
        Yields chunks of data.
        """
        
        # 8192 context - 2000 output - 500 prompt = ~5600 tokens for input
        # 5600 tokens * 3.5 chars/token = ~19600 chars. 
        # Let's be safe with 16000 chars to avoid context overflow.
        if len(text) > 16000:
            print(f"Warning: Text length {len(text)} exceeds safe limit. Truncating to 16000 chars.")
            text = text[:16000] + "... [TRUNCATED]"
        
        # Construct a prompt for Mistral Instruct
        # Asking for JSON Lines (NDJSON) is easier to stream
        prompt = f"""[INST] You are a medical data extraction assistant. 
Extract all health parameters, test results, and vital signs from the following text.
Also extract the "Report Date" or "Collection Date" from the document.

CRITICAL INSTRUCTIONS:
1. EXCLUDE all patient metadata (Name, Age, Sex, ID, Registration No, Patient Episode).
2. EXCLUDE all doctor/hospital metadata (Referred By, KMC No, Hospital Name).
3. EXCLUDE isolated dates that are not the Report Date.
4. ONLY extract actual medical test results.

USE STANDARD NAMES where possible:
- "Total Cholesterol" (not "Cholesterol, Total")
- "LDL Cholesterol" (not "LDL, Direct")
- "HDL Cholesterol"
- "Triglycerides"
- "Fasting Glucose"
- "HbA1c"
- "Hemoglobin"
- "ESR" (not "Erythrocyte Sedimentation Rate")
- "TSH", "T3", "T4"
- "Vitamin D", "Vitamin B12"
- "SGPT/ALT", "SGOT/AST"

Output each parameter as a separate valid JSON object on a new line (JSON Lines format).
IMPORTANT: Return MINIFIED JSON. Do NOT pretty-print. Do NOT use newlines inside the JSON objects.
Do NOT return a JSON array (no [ or ]).
Do NOT use trailing commas between objects.
Each object must have these keys: "test_name", "value", "unit", "reference_range", "report_date".
If a value is missing, use null.
Do not include any explanation, just the JSON objects.

Text:
{text} 
[/INST]"""

        stream = self.llm(
            prompt,
            max_tokens=2000, # Increased max tokens for output
            stop=["</s>"],
            echo=False,
            temperature=0.1,
            stream=True # Enable streaming
        )
        
        for output in stream:
            chunk = output['choices'][0]['text']
            print(f"DEBUG CHUNK: {repr(chunk)}") # Debug logging
            yield chunk

# Global instance
llm_engine = None

def get_llm_engine():
    global llm_engine
    if llm_engine is None:
        llm_engine = LLMEngine()
    return llm_engine
