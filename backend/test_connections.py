#!/usr/bin/env python3
"""
Connection test script for CampfireValley backend
Tests Redis and Ollama connectivity
"""

import asyncio
import os
import sys
from pathlib import Path

# Add the backend directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from mcp_server import RedisConnection, OllamaClient

async def test_connections():
    """Test Redis and Ollama connections"""
    print("Testing CampfireValley Backend Connections")
    print("=" * 50)
    
    # Get environment variables
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
    ollama_url = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434")
    
    print(f"Redis URL: {redis_url}")
    print(f"Ollama URL: {ollama_url}")
    print()
    
    # Test Redis connection
    print("Testing Redis connection...")
    redis_conn = RedisConnection(redis_url)
    try:
        await redis_conn.connect()
        print("✓ Redis connection successful")
        
        # Test basic operations
        await redis_conn.cache_response("test_key", {"test": "data"}, ttl=60)
        cached = await redis_conn.get_cached_response("test_key")
        if cached and cached.get("test") == "data":
            print("✓ Redis cache operations working")
        else:
            print("✗ Redis cache operations failed")
            
        await redis_conn.publish_message("test_channel", {"message": "test"})
        print("✓ Redis publish operations working")
        
    except Exception as e:
        print(f"✗ Redis connection failed: {str(e)}")
    finally:
        await redis_conn.disconnect()
    
    print()
    
    # Test Ollama connection
    print("Testing Ollama connection...")
    ollama_client = OllamaClient(ollama_url)
    try:
        health = await ollama_client.health_check()
        if health:
            print("✓ Ollama connection successful")
            
            # Test basic generation (if models are available)
            try:
                response = await ollama_client.generate_response(
                    model="codellama:7b",
                    prompt="Write a simple Python hello world function",
                    system_prompt="You are a helpful coding assistant."
                )
                
                if "error" not in response:
                    print("✓ Ollama generation working")
                    print(f"Sample response length: {len(response.get('response', ''))}")
                else:
                    print(f"✗ Ollama generation failed: {response.get('error')}")
                    
            except Exception as e:
                print(f"✗ Ollama generation test failed: {str(e)}")
                
        else:
            print("✗ Ollama connection failed")
            
    except Exception as e:
        print(f"✗ Ollama connection error: {str(e)}")
    finally:
        await ollama_client.close()
    
    print()
    print("Connection tests completed")

if __name__ == "__main__":
    asyncio.run(test_connections())