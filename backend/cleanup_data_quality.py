#!/usr/bin/env python3
"""
Data quality cleanup script.
Fixes incorrect reference ranges and consolidates variations.
"""

import sqlite3

DB_NAME = "health_metrics.db"

# Define correct reference ranges for common tests
# These will be used to fix obviously wrong ranges
CORRECT_REF_RANGES = {
    "Total Cholesterol": "<200",
    "LDL Cholesterol": "<100",
    "HDL Cholesterol": ">40",
    "Triglycerides": "<150",
    "VLDL Cholesterol": "<30",
    "Fasting Glucose": "70-100",
    "HbA1c": "<5.7",
    "ESR": "0-20",  # General range, may vary
}

# Reference ranges that are obviously wrong for certain tests
INCORRECT_REF_RANGES = {
    "Total Cholesterol": ["2.3-4.9", "4-5.6"],  # These are HbA1c ranges
    "Fasting Glucose": ["3.5-5.6"],  # This is HbA1c range  
}

# Reference ranges to normalize (consolidate variations)
REF_RANGE_CONSOLIDATIONS = {
    "Optimal : <100": "<100",
    "Optimal: <100": "<100",
    "Desirable : <150": "<150",
    "Desirable: <150": "<150",
    "40-59": ">40",  # HDL - simplify to just the minimum
    "30-60": ">40",  # HDL variant
    "Everything looks good": "",  # Not a valid ref range
    "0-153": "0-20",  # ESR - 153 seems wrong
}

def cleanup_data_quality():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    total_updates = 0
    
    # 1. Fix incorrect reference ranges for specific tests
    print("=== Fixing incorrect reference ranges ===")
    for test_name, wrong_ranges in INCORRECT_REF_RANGES.items():
        correct_range = CORRECT_REF_RANGES.get(test_name, "")
        for wrong_range in wrong_ranges:
            cursor.execute(
                "UPDATE metrics SET reference_range = ? WHERE test_name = ? AND reference_range = ?",
                (correct_range, test_name, wrong_range)
            )
            if cursor.rowcount > 0:
                print(f"  Fixed {cursor.rowcount} rows: {test_name} '{wrong_range}' -> '{correct_range}'")
                total_updates += cursor.rowcount
    
    # 2. Consolidate reference range variations
    print("\n=== Consolidating reference range variations ===")
    for old_range, new_range in REF_RANGE_CONSOLIDATIONS.items():
        cursor.execute(
            "UPDATE metrics SET reference_range = ? WHERE reference_range = ?",
            (new_range, old_range)
        )
        if cursor.rowcount > 0:
            print(f"  Consolidated {cursor.rowcount} rows: '{old_range}' -> '{new_range}'")
            total_updates += cursor.rowcount
    
    # 3. Clean up empty or invalid reference ranges
    print("\n=== Cleaning up invalid values ===")
    cursor.execute("UPDATE metrics SET reference_range = '' WHERE reference_range = 'None'")
    if cursor.rowcount > 0:
        print(f"  Cleaned {cursor.rowcount} 'None' values")
        total_updates += cursor.rowcount
    
    # 4. Delete entries that don't make sense
    print("\n=== Removing invalid entries ===")
    # Remove X-Ray entries (not a metric with values)
    cursor.execute("DELETE FROM metrics WHERE test_name LIKE 'X-Ray%'")
    if cursor.rowcount > 0:
        print(f"  Removed {cursor.rowcount} X-Ray entries")
    
    # Remove entries with 'Age' and 'Sex' (patient metadata, not test results)
    cursor.execute("DELETE FROM metrics WHERE test_name IN ('Age', 'Sex')")
    if cursor.rowcount > 0:
        print(f"  Removed {cursor.rowcount} Age/Sex entries")
    
    conn.commit()
    
    # 5. Show summary of what's left
    print("\n=== Reference Range Summary (after cleanup) ===")
    cursor.execute("""
        SELECT test_name, COUNT(*) as cnt, GROUP_CONCAT(DISTINCT reference_range) as ref_ranges 
        FROM metrics 
        WHERE test_name IN ('Total Cholesterol', 'LDL Cholesterol', 'HDL Cholesterol', 'Triglycerides', 'Fasting Glucose', 'HbA1c', 'ESR')
        GROUP BY test_name 
        ORDER BY test_name
    """)
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[2]}")
    
    conn.close()
    print(f"\n=== Total updates: {total_updates} ===")

if __name__ == "__main__":
    cleanup_data_quality()
    print("Done!")
