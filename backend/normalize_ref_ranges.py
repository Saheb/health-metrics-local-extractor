#!/usr/bin/env python3
"""
Script to normalize reference ranges in existing data.
Run this once to fix all existing reference_range values.
"""

import sqlite3
from database import normalize_reference_range, DB_NAME

def migrate_reference_ranges():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # Get all unique reference ranges
    cursor.execute("SELECT DISTINCT id, reference_range FROM metrics WHERE reference_range IS NOT NULL")
    rows = cursor.fetchall()
    
    updated_count = 0
    for row_id, ref_range in rows:
        normalized = normalize_reference_range(ref_range)
        if normalized != ref_range:
            cursor.execute(
                "UPDATE metrics SET reference_range = ? WHERE id = ?",
                (normalized, row_id)
            )
            updated_count += 1
            if updated_count <= 20:  # Show first 20 examples
                print(f"  '{ref_range}' -> '{normalized}'")
    
    conn.commit()
    print(f"\nUpdated {updated_count} reference range(s)")
    conn.close()

if __name__ == "__main__":
    print("Normalizing reference ranges in database...")
    migrate_reference_ranges()
    print("Done!")
