from llama_cpp import Llama
import json
import os
import gc

MODELS_DIR = "models"
# Default to the known mistral name, or fallback dynamically later
DEFAULT_MODEL_NAME = "mistral-7b-instruct-v0.2.Q4_K_M.gguf"

def get_available_models():
    """Returns a list of all .gguf files in the models directory."""
    if not os.path.exists(MODELS_DIR):
        os.makedirs(MODELS_DIR, exist_ok=True)
        return []
        
    return [f for f in os.listdir(MODELS_DIR) if f.endswith('.gguf')]

class LLMEngine:
    def __init__(self, model_name=None):
        # Automatically select a model if none provided and mistral doesn't exist
        available = get_available_models()
        if model_name is None:
            if DEFAULT_MODEL_NAME in available:
                self.active_model_name = DEFAULT_MODEL_NAME
            elif available:
                self.active_model_name = available[0]
            else:
                self.active_model_name = DEFAULT_MODEL_NAME # Will fail on load, but keeps contract
        else:
            self.active_model_name = model_name
            
        self.model_path = os.path.join(MODELS_DIR, self.active_model_name)
        self.llm = None
        self._load_model()

    def _load_model(self):
        print(f"Loading model from {self.model_path}...")
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Model not found at {self.model_path}")
            
        self.llm = Llama(
            model_path=self.model_path,
            n_ctx=8192, 
            n_gpu_layers=-1, 
            verbose=False # Set to false to reduce console spam on reloads
        )

    def extract_health_parameters(self, text: str, filename: str = None):
        # Text should already be chunked by main.py to fit context
        if len(text) > 16000:
            print(f"Warning: Text length {len(text)} exceeds recommended limit.")
        
        system_prompt = f"""You are a medical data extraction assistant. 
Extract all health parameters, test results, and vital signs from the provided text.
Also extract the "Report Date" or "Collection Date" from the document.

CONTEXT:
- Original Filename: {filename if filename else "Unknown"}

CRITICAL INSTRUCTION ON FILENAME DATES:
1. If you cannot find a "Report Date" in the text, check the filename provided above.
2. If the filename contains a date pattern (e.g., YYYY-MM-DD or DD-MM-YYYY), use it as the `report_date`.

CRITICAL INSTRUCTION ON GRAPHICAL LAYOUTS (Body Composition Screens):
1. For graphical screens where labels and values are separated, look for values placed directly BELOW or to the RIGHT of a label.
2. Example: If "Fat" is above "18%", extract as test_name="Fat Percentage", value="18", unit="%".

CRITICAL INSTRUCTION ON TEST NAMES VS PANEL NAMES (e.g. Lipid Profile):
1. Sometimes texts list a broad panel name (e.g., "LIPID PROFILE, BASIC, SERUM"). Do NOT extract the panel name as the `test_name`.
2. The SPECIFIC test name (e.g., "Total Cholesterol", "Triglycerides", "HDL Cholesterol") might be embedded in the "Reference Range" column, or listed below the panel.
3. You MUST extract the SPECIFIC test name. If the specific test name is embedded in the Reference Range column (e.g., "Total Cholesterol <200"), separate them out: test_name = "Total Cholesterol", reference_range = "<200".

CRITICAL INSTRUCTIONS - FOLLOW EXACTLY:
1. ONLY extract data that EXPLICITLY appears in the text. NEVER invent, guess, or hallucinate values.
2. If a test name appears but has no value, DO NOT output it.
3. EXCLUDE all patient metadata (Name, Age, Sex, ID, Registration No, Patient Episode).
4. EXCLUDE all doctor/hospital metadata (Referred By, KMC No, Hospital Name).
5. EXCLUDE isolated dates that are not the Report Date.
6. ONLY extract actual medical test results WITH numeric values.
7. If you cannot find any test results with values, output nothing.

ANTI-HALLUCINATION CHECK:
- Every "value" you output MUST be a number that appears verbatim in the input text.
- Do NOT output placeholder values like 100, 150, 200 unless they appear in the text.
- If unsure, DO NOT include the result.

USE STANDARD NAMES where possible:
- "Weight" (unit usually kg or lbs)
- "BMI" (Body Mass Index)
- "Fat Percentage" (not "Fat")
- "Muscle Percentage" (not "Muscle")
- "Hydration Percentage" (not "Hydration")
- "BMR" (Basal Metabolic Rate, unit usually kcal)
- "Total Cholesterol" (not "Cholesterol, Total" or "LIPID PROFILE")
- "LDL Cholesterol" (not "LDL, Direct")
- "HDL Cholesterol"
- "Triglycerides"
- "HbA1c"
- "Hemoglobin"
- "ESR" (not "Erythrocyte Sedimentation Rate")
- "TSH", "Total T3", "Total T4", "Free T3", "Free T4"
- "Total Testosterone" (not "TESTOSTERONE, TOTAL, SERUM"), "Free Testosterone"
- "Vitamin D", "Vitamin B12"
- "SGPT/ALT", "SGOT/AST"

CRITICAL EXCEPTIONS - DO NOT MIX THESE UP:
- "Free T3", "Free T4", and "Free Testosterone" are SEPARATE tests. Do NOT map them to "Fasting Glucose" or "T3"/"T4".
- EXCLUDE all billing amounts, prices, or costs (e.g., values with INR, Rs, ₹, $). These are NOT test results.

Output each parameter as a separate valid JSON object on a new line (JSON Lines format).
IMPORTANT: Return MINIFIED JSON. Do NOT pretty-print. Do NOT use newlines inside the JSON objects.
Do NOT return a JSON array (no [ or ]).
Do NOT use trailing commas between objects.
Each object must have these keys: "test_name", "value", "unit", "reference_range", "report_date".
"report_date" MUST be in YYYY-MM-DD format (e.g., 2023-02-16).
If a value is missing, skip that test entirely - do NOT output null values.
Do not include any explanation, just the JSON objects.
"""

        stream = self.llm.create_chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Text:\n{text}"}
            ],
            max_tokens=2000, 
            temperature=0.1,
            stream=True 
        )
        
        for output in stream:
            delta = output['choices'][0].get('delta', {})
            if 'content' in delta:
                yield delta['content']

# Global instance
llm_engine = None

def get_llm_engine():
    global llm_engine
    if llm_engine is None:
        llm_engine = LLMEngine()
    return llm_engine

def switch_active_model(new_model_name: str):
    """
    Safely unloads the current model from memory (RAM/VRAM)
    and loads the new one.
    """
    global llm_engine
    
    available = get_available_models()
    if new_model_name not in available:
        raise ValueError(f"Model {new_model_name} not found in models directory.")
        
    if llm_engine is not None and llm_engine.active_model_name == new_model_name:
        return # Already active
        
    print(f"Unloading current model: {llm_engine.active_model_name if llm_engine else 'None'}")
    
    if llm_engine is not None:
        del llm_engine.llm
        del llm_engine
        llm_engine = None
        
    # Force garbage collection to free RAM/VRAM immediately
    gc.collect()
    
    print(f"Loading new model: {new_model_name}")
    llm_engine = LLMEngine(model_name=new_model_name)
    return llm_engine.active_model_name
