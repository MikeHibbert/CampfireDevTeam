#!/usr/bin/env python3
"""
Test runner script for CampfireValley backend
Runs all tests with proper configuration and reporting
"""

import subprocess
import sys
import os
from pathlib import Path

def run_tests():
    """Run all backend tests"""
    print("Running CampfireValley Backend Tests")
    print("=" * 50)
    
    # Change to backend directory
    backend_dir = Path(__file__).parent
    os.chdir(backend_dir)
    
    # Test categories to run
    test_categories = [
        ("Unit Tests", "tests/test_*.py -k 'not integration and not e2e'"),
        ("Integration Tests", "tests/test_*.py -k 'integration'"),
        ("End-to-End Tests", "tests/test_*.py -k 'e2e'"),
        ("All Tests", "tests/")
    ]
    
    results = {}
    
    for category, test_pattern in test_categories:
        print(f"\n{category}")
        print("-" * len(category))
        
        try:
            # Run pytest with specific pattern
            cmd = ["python", "-m", "pytest"] + test_pattern.split()
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode == 0:
                print(f"✓ {category} passed")
                results[category] = "PASSED"
            else:
                print(f"✗ {category} failed")
                print("STDOUT:", result.stdout)
                print("STDERR:", result.stderr)
                results[category] = "FAILED"
                
        except subprocess.TimeoutExpired:
            print(f"✗ {category} timed out")
            results[category] = "TIMEOUT"
        except Exception as e:
            print(f"✗ {category} error: {str(e)}")
            results[category] = "ERROR"
    
    # Print summary
    print("\n" + "=" * 50)
    print("Test Results Summary")
    print("=" * 50)
    
    for category, result in results.items():
        status_symbol = "✓" if result == "PASSED" else "✗"
        print(f"{status_symbol} {category}: {result}")
    
    # Return overall success
    failed_tests = [cat for cat, result in results.items() if result != "PASSED"]
    if failed_tests:
        print(f"\nFailed categories: {', '.join(failed_tests)}")
        return False
    else:
        print("\nAll tests passed!")
        return True

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)