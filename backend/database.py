
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
    "LDL Cholesterol, Direct": "LDL Cholesterol",
    "LDL-Cholesterol": "LDL Cholesterol",
    "LDL.CHOL/HDL.CHOL Ratio": "LDL/HDL Ratio",
    "LDL.CHOL/HDL.CHOL ratio": "LDL/HDL Ratio",
    "GLUCOSE, FASTING (F), PLASMA": "Fasting Glucose",
    "Glucose-Fasting": "Fasting Glucose",
    "Plasma GLUCOSE - PP": "Post-Prandial Glucose",
    "Bilirubin - Direct": "Direct Bilirubin",
    "Bilirubin-Total": "Total Bilirubin",
    "Serum SGPT/ALT": "SGPT/ALT",
    "ALT (SGPT)": "SGPT/ALT",
    "SGOT/AST": "SGOT/AST",
    "AST (SGOT)": "SGOT/AST",
    "Serum Uric Acid": "Uric Acid",
    "Serium URIC ACID": "Uric Acid",
    "Serum Albumin": "Albumin",
    "Serum Globulin": "Globulin",
    "VITAMIN B-12": "Vitamin B12",
    "VITAMIN D": "Vitamin D",
    "Vitamin D Total-25 Hydroxy": "Vitamin D",
    "25-OH Vitamin D (Total)": "Vitamin D",
    "Creatinine, Serum": "Creatinine",
    "Serum Creatinine": "Creatinine",
    # WBC variations
    "WBC Count (Coulter Principle)": "WBC Count",
    "Total white cell count": "WBC Count",
    "White Blood Cell Count": "WBC Count",
    # Prothrombin Time variations
    "Prothrombin Time (PT)": "Prothrombin Time",
    "PT (Prothrombin Time)": "Prothrombin Time",
    # RBC variations  
    "RBC Count (Coulter Principle)": "RBC Count",
    "Red Blood Cell Count": "RBC Count",
    # Other common variations
    "Red Cell Distribution Width - CV": "RDW-CV",
    "Red Cell Distribution Width - SD": "RDW-SD",
    "Albumin/Globulin Ratio": "A/G Ratio",
    "A/G ratio": "A/G Ratio",
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
    "Post-Prandial Glucose": ("mmol/L", "mg/dL", 18.02),
}

# WBC/RBC unit conversions: cells/cumm, /cu.mm → 10^3/uL (divide by 1000)
CELL_COUNT_CONVERSIONS = {
    "WBC Count": {"from_units": ["cells/cumm", "/cu.mm", "cells/ul", "/uL"], "to_unit": "10^3/uL", "divisor": 1000},
    "RBC Count": {"from_units": ["million/cumm", "10^6/cumm", "million/uL"], "to_unit": "10^6/uL", "divisor": 1},
    "Platelet Count": {"from_units": ["cells/cumm", "/cu.mm", "lakh/cumm"], "to_unit": "10^3/uL", "divisor": 1000},
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
    
    # 3. Check cell count conversions (cells/cumm → 10^3/uL, etc.)
    if test_name and test_name in CELL_COUNT_CONVERSIONS:
        conversion = CELL_COUNT_CONVERSIONS[test_name]
        unit_lower = unit.lower()
        for from_unit in conversion["from_units"]:
            if from_unit.lower() in unit_lower:
                # Return to_unit and a divisor (as 1/divisor multiplier)
                return conversion["to_unit"], 1.0 / conversion["divisor"]
    
    return normalized, 1.0


def normalize_reference_range(ref_range: str) -> str:
    """
    Normalizes a reference range string to a consistent format.
    - Removes units (they belong in the unit column)
    - Removes unnecessary decimal places (.00)
    - Removes brackets []
    - Standardizes spacing
    """
    import re
    
    if not ref_range:
        return ref_range
    
    ref = ref_range.strip()
    
    # Return empty string for dashes or "None"
    if ref in ['-', '--', 'None', 'null', '']:
        return ''
    
    # Remove square brackets
    ref = ref.replace('[', '').replace(']', '')
    
    # Remove common unit suffixes (case-insensitive)
    unit_patterns = [
        r'\s*mg/dl\s*', r'\s*mg/dL\s*', r'\s*g/dl\s*', r'\s*g/dL\s*',
        r'\s*ng/ml\s*', r'\s*ng/mL\s*', r'\s*pg/ml\s*', r'\s*pg/mL\s*',
        r'\s*µg/dl\s*', r'\s*µg/dL\s*', r'\s*ug/dl\s*', r'\s*ug/dL\s*',
        r'\s*µIU/ml\s*', r'\s*µIU/mL\s*', r'\s*uIU/ml\s*',
        r'\s*IU/L\s*', r'\s*U/l\s*', r'\s*U/L\s*',
        r'\s*mm/hr\s*', r'\s*mm/h\s*',
        r'\s*seconds\s*', r'\s*sec\s*',
        r'\s*%\s*$',  # Only remove % at the end
    ]
    for pattern in unit_patterns:
        ref = re.sub(pattern, '', ref, flags=re.IGNORECASE)
    
    # Remove trailing .00 or .0 from numbers (keep meaningful decimals)
    # e.g., "<200.00" -> "<200", "4.00-5.60" -> "4-5.6"
    ref = re.sub(r'(\d+)\.00\b', r'\1', ref)
    ref = re.sub(r'(\d+\.\d*[1-9])0+\b', r'\1', ref)  # "5.60" -> "5.6"
    
    # Standardize spacing around hyphens (ranges)
    # "0 - 15" -> "0-15", "0.0 - 1.0" -> "0-1"
    ref = re.sub(r'\s*-\s*', '-', ref)
    
    # Standardize comparison operators (no space after <, >)
    ref = re.sub(r'<\s+', '<', ref)
    ref = re.sub(r'>\s+', '>', ref)
    
    # Clean up any double spaces
    ref = re.sub(r'\s+', ' ', ref).strip()
    
    return ref

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

    # Ensure value and reference_range are strings, and normalize reference_range
    value_str = str(value) if value is not None else None
    ref_range_str = normalize_reference_range(str(metric.reference_range)) if metric.reference_range is not None else None

    # Auto-fill missing reference ranges from existing data
    if not ref_range_str or ref_range_str == '':
        cursor.execute('''
            SELECT reference_range FROM metrics 
            WHERE test_name = ? AND reference_range IS NOT NULL AND reference_range != ''
            ORDER BY report_date DESC LIMIT 1
        ''', (test_name,))
        row = cursor.fetchone()
        if row:
            ref_range_str = row[0]
            print(f"Auto-filled reference range for {test_name}: {ref_range_str}")

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
