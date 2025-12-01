import sqlite3
from database import normalize_date, DB_NAME

def cleanup_dates():
    print(f"Connecting to {DB_NAME}...")
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Fetch all records
    cursor.execute('SELECT * FROM metrics')
    rows = cursor.fetchall()
    print(f"Found {len(rows)} total records.")

    updated_count = 0
    removed_count = 0
    
    # Track unique records to identify duplicates
    # Key: (test_name, value, unit, normalized_date) -> id
    unique_records = {}
    
    # List of IDs to remove
    ids_to_remove = []

    for row in rows:
        record_id = row['id']
        original_date = row['report_date']
        normalized_date = normalize_date(original_date)
        
        # Update date if it changed
        if original_date != normalized_date and normalized_date is not None:
            try:
                cursor.execute('UPDATE metrics SET report_date = ? WHERE id = ?', (normalized_date, record_id))
                updated_count += 1
                # print(f"Updated ID {record_id}: {original_date} -> {normalized_date}")
            except sqlite3.IntegrityError:
                # If update fails due to unique constraint, it means the normalized record already exists.
                # So we can safely delete this one as a duplicate.
                # print(f"Duplicate found during update: ID {record_id} conflicts with existing record")
                ids_to_remove.append(record_id)
                removed_count += 1
                continue # Skip further processing for this record
        
        # Check for duplicates (if we didn't already mark it for removal)
        # We use the normalized date for this check
        key = (
            row['test_name'],
            row['value'],
            row['unit'],
            normalized_date
        )
        
        if key in unique_records:
            # Duplicate found!
            # print(f"Duplicate found: ID {record_id} is duplicate of ID {unique_records[key]}")
            ids_to_remove.append(record_id)
            removed_count += 1
        else:
            unique_records[key] = record_id

    # Remove duplicates
    if ids_to_remove:
        print(f"Removing {len(ids_to_remove)} duplicate records...")
        # Split into chunks to avoid "too many SQL variables" error if many duplicates
        chunk_size = 900
        for i in range(0, len(ids_to_remove), chunk_size):
            chunk = ids_to_remove[i:i + chunk_size]
            placeholders = ','.join(['?'] * len(chunk))
            cursor.execute(f'DELETE FROM metrics WHERE id IN ({placeholders})', chunk)
            
    conn.commit()
    conn.close()
    
    print("-" * 30)
    print(f"Cleanup Complete:")
    print(f"Updated dates: {updated_count}")
    print(f"Removed duplicates: {removed_count}")
    print(f"Remaining records: {len(rows) - removed_count}")

if __name__ == "__main__":
    cleanup_dates()
