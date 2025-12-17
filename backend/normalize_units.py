#!/usr/bin/env python3
"""
Normalize units in existing database entries.
Run this script to standardize units for all existing metrics.
"""

import sqlite3

DB_NAME = "health_metrics.db"

# Unit spelling standardization
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
}

# Unit conversions for specific tests
UNIT_CONVERSIONS = {
    "Total Cholesterol": ("mmol/L", "mg/dL", 38.67),
    "LDL Cholesterol": ("mmol/L", "mg/dL", 38.67),
    "HDL Cholesterol": ("mmol/L", "mg/dL", 38.67),
    "VLDL Cholesterol": ("mmol/L", "mg/dL", 38.67),
    "Non-HDL Cholesterol": ("mmol/L", "mg/dL", 38.67),
    "Cholesterol": ("mmol/L", "mg/dL", 38.67),
    "Triglycerides": ("mmol/L", "mg/dL", 88.57),
    "Fasting Glucose": ("mmol/L", "mg/dL", 18.02),
    "Glucose": ("mmol/L", "mg/dL", 18.02),
}


def normalize_existing_units():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # Get all metrics
    cursor.execute("SELECT id, test_name, value, unit FROM metrics")
    rows = cursor.fetchall()
    
    updates = 0
    
    for row in rows:
        metric_id, test_name, value, unit = row
        
        if not unit:
            continue
            
        new_unit = unit
        new_value = value
        
        # 1. Check for spelling standardization
        if unit in UNIT_MAPPINGS:
            new_unit = UNIT_MAPPINGS[unit]
        
        # 2. Check for unit conversion (mmol/L to mg/dL)
        if test_name in UNIT_CONVERSIONS:
            from_unit, to_unit, factor = UNIT_CONVERSIONS[test_name]
            if unit.lower() == from_unit.lower():
                new_unit = to_unit
                try:
                    numeric_value = float(value)
                    new_value = str(round(numeric_value * factor, 1))
                    print(f"Converting {test_name}: {value} {unit} -> {new_value} {new_unit}")
                except (ValueError, TypeError):
                    pass
        
        # Update if changed
        if new_unit != unit or new_value != value:
            cursor.execute(
                "UPDATE metrics SET unit = ?, value = ? WHERE id = ?",
                (new_unit, new_value, metric_id)
            )
            updates += 1
    
    conn.commit()
    conn.close()
    
    print(f"\nDone! Updated {updates} records.")


if __name__ == "__main__":
    normalize_existing_units()
