import sqlite3

DB_NAME = "health_metrics.db"

# Mappings: { "Bad Name": "Standard Name" }
MAPPINGS = {
    "Cholesterol, Total": "Total Cholesterol",
    "ERYTHROCYTE SEDIMENTATION RATE (ESR)": "ESR",
    "Erythrocyte Sedimentation Rate (Modified Westergren)": "ESR",
    "LDL Cholesterol,Direct": "LDL Cholesterol",
    "GLUCOSE, FASTING (F), PLASMA": "Fasting Glucose",
    "Glucose-Fasting": "Fasting Glucose",
    "Bilirubin - Direct": "Direct Bilirubin",
    "Bilirubin-Total": "Total Bilirubin",
    "Serum SGPT/ALT": "SGPT/ALT",
    "SGOT/AST": "SGOT/AST", # Keep or standardize? Let's keep simple.
    "Serum Uric Acid": "Uric Acid",
    "Serium URIC ACID": "Uric Acid",
    "Serum Albumin": "Albumin",
    "Serum Globulin": "Globulin",
    "VITAMIN B-12": "Vitamin B12",
    "VITAMIN D": "Vitamin D",
}

def normalize_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    print("Starting normalization...")
    
    for bad_name, good_name in MAPPINGS.items():
        # Check if bad_name exists
        cursor.execute("SELECT COUNT(*) FROM metrics WHERE test_name = ?", (bad_name,))
        count = cursor.fetchone()[0]
        
        if count > 0:
            print(f"Found {count} entries for '{bad_name}'. Updating to '{good_name}'...")
            try:
                cursor.execute("UPDATE metrics SET test_name = ? WHERE test_name = ?", (good_name, bad_name))
            except sqlite3.IntegrityError:
                # This happens if updating causes a duplicate (test_name + date + value unique constraint)
                # In this case, we might want to delete the duplicate 'bad' one if it's truly identical, 
                # or just skip. For now, let's skip to be safe, or handle carefully.
                print(f"  Skipping update for some '{bad_name}' entries due to uniqueness constraint (target already exists).")
                
    conn.commit()
    conn.close()
    print("Normalization complete.")

if __name__ == "__main__":
    normalize_db()
