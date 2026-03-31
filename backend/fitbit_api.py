import os
import json
import base64
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from database import DB_NAME, save_metric, MetricData
import sqlite3

load_dotenv()

FITBIT_CLIENT_ID = os.getenv("FITBIT_CLIENT_ID")
FITBIT_CLIENT_SECRET = os.getenv("FITBIT_CLIENT_SECRET")
# The redirect URI needs to match exactly what is registered in Fitbit app console
FITBIT_REDIRECT_URI = os.getenv("FITBIT_REDIRECT_URI", "http://localhost:5173/api/fitbit/callback") 

TOKEN_FILE = "fitbit_tokens.json"

def get_auth_url():
    """Generates the Fitbit OAuth 2.0 authorization URL."""
    if not FITBIT_CLIENT_ID:
        raise ValueError("FITBIT_CLIENT_ID is not configured. Please set it in .env file.")
        
    scopes = "settings sleep activity"
    url = (
        f"https://www.fitbit.com/oauth2/authorize"
        f"?response_type=code"
        f"&client_id={FITBIT_CLIENT_ID}"
        f"&redirect_uri={FITBIT_REDIRECT_URI}"
        f"&scope={scopes}"
        f"&expires_in=2592000"
    )
    return url

def save_tokens(token_data):
    with open(TOKEN_FILE, "w") as f:
        json.dump(token_data, f)

def load_tokens():
    if not os.path.exists(TOKEN_FILE):
        return None
    with open(TOKEN_FILE, "r") as f:
        return json.load(f)

def handle_callback(code):
    """Exchanges an authorization code for access and refresh tokens."""
    auth_header = base64.b64encode(f"{FITBIT_CLIENT_ID}:{FITBIT_CLIENT_SECRET}".encode()).decode()
    
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    data = {
        "client_id": FITBIT_CLIENT_ID,
        "grant_type": "authorization_code",
        "redirect_uri": FITBIT_REDIRECT_URI,
        "code": code
    }
    
    response = requests.post("https://api.fitbit.com/oauth2/token", headers=headers, data=data)
    if not response.ok:
        raise Exception(f"Failed to get tokens: {response.text}")
        
    token_data = response.json()
    save_tokens(token_data)
    return token_data

def refresh_tokens_if_needed():
    """Refreshes the access token using the refresh token."""
    tokens = load_tokens()
    if not tokens or "refresh_token" not in tokens:
        raise Exception("Not connected to Fitbit. Please authenticate first.")
        
    auth_header = base64.b64encode(f"{FITBIT_CLIENT_ID}:{FITBIT_CLIENT_SECRET}".encode()).decode()
    
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    data = {
        "grant_type": "refresh_token",
        "refresh_token": tokens["refresh_token"]
    }
    
    response = requests.post("https://api.fitbit.com/oauth2/token", headers=headers, data=data)
    if not response.ok:
        raise Exception("Failed to refresh tokens. You may need to re-authenticate.")
        
    new_tokens = response.json()
    save_tokens(new_tokens)
    return new_tokens

def get_db_last_date(test_name: str) -> str:
    """Gets the latest date we have for a given metric, or default start date."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        SELECT report_date FROM metrics 
        WHERE test_name = ? 
        ORDER BY report_date DESC LIMIT 1
    ''', (test_name,))
    row = cursor.fetchone()
    conn.close()
    
    if row and row[0]:
        return row[0]
    # If no data exists, we start collecting from an arbitrary sensible date like 2018-01-01
    return "2018-01-01"

def api_get(url: str):
    """Makes an authenticated GET request to Fitbit API, handling token refresh automatically."""
    tokens = load_tokens()
    if not tokens:
        raise Exception("Not authenticated")
        
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}"
    }
    
    response = requests.get(url, headers=headers)
    
    if response.status_code == 401:
        # Token expired, try refreshing once
        tokens = refresh_tokens_if_needed()
        headers["Authorization"] = f"Bearer {tokens['access_token']}"
        response = requests.get(url, headers=headers)
        
    if not response.ok:
        raise Exception(f"Fitbit API error [{response.status_code}]: {response.text}")
        
    return response.json()

def chunk_dates(start_date: str, end_date: str, chunk_days: int):
    """Yields (start, end) date strings representing chunks of maximum `chunk_days` length."""
    dt_start = datetime.strptime(start_date, "%Y-%m-%d")
    dt_end = datetime.strptime(end_date, "%Y-%m-%d")
    
    current = dt_start
    while current < dt_end:
        chunk_end = min(current + timedelta(days=chunk_days - 1), dt_end)
        yield current.strftime('%Y-%m-%d'), chunk_end.strftime('%Y-%m-%d')
        current = chunk_end + timedelta(days=1)

def sync_sleep():
    """Syncs Sleep data from the last saved date to today in 100-day chunks (Fitbit API limit)."""
    last_date = get_db_last_date("Sleep")
    today = datetime.now().strftime("%Y-%m-%d")
    
    if last_date >= today:
        print("Sleep data is already up to date.")
        return 0
        
    print(f"Syncing Sleep data from {last_date} to {today}")
    
    # Fitbit sleep endpoint allows max 100 days per request
    count = 0
    for chunk_start, chunk_end in chunk_dates(last_date, today, 100):
        url = f"https://api.fitbit.com/1.2/user/-/sleep/date/{chunk_start}/{chunk_end}.json"
        data = api_get(url)
        
        sleeps = data.get("sleep", [])
        for entry in sleeps:
            date_str = entry.get("dateOfSleep")
            mins = entry.get("minutesAsleep", 0)
            
            # Save Sleep Duration in hours
            hours = round(mins / 60.0, 2)
            if hours > 0:
                save_metric(MetricData(
                    test_name="Sleep",
                    value=hours,
                    unit="hours",
                    report_date=date_str
                ))
                count += 1
                
    return count

def sync_active_zone_minutes():
    """Syncs Active Zone Minutes from the last saved date to today in 1-year chunks."""
    last_date = get_db_last_date("Active Zone Minutes")
    today = datetime.now().strftime("%Y-%m-%d")
    
    if last_date >= today:
        print("Active Zone Minutes is already up to date.")
        return 0
        
    print(f"Syncing Active Zone Minutes from {last_date} to {today}")
    
    # Fitbit active zone minutes endpoint allows max 1 year per request
    count = 0
    for chunk_start, chunk_end in chunk_dates(last_date, today, 365):
        url = f"https://api.fitbit.com/1/user/-/activities/active-zone-minutes/date/{chunk_start}/{chunk_end}.json"
        data = api_get(url)
        
        activities = data.get("activities-active-zone-minutes", [])
        for entry in activities:
            date_str = entry.get("dateTime")
            # Value is sometimes 0, which is perfectly valid for AZM.
            try:
                mins = entry["value"]["activeZoneMinutes"]
            except (KeyError, TypeError):
                mins = 0
                
            if mins >= 0:
                save_metric(MetricData(
                    test_name="Active Zone Minutes",
                    value=mins,
                    unit="minutes",
                    report_date=date_str
                ))
                count += 1
                
    return count

def manual_sync_all():
    """Triggers the sync for all tracked Fitbit metrics."""
    sleep_count = sync_sleep()
    azm_count = sync_active_zone_minutes()
    return {
        "sleep_records_synced": sleep_count,
        "azm_records_synced": azm_count,
        "total_synced": sleep_count + azm_count
    }
