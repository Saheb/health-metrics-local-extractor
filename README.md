# Health Metrics Local Extractor

A private, offline-first web application that extracts health metrics from PDF medical reports using a local LLM (Mistral-7B). It parses, stores, and visualizes your health data trends without ever sending your sensitive documents to the cloud.

## Features

*   **Offline & Private**: All processing happens locally on your machine. No data leaves your computer.
*   **PDF Extraction**: Upload PDF medical reports to extract structured data (Test Name, Value, Unit, Reference Range, Date).
*   **Local LLM**: Powered by `Mistral-7B-Instruct` running via `llama-cpp-python`.
*   **Database Storage**: Automatically saves extracted metrics to a local SQLite database (`health_metrics.db`).
*   **Data Normalization**: Automatically standardizes test names (e.g., merges "Vitamin D Total" and "25-OH Vitamin D" into "Vitamin D").
*   **Trend Visualization**: View historical trends of your health metrics with interactive charts and normal range indicators.
*   **Health Definitions**: Provides simple explanations for common health parameters.

## Tech Stack

*   **Backend**: Python, FastAPI, Llama.cpp, SQLite
*   **Frontend**: React, Vite, Recharts
*   **AI Model**: Mistral-7B-Instruct-v0.2 (GGUF format)

## Setup

### Prerequisites

*   Python 3.10+
*   Node.js & npm
*   **Tesseract OCR** (for scanned PDF support):
    ```bash
    brew install tesseract  # macOS
    ```
*   RAM: At least 8GB (16GB recommended for the LLM)

### Quick Start

The easiest way to start the app is with the included script:

```bash
./start.sh
```

This will automatically:
- Create/activate the Python virtual environment
- Install backend dependencies if needed
- Install frontend dependencies if needed  
- Start both servers

Then open **http://localhost:5173** in your browser.

> Press `Ctrl+C` to stop both servers gracefully.

---

### Manual Setup

If you prefer to run the servers separately:

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Download the Model:**
1.  Create a `models` directory inside `backend/`.
2.  Download `mistral-7b-instruct-v0.2.Q4_K_M.gguf` (or similar) from HuggingFace.
3.  Place it in `backend/models/`.

**Run the Backend:**
```bash
python main.py
```
The API will start at `http://localhost:8000`.

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```
The UI will start at `http://localhost:5173`.

## Usage

1.  Open the frontend URL.
2.  Click "Upload PDF" and select a medical report.
3.  Watch as data is extracted in real-time.
4.  Navigate to "View Database" to see all saved records.
5.  Go to "View Trend" to visualize your health history.

## License

MIT
