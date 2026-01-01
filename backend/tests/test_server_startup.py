
import sys
import os

# Add project root (parent) to path for 'backend' package
sys.path.insert(0, os.path.abspath(os.path.join(os.getcwd(), '..')))
# Add current dir for 'app' module
sys.path.insert(0, os.getcwd())

print("Attempting to import app...")
try:
    from app import app
    print("App imported successfully.")
except Exception as e:
    print(f"App import failed: {e}")
    sys.exit(1)
