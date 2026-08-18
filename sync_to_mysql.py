import os
import json
import pymysql

# Path to users_backup.json
backup_file = os.path.join(os.path.dirname(__file__), 'backend', 'users_backup.json')
if not os.path.exists(backup_file):
    backup_file = os.path.join(os.path.dirname(__file__), 'users_backup.json')

print(f"Reading live account records from {backup_file}...")

if not os.path.exists(backup_file):
    print("❌ Backup file not found!")
    exit(1)

with open(backup_file, 'r', encoding='utf-8') as f:
    users_data = json.load(f)

print(f"Found {len(users_data)} user account(s). Connecting to local MySQL server (root:1234@127.0.0.1:3306/bullx_trading)...")

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

    # 1. Create clean tables if not exist
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_login (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(80) UNIQUE NOT NULL,
            email VARCHAR(120) UNIQUE NOT NULL,
            phone VARCHAR(120),
            password_hash VARCHAR(200) NOT NULL,
            mpin_hash VARCHAR(200),
            is_verified BOOLEAN DEFAULT TRUE,
            demo_balance DOUBLE DEFAULT 100000.0,
            watchlist TEXT,
            active_devices TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_details (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNIQUE NOT NULL,
            email VARCHAR(120) NOT NULL,
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

    # 2. Sync every user into user_login and user_details
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
                INSERT INTO user_login (username, email, phone, password_hash, mpin_hash, is_verified, demo_balance, watchlist, active_devices)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
            ''', (username, email, phone, pwd, mpin, True, balance, watchlist, devices))
            user_id = cursor.lastrowid
        else:
            user_id = row[0]
            cursor.execute('''
                UPDATE user_login SET phone=%s, password_hash=%s, mpin_hash=%s, demo_balance=%s WHERE id=%s;
            ''', (phone, pwd, mpin, balance, user_id))

        # Sync user_details
        cursor.execute("SELECT id FROM user_details WHERE user_id = %s;", (user_id,))
        dt_row = cursor.fetchone()

        if not dt_row:
            cursor.execute('''
                INSERT INTO user_details (user_id, email, dob, pan_number, gender, marital_status, occupation, income_range, father_name, profile_pic)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            ''', (
                user_id, email,
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
    cursor.execute("SELECT id, username, email, phone FROM user_login;")
    logins = cursor.fetchall()
    print("\n=== MYSQL user_login TABLE CONTENTS ===")
    for l in logins:
        print(f"ID: {l[0]} | Name: {l[1]} | Email: {l[2]} | Phone: {l[3]}")

    cursor.close()
    conn.close()

except Exception as e:
    print(f"[MYSQL ERROR]: {e}")
