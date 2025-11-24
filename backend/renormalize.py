import sqlite3
from database import normalize_test_name, DB_NAME

def apply_normalization():
    conn = sqlite3.connect(DB_NAME)
    # Use row_factory to access columns by name if needed, but tuple is fine here
    cursor = conn.cursor()
    
    print("Fetching all metrics...")
    cursor.execute("SELECT id, test_name FROM metrics")
    rows = cursor.fetchall()
    
    updates = 0
    for row_id, current_name in rows:
        new_name = normalize_test_name(current_name)
        
        if new_name != current_name:
            print(f"Normalizing ID {row_id}: '{current_name}' -> '{new_name}'")
            try:
                cursor.execute("UPDATE metrics SET test_name = ? WHERE id = ?", (new_name, row_id))
                updates += 1
            except sqlite3.IntegrityError:
                print(f"  Skipping ID {row_id} due to uniqueness constraint (target already exists).")
    
    conn.commit()
    conn.close()
    print(f"Normalization complete. Updated {updates} records.")

if __name__ == "__main__":
    apply_normalization()
