
import sqlite3
import json
from pydantic import BaseModel
from typing import List, Optional, Any
from dateutil import parser

DB_NAME = "health_metrics.db"

# Standardize test names
TEST_NAME_MAPPINGS = {
    "Cholesterol": "Total Cholesterol",
    "Cholesterol, Total": "Total Cholesterol",
    "Cholesterol Total": "Total Cholesterol",
    "ERYTHROCYTE SEDIMENTATION RATE (ESR)": "ESR",
    "Erythrocyte Sedimentation Rate (Modified Westergren)": "ESR",
    "LDL Cholesterol,Direct": "LDL Cholesterol",
    "GLUCOSE, FASTING (F), PLASMA": "Fasting Glucose",
    "Glucose-Fasting": "Fasting Glucose",
    "Bilirubin - Direct": "Direct Bilirubin",
    "Bilirubin-Total": "Total Bilirubin",
    "Serum SGPT/ALT": "SGPT/ALT",
    "SGOT/AST": "SGOT/AST",
    "Serum Uric Acid": "Uric Acid",
    "Serium URIC ACID": "Uric Acid",
    "Serum Albumin": "Albumin",
    "Serum Globulin": "Globulin",
    "VITAMIN B-12": "Vitamin B12",
    "VITAMIN D": "Vitamin D",
    "Vitamin D Total-25 Hydroxy": "Vitamin D",
    "25-OH Vitamin D (Total)": "Vitamin D",
}

# Standardize unit spelling (case-insensitive lookup)
UNIT_MAPPINGS = {
    "mg/dl": "mg/dL",
    "u/l": "U/L",
    "u/L": "U/L",
    "iu/l": "IU/L",
    "iu/L": "IU/L",
    "gm/dl": "g/dL",
    "gm/dL": "g/dL",
    "g/dl": "g/dL",
    "mm/hr": "mm/h",
    "mm/1sthour": "mm/h",
    "ng/ml": "ng/mL",
    "pg/ml": "pg/mL",
    "ug/dl": "µg/dL",
    "µiu/ml": "µIU/mL",
    "µiu/mL": "µIU/mL",
    "kg/m^2": "kg/m²",
    "kg/m2": "kg/m²",
}

# Unit conversions: (from_unit, to_unit, multiplier)
# These tests need value conversion when unit is mmol/L
UNIT_CONVERSIONS = {
    # Cholesterol: mmol/L × 38.67 = mg/dL
    "Total Cholesterol": ("mmol/L", "mg/dL", 38.67),
    "LDL Cholesterol": ("mmol/L", "mg/dL", 38.67),
    "HDL Cholesterol": ("mmol/L", "mg/dL", 38.67),
    "VLDL Cholesterol": ("mmol/L", "mg/dL", 38.67),
    "Non-HDL Cholesterol": ("mmol/L", "mg/dL", 38.67),
    "Cholesterol": ("mmol/L", "mg/dL", 38.67),
    # Triglycerides: mmol/L × 88.57 = mg/dL
    "Triglycerides": ("mmol/L", "mg/dL", 88.57),
    # Glucose: mmol/L × 18.02 = mg/dL
    "Fasting Glucose": ("mmol/L", "mg/dL", 18.02),
    "Glucose": ("mmol/L", "mg/dL", 18.02),
}

def normalize_date(date_str: Optional[str]) -> Optional[str]:
    """
    Normalizes a date string to YYYY-MM-DD format.
    Returns None if parsing fails or input is None.
    """
    if not date_str:
        return None
    
    try:
        # Parse the date string
        dt = parser.parse(date_str, dayfirst=True) # Assume day comes first for ambiguous dates like 01/02/2023 (common in medical reports)
        return dt.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        # If parsing fails, return the original string or None?
        # Returning original string might preserve bad data but avoids data loss.
        # Returning None cleans it but loses info.
        # Let's return original string if it looks somewhat like a date, or just return it as is.
        # Actually, if we want to deduplicate, we need consistent format.
        # If we can't parse it, we can't normalize it.
        return date_str

def normalize_test_name(name: str) -> str:
    if not name:
        return name
        
    name = name.strip()
    
    # 1. Exact/Explicit Mapping
    if name in TEST_NAME_MAPPINGS:
        return TEST_NAME_MAPPINGS[name]
    
    # 2. Generic Keyword-based Rules (Case-insensitive)
    name_lower = name.lower()
    
    # Vitamin D variations
    if "vitamin d" in name_lower and ("total" in name_lower or "25" in name_lower or "hydroxy" in name_lower):
        return "Vitamin D"
        
    # HbA1c variations
    if "hba1c" in name_lower:
        return "HbA1c"
        
    # Calcium variations
    if "calcium" in name_lower and "total" in name_lower:
        return "Calcium Total"
        
    return name

