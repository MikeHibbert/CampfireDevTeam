#!/usr/bin/env python3
"""
Party Box Storage Manager
Handles persistent storage of Party Box files and metadata
"""

import os
import json
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
from dataclasses import dataclass, asdict
import logging
import hashlib
import shutil

logger = logging.getLogger(__name__)

@dataclass
class StorageMetadata:
    """Metadata for stored Party Box files"""
    party_box_id: str
    direction: str  # incoming, outgoing, processing
    timestamp: datetime
    file_size: int
    checksum: str
    workspace_root: str
    claim_type: str
    task_summary: str
    attachments_count: int
    storage_path: str

class PartyBoxStorageManager:
    """
    Manages persistent storage of Party Box files with metadata tracking
    Implements requirements 9.6 and 8.4 for Party Box storage and Docker volume mounting
    """
    
    def __init__(self, storage_root: Union[str, Path] = "./party_box"):
        """
        Initialize Party Box storage manager
        
        Args:
            storage_root: Root directory for Party Box storage
        """
        self.storage_root = Path(storage_root)
        self.metadata_dir = self.storage_root / "metadata"
        self.incoming_dir = self.storage_root / "incoming"
        self.outgoing_dir = self.storage_root / "outgoing"
        self.processing_dir = self.storage_root / "processing"
        self.attachments_dir = self.storage_root / "attachments"
        
        # Ensure all directories exist
        self._ensure_directories()
        
        logger.info(f"Party Box storage initialized at: {self.storage_root}")
    
    def _ensure_directories(self):
        """Create necessary storage directories"""
        directories = [
            self.storage_root,
            self.metadata_dir,
            self.incoming_dir,
            self.outgoing_dir,
            self.processing_dir,
            self.attachments_dir
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
            
        # Create .gitkeep files to ensure directories are tracked
        for directory in directories[1:]:  # Skip root directory
            gitkeep_file = directory / ".gitkeep"
            if not gitkeep_file.exists():
                gitkeep_file.touch()
    
    def _generate_party_box_id(self, party_box_data: Dict[str, Any]) -> str:
        """Generate unique Party Box ID based on content and timestamp"""
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        
        # Create content hash for uniqueness
        content_str = json.dumps(party_box_data, sort_keys=True, default=str)
        content_hash = hashlib.md5(content_str.encode()).hexdigest()[:8]
        
        return f"{timestamp}_{content_hash}"
    
    def _calculate_checksum(self, file_path: Path) -> str:
        """Calculate MD5 checksum of file"""
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    
    def _get_storage_directory(self, direction: str) -> Path:
        """Get appropriate storage directory based on direction"""
        direction_map = {
            "incoming": self.incoming_dir,
            "outgoing": self.outgoing_dir,
            "processing": self.processing_dir
        }
        
        return direction_map.get(direction, self.processing_dir)
    
    async def store_party_box(
        self, 
        party_box_data: Dict[str, Any], 
        direction: str = "processing",
        party_box_id: Optional[str] = None
    ) -> str:
        """
        Store Party Box data to filesystem with metadata
        
        Args:
            party_box_data: Party Box data to store
            direction: Storage direction (incoming, outgoing, processing)
            party_box_id: Optional existing Party Box ID
            
        Returns:
            str: Generated or provided Party Box ID
        """
        try:
            # Generate ID if not provided
            if party_box_id is None:
                party_box_id = self._generate_party_box_id(party_box_data)
            
            # Get storage directory
            storage_dir = self._get_storage_directory(direction)
            
            # Create Party Box file
            party_box_filename = f"{party_box_id}.json"
            party_box_path = storage_dir / party_box_filename
            
            # Store Party Box data
            with open(party_box_path, 'w', encoding='utf-8') as f:
                json.dump(party_box_data, f, indent=2, default=str, ensure_ascii=False)
            
            # Calculate file metadata
            file_size = party_box_path.stat().st_size
            checksum = self._calculate_checksum(party_box_path)
            
            # Extract metadata from Party Box
            torch_data = party_box_data.get("torch", {})
            workspace_root = torch_data.get("workspace_root", "")
            claim_type = torch_data.get("claim", "unknown")
            task_summary = torch_data.get("task", "")[:100]  # Truncate for metadata
            attachments = torch_data.get("attachments", [])
            attachments_count = len(attachments)
            
            # Store attachments separately if they exist
            if attachments:
                await self._store_attachments(party_box_id, attachments)
            
            # Create storage metadata
            metadata = StorageMetadata(
                party_box_id=party_box_id,
                direction=direction,
                timestamp=datetime.now(timezone.utc),
                file_size=file_size,
                checksum=checksum,
                workspace_root=workspace_root,
                claim_type=claim_type,
                task_summary=task_summary,
                attachments_count=attachments_count,
                storage_path=str(party_box_path.relative_to(self.storage_root))
            )
            
            # Store metadata
            await self._store_metadata(metadata)
            
            logger.info(f"Stored Party Box {party_box_id} in {direction} ({file_size} bytes)")
            return party_box_id
            
        except Exception as e:
            logger.error(f"Failed to store Party Box: {str(e)}")
            raise
    
    async def _store_attachments(self, party_box_id: str, attachments: List[Dict[str, Any]]):
        """Store file attachments separately for better organization"""
        attachment_dir = self.attachments_dir / party_box_id
        attachment_dir.mkdir(exist_ok=True)
        
        for i, attachment in enumerate(attachments):
            # Create safe filename
            original_path = attachment.get("path", f"attachment_{i}")
            safe_filename = original_path.replace("/", "_").replace("\\", "_")
            
            # Store attachment content
            attachment_path = attachment_dir / safe_filename
            content = attachment.get("content", "")
            
            with open(attachment_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            # Store attachment metadata
            attachment_metadata = {
                "original_path": original_path,
                "content_type": attachment.get("type", "text/plain"),
                "timestamp": attachment.get("timestamp", datetime.now(timezone.utc).isoformat()),
                "size": len(content.encode('utf-8')),
                "stored_path": str(attachment_path.relative_to(self.storage_root))
            }
            
            metadata_path = attachment_dir / f"{safe_filename}.metadata.json"
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(attachment_metadata, f, indent=2, default=str)
        
        logger.info(f"Stored {len(attachments)} attachments for Party Box {party_box_id}")
    
    async def _store_metadata(self, metadata: StorageMetadata):
        """Store Party Box metadata"""
        metadata_filename = f"{metadata.party_box_id}.metadata.json"
        metadata_path = self.metadata_dir / metadata_filename
        
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(asdict(metadata), f, indent=2, default=str)
    
    async def retrieve_party_box(self, party_box_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve Party Box data by ID
        
        Args:
            party_box_id: Party Box ID to retrieve
            
        Returns:
            Dict containing Party Box data or None if not found
        """
        try:
            # Search in all directories
            for direction in ["incoming", "outgoing", "processing"]:
                storage_dir = self._get_storage_directory(direction)
                party_box_path = storage_dir / f"{party_box_id}.json"
                
                if party_box_path.exists():
                    with open(party_box_path, 'r', encoding='utf-8') as f:
                        party_box_data = json.load(f)
                    
                    # Load attachments if they exist
                    attachment_dir = self.attachments_dir / party_box_id
                    if attachment_dir.exists():
                        attachments = await self._load_attachments(party_box_id)
                        if "torch" in party_box_data:
                            party_box_data["torch"]["attachments"] = attachments
                    
                    logger.info(f"Retrieved Party Box {party_box_id} from {direction}")
                    return party_box_data
            
            logger.warning(f"Party Box {party_box_id} not found")
            return None
            
        except Exception as e:
            logger.error(f"Failed to retrieve Party Box {party_box_id}: {str(e)}")
            return None
    
    async def _load_attachments(self, party_box_id: str) -> List[Dict[str, Any]]:
        """Load attachments for a Party Box"""
        attachment_dir = self.attachments_dir / party_box_id
        attachments = []
        
        if not attachment_dir.exists():
            return attachments
        
        for attachment_file in attachment_dir.glob("*.metadata.json"):
            try:
                # Load attachment metadata
                with open(attachment_file, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                
                # Load attachment content
                content_file = attachment_dir / attachment_file.stem
                if content_file.exists():
                    with open(content_file, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    attachment = {
                        "path": metadata.get("original_path", ""),
                        "content": content,
                        "type": metadata.get("content_type", "text/plain"),
                        "timestamp": metadata.get("timestamp", "")
                    }
                    attachments.append(attachment)
                    
            except Exception as e:
                logger.error(f"Failed to load attachment {attachment_file}: {str(e)}")
        
        return attachments
    
    async def get_metadata(self, party_box_id: str) -> Optional[StorageMetadata]:
        """
        Get metadata for a Party Box
        
        Args:
            party_box_id: Party Box ID
            
        Returns:
            StorageMetadata object or None if not found
        """
        try:
            metadata_path = self.metadata_dir / f"{party_box_id}.metadata.json"
            
            if metadata_path.exists():
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    metadata_dict = json.load(f)
                
                # Convert timestamp string back to datetime
                if isinstance(metadata_dict.get("timestamp"), str):
                    metadata_dict["timestamp"] = datetime.fromisoformat(
                        metadata_dict["timestamp"].replace("Z", "+00:00")
                    )
                
                return StorageMetadata(**metadata_dict)
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get metadata for {party_box_id}: {str(e)}")
            return None
    
    async def list_party_boxes(
        self, 
        direction: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[StorageMetadata]:
        """
        List stored Party Boxes with optional filtering
        
        Args:
            direction: Filter by direction (incoming, outgoing, processing)
            limit: Maximum number of results
            offset: Number of results to skip
            
        Returns:
            List of StorageMetadata objects
        """
        try:
            metadata_files = list(self.metadata_dir.glob("*.metadata.json"))
            metadata_list = []
            
            for metadata_file in metadata_files:
                try:
                    with open(metadata_file, 'r', encoding='utf-8') as f:
                        metadata_dict = json.load(f)
                    
                    # Convert timestamp string back to datetime
                    if isinstance(metadata_dict.get("timestamp"), str):
                        metadata_dict["timestamp"] = datetime.fromisoformat(
                            metadata_dict["timestamp"].replace("Z", "+00:00")
                        )
                    
                    metadata = StorageMetadata(**metadata_dict)
                    
                    # Apply direction filter
                    if direction is None or metadata.direction == direction:
                        metadata_list.append(metadata)
                        
                except Exception as e:
                    logger.error(f"Failed to load metadata from {metadata_file}: {str(e)}")
            
            # Sort by timestamp (newest first)
            metadata_list.sort(key=lambda x: x.timestamp, reverse=True)
            
            # Apply pagination
            return metadata_list[offset:offset + limit]
            
        except Exception as e:
            logger.error(f"Failed to list Party Boxes: {str(e)}")
            return []
    
    async def cleanup_old_party_boxes(self, days_old: int = 30) -> int:
        """
        Clean up Party Boxes older than specified days
        
        Args:
            days_old: Number of days after which to delete Party Boxes
            
        Returns:
            Number of Party Boxes cleaned up
        """
        try:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_old)
            cleaned_count = 0
            
            metadata_list = await self.list_party_boxes()
            
            for metadata in metadata_list:
                if metadata.timestamp < cutoff_date:
                    await self.delete_party_box(metadata.party_box_id)
                    cleaned_count += 1
            
            logger.info(f"Cleaned up {cleaned_count} old Party Boxes")
            return cleaned_count
            
        except Exception as e:
            logger.error(f"Failed to cleanup old Party Boxes: {str(e)}")
            return 0
    
    async def delete_party_box(self, party_box_id: str) -> bool:
        """
        Delete a Party Box and all associated files
        
        Args:
            party_box_id: Party Box ID to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            deleted_files = 0
            
            # Delete from all storage directories
            for direction in ["incoming", "outgoing", "processing"]:
                storage_dir = self._get_storage_directory(direction)
                party_box_path = storage_dir / f"{party_box_id}.json"
                
                if party_box_path.exists():
                    party_box_path.unlink()
                    deleted_files += 1
            
            # Delete metadata
            metadata_path = self.metadata_dir / f"{party_box_id}.metadata.json"
            if metadata_path.exists():
                metadata_path.unlink()
                deleted_files += 1
            
            # Delete attachments directory
            attachment_dir = self.attachments_dir / party_box_id
            if attachment_dir.exists():
                shutil.rmtree(attachment_dir)
                deleted_files += 1
            
            if deleted_files > 0:
                logger.info(f"Deleted Party Box {party_box_id} ({deleted_files} files)")
                return True
            else:
                logger.warning(f"Party Box {party_box_id} not found for deletion")
                return False
                
        except Exception as e:
            logger.error(f"Failed to delete Party Box {party_box_id}: {str(e)}")
            return False
    
    async def get_storage_stats(self) -> Dict[str, Any]:
        """
        Get storage statistics
        
        Returns:
            Dictionary with storage statistics
        """
        try:
            stats = {
                "total_party_boxes": 0,
                "by_direction": {"incoming": 0, "outgoing": 0, "processing": 0},
                "total_size_bytes": 0,
                "total_attachments": 0,
                "oldest_party_box": None,
                "newest_party_box": None
            }
            
            metadata_list = await self.list_party_boxes(limit=1000)  # Get all
            
            if metadata_list:
                stats["total_party_boxes"] = len(metadata_list)
                stats["oldest_party_box"] = metadata_list[-1].timestamp.isoformat()
                stats["newest_party_box"] = metadata_list[0].timestamp.isoformat()
                
                for metadata in metadata_list:
                    stats["by_direction"][metadata.direction] += 1
                    stats["total_size_bytes"] += metadata.file_size
                    stats["total_attachments"] += metadata.attachments_count
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get storage stats: {str(e)}")
            return {"error": str(e)}