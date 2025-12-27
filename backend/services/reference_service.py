import json
import os
import sqlite3
from pathlib import Path

# Fix import path since this is inside services/
import sys
sys.path.append(str(Path(__file__).parent.parent))
from database import DB_NAME

STANDARD_RANGES_PATH = Path(__file__).parent.parent / "data" / "standard_ranges.json"

class ReferenceRangeService:
    def __init__(self):
        self._standard_ranges = self._load_standard_ranges()

    def _load_standard_ranges(self):
        if not STANDARD_RANGES_PATH.exists():
            return {}
        try:
            with open(STANDARD_RANGES_PATH, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading standard ranges: {e}")
            return {}

    def get_reference_range(self, test_name: str, extracted_range: str = None) -> str:
        """
        Determines the best reference range properly.
        Priority (Standard First Strategy):
        1. Standard Database (Highest Priority - enforces consistency)
        2. Extracted Range (Report) - used if test not in Standard DB
        3. History (Consensus) - fallback
        """
        # Normalize test name for lookup
        normalized_name = self._normalize_name(test_name)

        # 1. Check Standard DB (First Priority)
        standard_val = self._get_from_standard_db(normalized_name)
        if standard_val:
            return standard_val

        # 2. Extracted Range (Report)
        if extracted_range and extracted_range.strip():
            return extracted_range

        # 3. Check History (Consensus)
        history_range = self._get_from_history(normalized_name)
        if history_range:
            return history_range
            
        return None

    def _normalize_name(self, name: str) -> str:
        # Simple normalization: trim and lower case for partial matching logic if needed
        # But for DB lookups, we usually rely on exact match or we might need a better mapping.
        # For now, let's just return the name as-is or title case to match our dict keys.
        return name.strip()

    def _get_from_history(self, test_name: str):
        try:
            conn = sqlite3.connect(DB_NAME)
            cursor = conn.cursor()
            
            # CONSENSUS STRATEGY (Majority Vote)
            # 1. Get all reference ranges for this test
            # 2. Group by range and count frequency
            # 3. Order by Count DESC, then Report Date DESC (to break ties with recency)
            cursor.execute("""
                SELECT reference_range, COUNT(*) as freq, MAX(report_date) as last_seen
                FROM metrics 
                WHERE test_name = ? AND reference_range IS NOT NULL AND reference_range != ''
                GROUP BY reference_range
                ORDER BY freq DESC, last_seen DESC
                LIMIT 1
            """, (test_name,))
            
            row = cursor.fetchone()
            conn.close()
            
            if row:
                # row[0] is the reference_range
                return row[0]
                
        except Exception as e:
            print(f"Error checking history for {test_name}: {e}")
        return None

    def _get_from_standard_db(self, test_name: str):
        # fuzzy match or direct match?
        # Let's try direct match first, then case-insensitive
        
        # Direct match
        if test_name in self._standard_ranges:
            return self._standard_ranges[test_name]['range']
        
        # Case insensitive match
        lower_test_name = test_name.lower()
        for key, data in self._standard_ranges.items():
            if key.lower() == lower_test_name:
                return data['range']
            
            # Simple alias/substring match?
            # e.g. "Vitamin B12" vs "Vit B12" -> maybe too risky without explicit aliases
        
        return None

# Singleton instance
reference_service = ReferenceRangeService()