def normalize_unit(unit: str, test_name: str = None) -> tuple[str, float]:
    """
    Normalizes a unit string and returns conversion factor if needed.
    Returns (normalized_unit, conversion_factor).
    If conversion_factor != 1.0, the value should be multiplied by it.
    """
    if not unit:
        return unit, 1.0
    
    unit = unit.strip()
    
    # 1. Standardize spelling first
    normalized = UNIT_MAPPINGS.get(unit, unit)
    
    # 2. Check if we need to convert units (e.g., mmol/L to mg/dL)
    if test_name and test_name in UNIT_CONVERSIONS:
        from_unit, to_unit, factor = UNIT_CONVERSIONS[test_name]
        if unit.lower() == from_unit.lower():
            return to_unit, factor
    
    return normalized, 1.0

def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # Metrics table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_name TEXT NOT NULL,
            value TEXT,
            unit TEXT,
            reference_range TEXT,
            report_date TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create unique index to prevent duplicates
    # We consider a record duplicate if test_name, value, unit, and report_date match
    cursor.execute('''
        CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_unique 
        ON metrics(test_name, value, unit, report_date)
    ''')

    # Processed files table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS processed_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT NOT NULL,
            data_points_extracted INTEGER DEFAULT 0,
            report_date TEXT
        )
    ''')
    
    # Migration: Add report_date column if it doesn't exist (for existing databases)
    try:
        cursor.execute('ALTER TABLE processed_files ADD COLUMN report_date TEXT')
    except sqlite3.OperationalError:
        # Column likely already exists
        pass

    conn.commit()
    conn.close()

class MetricData(BaseModel):
    test_name: Optional[str] = None
    value: Optional[Any] = None
    unit: Optional[str] = None
    reference_range: Optional[Any] = None
    report_date: Optional[str] = None

class ProcessedFileData(BaseModel):
    filename: str
    status: str
    data_points_extracted: int
    report_date: Optional[str] = None

def save_metric(metric: MetricData):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # VALIDATION: Reject entries without valid values (prevents hallucinated data)
    if metric.value is None or metric.value == '' or str(metric.value).lower() == 'null':
        print(f"Rejecting entry without value: {metric.test_name}")
        conn.close()
        return None
    
    # Try to validate the value is somewhat reasonable
    value_str = str(metric.value)
    try:
        float(value_str)
    except (ValueError, TypeError):
        # Allow some non-numeric values
        allowed_non_numeric = ['negative', 'positive', 'normal', 'nil', 'absent', 'present', 'trace', 'male', 'female']
        if value_str.lower() not in allowed_non_numeric:
            print(f"Rejecting entry with invalid value: {metric.test_name} = {metric.value}")
            conn.close()
            return None

    # Normalize test name
    test_name = normalize_test_name(metric.test_name)

    # Normalize report date
    report_date = normalize_date(metric.report_date)

    # Normalize unit and get conversion factor
    unit, conversion_factor = normalize_unit(metric.unit, test_name)
    
    # Convert value if needed (e.g., mmol/L to mg/dL)
    value = metric.value
    if conversion_factor != 1.0 and value is not None:
        try:
            numeric_value = float(value)
            converted_value = numeric_value * conversion_factor
            value = round(converted_value, 1)  # Round to 1 decimal place
            print(f"Converted {metric.value} {metric.unit} to {value} {unit} for {test_name}")
        except (ValueError, TypeError):
            pass  # Keep original value if not numeric

    # Ensure value and reference_range are strings
    value_str = str(value) if value is not None else None
    ref_range_str = str(metric.reference_range) if metric.reference_range is not None else None

    try:
        cursor.execute('''
            INSERT OR IGNORE INTO metrics (test_name, value, unit, reference_range, report_date)
            VALUES (?, ?, ?, ?, ?)
        ''', (test_name, value_str, unit, ref_range_str, report_date))
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()

def save_processed_file(data: ProcessedFileData):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO processed_files (filename, status, data_points_extracted)
            VALUES (?, ?, ?)
        ''', (data.filename, data.status, data.data_points_extracted))
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()

def get_all_metrics():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM metrics ORDER BY created_at DESC')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_processed_files():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM processed_files ORDER BY upload_date DESC')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]
