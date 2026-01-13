#!/usr/bin/env python3
"""
Migration script to fix and normalize existing metrics in the database.
This will:
1. Merge duplicate test names (LDL Cholesterol,Direct → LDL Cholesterol, etc.)
2. Convert WBC/RBC values from cells/cumm to 10^3/uL
3. Update reference ranges where needed
"""

import sqlite3
import re
from database import (
    TEST_NAME_MAPPINGS, 
    UNIT_MAPPINGS, 
    CELL_COUNT_CONVERSIONS,
    normalize_test_name,
    normalize_unit,
    normalize_reference_range
)

DB_NAME = "health_metrics.db"

def migrate_database():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Fetch all metrics
    cursor.execute("SELECT * FROM metrics")
    rows = cursor.fetchall()
    
    updated = 0
    deleted = 0
    
    for row in rows:
        row_id = row["id"]
        original_test_name = row["test_name"]
        original_unit = row["unit"]
        original_value = row["value"]
        original_ref_range = row["reference_range"]
        
        # Normalize test name
        new_test_name = normalize_test_name(original_test_name)
        
        # Normalize unit and get conversion factor
        new_unit, conversion_factor = normalize_unit(original_unit, new_test_name)
        
        # Convert value if needed
        new_value = original_value
        if conversion_factor != 1.0 and original_value:
            try:
                numeric_value = float(original_value)
                converted_value = numeric_value * conversion_factor
                new_value = str(round(converted_value, 2))
                print(f"  Converting {original_test_name}: {original_value} {original_unit} → {new_value} {new_unit}")
            except (ValueError, TypeError):
                pass
        
        # Normalize reference range
        new_ref_range = normalize_reference_range(original_ref_range) if original_ref_range else original_ref_range
        
        # Check if anything changed
        if (new_test_name != original_test_name or 
            new_unit != original_unit or 
            new_value != original_value or
            new_ref_range != original_ref_range):
            
            # Check if a record with this normalized name+value+date already exists
            cursor.execute("""
                SELECT id FROM metrics 
                WHERE test_name = ? AND value = ? AND report_date = ? AND id != ?
            """, (new_test_name, new_value, row["report_date"], row_id))
            
            existing = cursor.fetchone()
            if existing:
                # Delete this duplicate
                cursor.execute("DELETE FROM metrics WHERE id = ?", (row_id,))
                print(f"  Deleted duplicate: {original_test_name} (id={row_id})")
                deleted += 1
            else:
                # Update the record
                cursor.execute("""
                    UPDATE metrics 
                    SET test_name = ?, unit = ?, value = ?, reference_range = ?
                    WHERE id = ?
                """, (new_test_name, new_unit, new_value, new_ref_range, row_id))
                
                if new_test_name != original_test_name:
                    print(f"  Renamed: {original_test_name} → {new_test_name}")
                if new_value != original_value:
                    print(f"  Value: {original_value} → {new_value}")
                updated += 1
    
    conn.commit()
    conn.close()
    
    print(f"\n✅ Migration complete: {updated} records updated, {deleted} duplicates removed")

if __name__ == "__main__":
    print("🔄 Starting database migration...")
    migrate_database()
