#!/usr/bin/env python3
"""
Riverboat System for CampfireValley
Handles Party Box delivery and routing between processing campfires
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from pathlib import Path

from .processing_campfires import UnloadingCampfire, SecurityCampfire, OffloadingCampfire
from .devteam_campfire import DevTeamCampfire

logger = logging.getLogger(__name__)

class RiverboatSystem:
    """
    Riverboat system for Party Box routing and message flow management
    Implements Requirements 12.1, 12.6
    """
    
    def __init__(self, redis_conn, ollama_client, party_box_storage: Path):
        self.party_box_storage = party_box_storage
        self.redis_conn = redis_conn
        self.ollama_client = ollama_client
        
        # Initialize processing campfires
        self.unloading_campfire = UnloadingCampfire()
        self.security_campfire = SecurityCampfire()
        self.offloading_campfire = OffloadingCampfire()
        self.devteam_campfire = DevTeamCampfire(ollama_client)
        
        logger.info("Riverboat system initialized with processing campfires")
    
    async def receive_party_box(self, party_box) -> Dict[str, Any]:
        """
        Process incoming Party Box through the riverboat system
        Implements message flow between processing campfires
        Requirements: 12.1, 12.6
        """
        try:
            # Store incoming Party Box
            party_box_id = await self._store_party_box(party_box, "incoming")
            logger.info(f"Received Party Box {party_box_id} - Claim: {party_box.torch.claim}")
            
            # Check for cached response
            cache_key = f"party_box:{party_box.torch.claim}:{hash(party_box.torch.task)}"
            cached_response = await self._get_cached_response(cache_key)
            if cached_response:
                logger.info(f"Returning cached response for Party Box {party_box_id}")
                return cached_response
            
            # Publish to Redis for monitoring
            await self._publish_message("party_box_received", {
                "party_box_id": party_box_id,
                "claim": party_box.torch.claim,
                "task": party_box.torch.task,
                "timestamp": datetime.now().isoformat()
            })
            
            # Route through processing campfires in sequence
            logger.info(f"Routing Party Box {party_box_id} through processing campfires")
            
            # Step 1: Unloading campfire - unpack Party Box contents
            unpacked = await self.unloading_campfire.process(party_box)
            logger.info(f"Party Box {party_box_id} processed by unloading campfire")
            
            # Step 2: Security campfire - validate contents
            validated = await self.security_campfire.process(unpacked)
            logger.info(f"Party Box {party_box_id} processed by security campfire")
            
            if not validated.get("secure", False):
                error_msg = validated.get("reason", "Security validation failed")
                logger.warning(f"Party Box {party_box_id} failed security validation: {error_msg}")
                
                # Publish security failure
                await self._publish_message("party_box_security_failed", {
                    "party_box_id": party_box_id,
                    "reason": error_msg,
                    "timestamp": datetime.now().isoformat()
                })
                
                raise SecurityValidationError(error_msg)
            
            # Step 3: Route to DevTeam campfire for processing
            logger.info(f"Routing Party Box {party_box_id} to DevTeam campfire")
            result = await self.devteam_campfire.process(validated)
            logger.info(f"Party Box {party_box_id} processed by DevTeam campfire")
            
            # Step 4: Offloading campfire - package response
            response = await self.offloading_campfire.process(result)
            logger.info(f"Party Box {party_box_id} processed by offloading campfire")
            
            # Cache the response
            await self._cache_response(cache_key, response, ttl=1800)  # 30 minutes
            
            # Store response Party Box
            await self._store_party_box(response, "outgoing", party_box_id)
            
            # Publish completion to Redis
            await self._publish_message("party_box_completed", {
                "party_box_id": party_box_id,
                "processing_time": (datetime.now() - datetime.fromisoformat(
                    party_box.metadata.get("received_at", datetime.now().isoformat())
                )).total_seconds(),
                "timestamp": datetime.now().isoformat()
            })
            
            logger.info(f"Party Box {party_box_id} processing completed successfully")
            return response
            
        except SecurityValidationError:
            raise
        except Exception as e:
            logger.error(f"Error processing Party Box: {str(e)}")
            
            # Publish error to Redis
            await self._publish_message("party_box_error", {
                "party_box_id": party_box_id if 'party_box_id' in locals() else "unknown",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })
            
            raise RiverboatProcessingError(f"Riverboat processing failed: {str(e)}")
    
    async def _store_party_box(self, party_box: Any, direction: str, party_box_id: str = None) -> str:
        """
        Store Party Box to filesystem for persistence
        Requirements: 9.6, 8.4
        """
        if party_box_id is None:
            party_box_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        
        filename = f"{direction}_{party_box_id}.json"
        filepath = self.party_box_storage / filename
        
        # Convert to dict if it's a Pydantic model
        if hasattr(party_box, 'model_dump'):
            data = party_box.model_dump()
        else:
            data = party_box
            
        # Add storage metadata
        data["storage_metadata"] = {
            "stored_at": datetime.now().isoformat(),
            "direction": direction,
            "party_box_id": party_box_id,
            "file_path": str(filepath)
        }
            
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2, default=str)
            
        logger.info(f"Stored Party Box: {filename}")
        return party_box_id
    
    async def _get_cached_response(self, key: str) -> Optional[Dict[str, Any]]:
        """Get cached response from Redis"""
        try:
            if self.redis_conn and self.redis_conn.redis_client:
                return await self.redis_conn.get_cached_response(key)
        except Exception as e:
            logger.warning(f"Failed to get cached response: {str(e)}")
        return None
    
    async def _cache_response(self, key: str, response: Dict[str, Any], ttl: int = 3600):
        """Cache response in Redis with TTL"""
        try:
            if self.redis_conn and self.redis_conn.redis_client:
                await self.redis_conn.cache_response(key, response, ttl)
        except Exception as e:
            logger.warning(f"Failed to cache response: {str(e)}")
    
    async def _publish_message(self, channel: str, message: Dict[str, Any]):
        """Publish message to Redis channel for monitoring"""
        try:
            if self.redis_conn and self.redis_conn.redis_client:
                await self.redis_conn.publish_message(channel, message)
        except Exception as e:
            logger.warning(f"Failed to publish message to {channel}: {str(e)}")
    
    async def get_party_box_status(self, party_box_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a specific Party Box by ID"""
        try:
            # Check for incoming Party Box
            incoming_path = self.party_box_storage / f"incoming_{party_box_id}.json"
            outgoing_path = self.party_box_storage / f"outgoing_{party_box_id}.json"
            
            status = {
                "party_box_id": party_box_id,
                "incoming_exists": incoming_path.exists(),
                "outgoing_exists": outgoing_path.exists(),
                "status": "unknown"
            }
            
            if status["outgoing_exists"]:
                status["status"] = "completed"
            elif status["incoming_exists"]:
                status["status"] = "processing"
            
            return status
            
        except Exception as e:
            logger.error(f"Error getting Party Box status: {str(e)}")
            return None
    
    async def cleanup_old_party_boxes(self, max_age_hours: int = 24):
        """Clean up old Party Box files to prevent storage bloat"""
        try:
            cutoff_time = datetime.now().timestamp() - (max_age_hours * 3600)
            cleaned_count = 0
            
            for file_path in self.party_box_storage.glob("*.json"):
                if file_path.stat().st_mtime < cutoff_time:
                    file_path.unlink()
                    cleaned_count += 1
            
            if cleaned_count > 0:
                logger.info(f"Cleaned up {cleaned_count} old Party Box files")
                
        except Exception as e:
            logger.error(f"Error cleaning up Party Box files: {str(e)}")


class SecurityValidationError(Exception):
    """Raised when Party Box fails security validation"""
    pass


class RiverboatProcessingError(Exception):
    """Raised when riverboat processing fails"""
    pass