# Sample code for demo - intentionally has security issues for review demo
import hashlib

def authenticate_user(username, password):
    # Security issue: using MD5 (weak hashing)
    hashed_password = hashlib.md5(password.encode()).hexdigest()
    
    # Security issue: hardcoded credentials
    if username == "admin" and hashed_password == "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8":
        return True
    
    # Security issue: no rate limiting, timing attacks possible
    return False

def process_user_input(user_data):
    # Security issue: no input validation
    eval(user_data)  # Dangerous!
    
def save_to_file(filename, data):
    # Security issue: path traversal vulnerability
    with open(filename, 'w') as f:
        f.write(data)