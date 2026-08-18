import os
import json
import pymysql
import requests

CLOUD_API_URL = "https://trading-demo-backend.onrender.com/api/admin/get-all-users"
backup_file = os.path.join(os.path.dirname(__file__), 'backend', 'users_backup.json')

users_data = []

# Step 1: Attempt to fetch live accounts from cloud server
print(f"Fetching live registered accounts from cloud server ({CLOUD_API_URL})...")
try:
    r = requests.get(CLOUD_API_URL, timeout=25)
    if r.status_code == 200 and r.json().get('success'):
        users_data = r.json().get('users', [])
        print(f"[SUCCESS] Retrieved {len(users_data)} live account(s) from cloud server!")
        # Save to local users_backup.json
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(users_data, f, indent=2)
except Exception as e:
    print(f"[WARNING] Cloud server response delayed ({e}). Using local backup data...")

# Step 2: Fallback to local backup file if cloud lookup returned empty
if not users_data and os.path.exists(backup_file):
    with open(backup_file, 'r', encoding='utf-8') as f:
        users_data = json.load(f)

print(f"Found total {len(users_data)} user account(s) to sync into MySQL. Connecting to local MySQL server (root:1234@127.0.0.1:3306/bullx_trading)...")

try:
    conn = pymysql.connect(
        host='127.0.0.1',
        port=3306,
        user='root',
        password='1234',
        database='bullx_trading',
        autocommit=True
    )
    cursor = conn.cursor()

    # Drop old legacy tables to ensure clean schema update
    cursor.execute("SET FOREIGN_KEY_CHECKS=0;")
    cursor.execute("DROP TABLE IF EXISTS user;")
    cursor.execute("DROP TABLE IF EXISTS user_details;")
    cursor.execute("DROP TABLE IF EXISTS user_login;")
    cursor.execute("SET FOREIGN_KEY_CHECKS=1;")

    # 1. Table 1: user_login (Strict Account Credentials & Authentication Only)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_login (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(80) UNIQUE NOT NULL,
            email VARCHAR(120) UNIQUE NOT NULL,
            phone VARCHAR(120),
            password_hash VARCHAR(200) NOT NULL,
            mpin_hash VARCHAR(200),
            is_verified BOOLEAN DEFAULT TRUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    # 2. Table 2: user_details (All Extended Wallet & Profile KYC Details)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_details (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNIQUE NOT NULL,
            email VARCHAR(120) NOT NULL,
            demo_balance DOUBLE DEFAULT 100000.0,
            watchlist TEXT,
            active_devices TEXT,
            dob VARCHAR(20) DEFAULT '15-08-1998',
            pan_number VARCHAR(20) DEFAULT 'ABCDE1234F',
            gender VARCHAR(20) DEFAULT 'Male',
            marital_status VARCHAR(20) DEFAULT 'Single',
            occupation VARCHAR(50) DEFAULT 'Professional',
            income_range VARCHAR(50) DEFAULT '5-10 Lakhs',
            father_name VARCHAR(80) DEFAULT 'Rajesh Sharma',
            profile_pic LONGTEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES user_login(id) ON DELETE CASCADE
        );
    ''')

    # 3. Populate user_login and user_details
    for item in users_data:
        username = item.get('username')
        email = item.get('email')
        phone = item.get('phone', '')
        pwd = item.get('password_hash')
        mpin = item.get('mpin_hash')
        balance = item.get('demo_balance', 100000.0)
        watchlist = item.get('watchlist', '[]')
        devices = item.get('active_devices', '[]')

        cursor.execute("SELECT id FROM user_login WHERE email = %s OR username = %s;", (email, username))
        row = cursor.fetchone()

        if not row:
            cursor.execute('''
                INSERT INTO user_login (username, email, phone, password_hash, mpin_hash, is_verified)
                VALUES (%s, %s, %s, %s, %s, %s);
            ''', (username, email, phone, pwd, mpin, True))
            user_id = cursor.lastrowid
        else:
            user_id = row[0]
            cursor.execute('''
                UPDATE user_login SET phone=%s, password_hash=%s, mpin_hash=%s WHERE id=%s;
            ''', (phone, pwd, mpin, user_id))

        # Sync user_details
        cursor.execute("SELECT id FROM user_details WHERE user_id = %s;", (user_id,))
        dt_row = cursor.fetchone()

        if not dt_row:
            cursor.execute('''
                INSERT INTO user_details (user_id, email, demo_balance, watchlist, active_devices, dob, pan_number, gender, marital_status, occupation, income_range, father_name, profile_pic)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            ''', (
                user_id, email, balance, watchlist, devices,
                item.get('dob', '15-08-1998'),
                item.get('pan_number', 'ABCDE1234F'),
                item.get('gender', 'Male'),
                item.get('marital_status', 'Single'),
                item.get('occupation', 'Professional'),
                item.get('income_range', '5-10 Lakhs'),
                item.get('father_name', 'Rajesh Sharma'),
                item.get('profile_pic')
            ))

    print("\n[SUCCESS] All live account records synced into local MySQL database bullx_trading!")
    
    cursor.execute("SELECT id, username, email, phone, password_hash, mpin_hash FROM user_login;")
    logins = cursor.fetchall()
    print("\n=== TABLE 1: user_login (STRICT CREDENTIALS & AUTH ONLY) ===")
    for l in logins:
        pwd_preview = l[4][:25] + "..." if l[4] else "None"
        mpin_preview = l[5][:25] + "..." if l[5] else "None"
        print(f"ID: {l[0]} | Full Name: {l[1]} | Email: {l[2]} | Mobile: {l[3]}")
        print(f"  Hidden Password: {pwd_preview} | Hidden MPIN: {mpin_preview}")
        print("-" * 65)

    cursor.execute("SELECT id, user_id, email, demo_balance, dob, pan_number, gender FROM user_details;")
    details = cursor.fetchall()
    print("\n=== TABLE 2: user_details (EXTENDED WALLET & PROFILE DETAILS) ===")
    for d in details:
        print(f"ID: {d[0]} | User ID Link: {d[1]} | Email: {d[2]} | Balance: RS {d[3]:,.2f}")
        print(f"  DOB: {d[4]} | PAN: {d[5]} | Gender: {d[6]}")
        print("-" * 65)

    cursor.close()
    conn.close()

except Exception as e:
    print(f"[MYSQL ERROR]: {e}")
