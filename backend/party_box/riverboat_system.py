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
from .campfire_loader import CampfireRegistry
from .storage_manager import PartyBoxStorageManager
from .context_manager import ContextManager, FileAttachment, ContextInfo

logger = logging.getLogger(__name__)

class RiverboatSystem:
    """
    Generic riverboat system for Party Box routing and message flow management
    Dynamically loads campfires from manifest configurations
    Implements Requirements 12.1, 12.6
    """
    
    def __init__(self, redis_conn, ollama_client, party_box_storage: Path, manifests_directory: Path = None):
        self.party_box_storage = party_box_storage
        self.redis_conn = redis_conn
        self.ollama_client = ollama_client
        
        # Initialize storage manager
        self.storage_manager = PartyBoxStorageManager(party_box_storage)
        
        # Initialize context manager
        self.context_manager = ContextManager(party_box_storage)
        
        # Initialize processing campfires
        self.unloading_campfire = UnloadingCampfire()
        self.security_campfire = SecurityCampfire()
        self.offloading_campfire = OffloadingCampfire()
        
        # Initialize campfire registry for dynamic loading
        manifests_dir = manifests_directory or party_box_storage.parent
        self.campfire_registry = CampfireRegistry(manifests_dir, ollama_client)
        self.active_campfire = None
        
        logger.info("Riverboat system initialized with generic campfire loading capability")
    
    async def initialize_campfires(self):
        """Initialize campfires from manifest files"""
        try:
            await self.campfire_registry.load_all_campfires()
            
            # Set default active campfire
            self.active_campfire = self.campfire_registry.get_default_campfire()
            
            if self.active_campfire:
                logger.info(f"Active campfire set to: {self.active_campfire.name}")
            else:
                logger.warning("No campfires loaded - system will use fallback processing")
                
        except Exception as e:
            logger.error(f"Failed to initialize campfires: {str(e)}")
            raise
    
    def set_active_campfire(self, campfire_name: str) -> bool:
        """Set the active campfire by name"""
        campfire = self.campfire_registry.get_campfire(campfire_name)
        if campfire:
            self.active_campfire = campfire
            logger.info(f"Active campfire changed to: {campfire_name}")
            return True
        else:
            logger.warning(f"Campfire not found: {campfire_name}")
            return False
    
    def get_available_campfires(self) -> List[str]:
        """Get list of available campfire names"""
        return self.campfire_registry.list_campfires()
    
    async def receive_party_box(self, party_box) -> Dict[str, Any]:
        """
        Process incoming Party Box through the riverboat system
        Implements message flow between processing campfires
        Requirements: 12.1, 12.6
        """
        try:
            # Store incoming Party Box using storage manager
            party_box_data = party_box.model_dump() if hasattr(party_box, 'model_dump') else party_box
            party_box_id = await self.storage_manager.store_party_box(party_box_data, "incoming")
            
            # Process and store context and attachments
            await self._process_party_box_context(party_box_id, party_box)
            
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
            
            # Step 3: Route to active campfire for processing
            if not self.active_campfire:
                logger.error("No active campfire available for processing")
                raise RiverboatProcessingError("No active campfire configured")
            
            logger.info(f"Routing Party Box {party_box_id} to {self.active_campfire.name} campfire")
            result = await self.active_campfire.process(validated)
            logger.info(f"Party Box {party_box_id} processed by {self.active_campfire.name} campfire")
            
            # Step 4: Offloading campfire - package response
            response = await self.offloading_campfire.process(result)
            logger.info(f"Party Box {party_box_id} processed by offloading campfire")
            
            # Cache the response
            await self._cache_response(cache_key, response, ttl=1800)  # 30 minutes
            
            # Store response Party Box using storage manager
            await self.storage_manager.store_party_box(response, "outgoing", party_box_id)
            
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
    
    async def get_party_box(self, party_box_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve Party Box data by ID using storage manager
        """
        return await self.storage_manager.retrieve_party_box(party_box_id)
    
    async def get_storage_stats(self) -> Dict[str, Any]:
        """
        Get storage statistics using storage manager
        """
        return await self.storage_manager.get_storage_stats()
    
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
        """Get status of a specific Party Box by ID using storage manager"""
        try:
            metadata = await self.storage_manager.get_metadata(party_box_id)
            if metadata:
                return {
                    "party_box_id": party_box_id,
                    "direction": metadata.direction,
                    "timestamp": metadata.timestamp.isoformat(),
                    "claim_type": metadata.claim_type,
                    "task_summary": metadata.task_summary,
                    "file_size": metadata.file_size,
                    "attachments_count": metadata.attachments_count,
                    "status": "completed" if metadata.direction == "outgoing" else "processing"
                }
            return None
            
        except Exception as e:
            logger.error(f"Error getting Party Box status: {str(e)}")
            return None
    
    async def _process_party_box_context(self, party_box_id: str, party_box) -> bool:
        """
        Process and store Party Box context and attachments
        Implements requirements 3.3 and 11.5
        """
        try:
            torch_data = party_box.torch if hasattr(party_box, 'torch') else party_box.get('torch', {})
            
            # Create context information
            context = self.context_manager.create_context_info(
                current_file=torch_data.get('context', {}).get('current_file'),
                project_structure=torch_data.get('context', {}).get('project_structure', []),
                terminal_history=torch_data.get('context', {}).get('terminal_history', []),
                workspace_root=torch_data.get('workspace_root', ''),
                os_type=torch_data.get('os', 'linux'),
                environment_vars=torch_data.get('context', {}).get('environment_vars', {})
            )
            
            # Process file attachments
            attachments = []
            torch_attachments = torch_data.get('attachments', [])
            
            for attachment_data in torch_attachments:
                # Validate attachment data
                if not all(key in attachment_data for key in ['path', 'content']):
                    logger.warning(f"Invalid attachment data in Party Box {party_box_id}")
                    continue
                
                # Create file attachment with metadata
                attachment = self.context_manager.create_file_attachment(
                    file_path=attachment_data['path'],
                    content=attachment_data['content'],
                    content_type=attachment_data.get('type'),
                    timestamp=datetime.fromisoformat(attachment_data['timestamp']) if 'timestamp' in attachment_data else None
                )
                
                # Validate attachment for security
                validation_errors = self.context_manager.validate_attachment(attachment)
                if validation_errors:
                    logger.warning(f"Attachment validation failed for {attachment.path}: {validation_errors}")
                    continue
                
                attachments.append(attachment)
            
            # Store context and attachments
            await self.context_manager.store_context(party_box_id, context, attachments)
            
            logger.info(f"Processed context for Party Box {party_box_id}: {len(attachments)} attachments")
            return True
            
        except Exception as e:
            logger.error(f"Failed to process context for Party Box {party_box_id}: {str(e)}")
            return False
    
    async def get_context_info(self, party_box_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve context information for a Party Box
        """
        try:
            context_data = await self.context_manager.retrieve_context(party_box_id)
            if context_data:
                context, attachments = context_data
                return {
                    "context": {
                        "current_file": context.current_file,
                        "project_structure": context.project_structure,
                        "terminal_history": context.terminal_history,
                        "workspace_root": context.workspace_root,
                        "os_type": context.os_type,
                        "environment_vars": context.environment_vars
                    },
                    "attachments": [
                        {
                            "path": att.path,
                            "content_type": att.content_type,
                            "size": att.size,
                            "timestamp": att.timestamp.isoformat(),
                            "checksum": att.checksum
                        }
                        for att in attachments
                    ]
                }
            return None
        except Exception as e:
            logger.error(f"Failed to get context info for Party Box {party_box_id}: {str(e)}")
            return None
    
    async def cleanup_old_party_boxes(self, max_age_days: int = 1):
        """Clean up old Party Box files using storage manager"""
        try:
            cleaned_count = await self.storage_manager.cleanup_old_party_boxes(max_age_days)
            if cleaned_count > 0:
                logger.info(f"Cleaned up {cleaned_count} old Party Box files")
            return cleaned_count
                
        except Exception as e:
            logger.error(f"Error cleaning up Party Box files: {str(e)}")
            return 0


class SecurityValidationError(Exception):
    """Raised when Party Box fails security validation"""
    pass


class RiverboatProcessingError(Exception):
    """Raised when riverboat processing fails"""
    pass