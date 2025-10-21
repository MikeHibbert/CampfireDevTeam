#!/usr/bin/env python3
"""
Context Manager for CampfireValley
Manages file attachments and context information for Party Box processing
"""

import os
import json
import logging
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Union, Tuple
from dataclasses import dataclass, asdict
import mimetypes

logger = logging.getLogger(__name__)

@dataclass
class FileAttachment:
    """Represents a file attachment with metadata"""
    path: str
    content: str
    content_type: str
    timestamp: datetime
    size: int
    checksum: str
    encoding: str = "utf-8"

@dataclass
class ContextInfo:
    """Context information for Party Box processing"""
    current_file: Optional[str] = None
    project_structure: List[str] = None
    terminal_history: List[str] = None
    workspace_root: str = ""
    os_type: str = "linux"
    environment_vars: Dict[str, str] = None
    
    def __post_init__(self):
        if self.project_structure is None:
            self.project_structure = []
        if self.terminal_history is None:
            self.terminal_history = []
        if self.environment_vars is None:
            self.environment_vars = {}

class ContextManager:
    """
    Manages context information and file attachments for Party Box processing
    Implements requirements 3.3 and 11.5 for context management and metadata tracking
    """
    
    def __init__(self, storage_root: Union[str, Path] = "./party_box"):
        """
        Initialize context manager
        
        Args:
            storage_root: Root directory for context storage
        """
        self.storage_root = Path(storage_root)
        self.context_dir = self.storage_root / "context"
        self.attachments_dir = self.storage_root / "attachments"
        
        # Ensure directories exist
        self._ensure_directories()
        
        logger.info(f"Context manager initialized at: {self.storage_root}")
    
    def _ensure_directories(self):
        """Create necessary context directories"""
        directories = [self.context_dir, self.attachments_dir]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
            
            # Create .gitkeep files
            gitkeep_file = directory / ".gitkeep"
            if not gitkeep_file.exists():
                gitkeep_file.touch()
    
    def _calculate_checksum(self, content: str) -> str:
        """Calculate MD5 checksum of content"""
        return hashlib.md5(content.encode('utf-8')).hexdigest()
    
    def _detect_content_type(self, file_path: str, content: str) -> str:
        """
        Detect content type based on file extension and content
        
        Args:
            file_path: Path to the file
            content: File content
            
        Returns:
            MIME type string
        """
        # Try to detect from file extension
        mime_type, _ = mimetypes.guess_type(file_path)
        
        if mime_type:
            return mime_type
        
        # Fallback detection based on content
        if content.strip().startswith(('<?xml', '<html', '<HTML')):
            return 'text/html'
        elif content.strip().startswith('{') or content.strip().startswith('['):
            return 'application/json'
        elif any(keyword in content for keyword in ['def ', 'import ', 'class ', 'if __name__']):
            return 'text/x-python'
        elif any(keyword in content for keyword in ['function', 'const ', 'let ', 'var ']):
            return 'text/javascript'
        elif any(keyword in content for keyword in ['SELECT', 'INSERT', 'UPDATE', 'DELETE']):
            return 'application/sql'
        else:
            return 'text/plain'
    
    def create_file_attachment(
        self, 
        file_path: str, 
        content: str, 
        content_type: Optional[str] = None,
        timestamp: Optional[datetime] = None
    ) -> FileAttachment:
        """
        Create a file attachment with metadata
        
        Args:
            file_path: Path to the file
            content: File content
            content_type: Optional MIME type
            timestamp: Optional timestamp
            
        Returns:
            FileAttachment object
        """
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)
        
        if content_type is None:
            content_type = self._detect_content_type(file_path, content)
        
        size = len(content.encode('utf-8'))
        checksum = self._calculate_checksum(content)
        
        attachment = FileAttachment(
            path=file_path,
            content=content,
            content_type=content_type,
            timestamp=timestamp,
            size=size,
            checksum=checksum
        )
        
        logger.debug(f"Created file attachment: {file_path} ({size} bytes, {content_type})")
        return attachment
    
    def create_context_info(
        self,
        current_file: Optional[str] = None,
        project_structure: Optional[List[str]] = None,
        terminal_history: Optional[List[str]] = None,
        workspace_root: str = "",
        os_type: str = "linux",
        environment_vars: Optional[Dict[str, str]] = None
    ) -> ContextInfo:
        """
        Create context information object
        
        Args:
            current_file: Currently active file
            project_structure: List of project files
            terminal_history: Recent terminal commands/output
            workspace_root: Root directory of workspace
            os_type: Operating system type
            environment_vars: Environment variables
            
        Returns:
            ContextInfo object
        """
        context = ContextInfo(
            current_file=current_file,
            project_structure=project_structure or [],
            terminal_history=terminal_history or [],
            workspace_root=workspace_root,
            os_type=os_type,
            environment_vars=environment_vars or {}
        )
        
        logger.debug(f"Created context info for workspace: {workspace_root}")
        return context
    
    async def store_context(
        self, 
        party_box_id: str, 
        context: ContextInfo, 
        attachments: List[FileAttachment]
    ) -> str:
        """
        Store context information and attachments for a Party Box
        
        Args:
            party_box_id: Party Box identifier
            context: Context information
            attachments: List of file attachments
            
        Returns:
            Context storage ID
        """
        try:
            # Create context storage directory
            context_storage_dir = self.context_dir / party_box_id
            context_storage_dir.mkdir(exist_ok=True)
            
            # Store context information
            context_file = context_storage_dir / "context.json"
            with open(context_file, 'w', encoding='utf-8') as f:
                json.dump(asdict(context), f, indent=2, default=str, ensure_ascii=False)
            
            # Store attachments
            attachments_data = []
            for i, attachment in enumerate(attachments):
                # Store attachment content
                safe_filename = self._make_safe_filename(attachment.path)
                attachment_file = context_storage_dir / f"attachment_{i}_{safe_filename}"
                
                with open(attachment_file, 'w', encoding='utf-8') as f:
                    f.write(attachment.content)
                
                # Store attachment metadata
                attachment_metadata = asdict(attachment)
                attachment_metadata['stored_path'] = str(attachment_file.relative_to(self.storage_root))
                attachments_data.append(attachment_metadata)
            
            # Store attachments metadata
            attachments_file = context_storage_dir / "attachments.json"
            with open(attachments_file, 'w', encoding='utf-8') as f:
                json.dump(attachments_data, f, indent=2, default=str, ensure_ascii=False)
            
            logger.info(f"Stored context for Party Box {party_box_id} with {len(attachments)} attachments")
            return party_box_id
            
        except Exception as e:
            logger.error(f"Failed to store context for Party Box {party_box_id}: {str(e)}")
            raise
    
    def _make_safe_filename(self, file_path: str) -> str:
        """Convert file path to safe filename"""
        # Replace path separators and other unsafe characters
        safe_name = file_path.replace("/", "_").replace("\\", "_")
        safe_name = safe_name.replace(":", "_").replace("*", "_")
        safe_name = safe_name.replace("?", "_").replace('"', "_")
        safe_name = safe_name.replace("<", "_").replace(">", "_")
        safe_name = safe_name.replace("|", "_")
        
        # Limit length
        if len(safe_name) > 100:
            name_part, ext_part = os.path.splitext(safe_name)
            safe_name = name_part[:95] + ext_part
        
        return safe_name
    
    async def retrieve_context(self, party_box_id: str) -> Optional[Tuple[ContextInfo, List[FileAttachment]]]:
        """
        Retrieve context information and attachments for a Party Box
        
        Args:
            party_box_id: Party Box identifier
            
        Returns:
            Tuple of (ContextInfo, List[FileAttachment]) or None if not found
        """
        try:
            context_storage_dir = self.context_dir / party_box_id
            
            if not context_storage_dir.exists():
                logger.warning(f"Context not found for Party Box {party_box_id}")
                return None
            
            # Load context information
            context_file = context_storage_dir / "context.json"
            if not context_file.exists():
                logger.warning(f"Context file not found for Party Box {party_box_id}")
                return None
            
            with open(context_file, 'r', encoding='utf-8') as f:
                context_data = json.load(f)
            
            # Convert timestamp strings back to datetime objects
            context = ContextInfo(**context_data)
            
            # Load attachments
            attachments = []
            attachments_file = context_storage_dir / "attachments.json"
            
            if attachments_file.exists():
                with open(attachments_file, 'r', encoding='utf-8') as f:
                    attachments_data = json.load(f)
                
                for attachment_metadata in attachments_data:
                    # Load attachment content
                    stored_path = self.storage_root / attachment_metadata['stored_path']
                    
                    if stored_path.exists():
                        with open(stored_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                        
                        # Convert timestamp string back to datetime
                        timestamp_str = attachment_metadata['timestamp']
                        if isinstance(timestamp_str, str):
                            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                        else:
                            timestamp = datetime.now(timezone.utc)
                        
                        attachment = FileAttachment(
                            path=attachment_metadata['path'],
                            content=content,
                            content_type=attachment_metadata['content_type'],
                            timestamp=timestamp,
                            size=attachment_metadata['size'],
                            checksum=attachment_metadata['checksum'],
                            encoding=attachment_metadata.get('encoding', 'utf-8')
                        )
                        attachments.append(attachment)
            
            logger.info(f"Retrieved context for Party Box {party_box_id} with {len(attachments)} attachments")
            return context, attachments
            
        except Exception as e:
            logger.error(f"Failed to retrieve context for Party Box {party_box_id}: {str(e)}")
            return None
    
    async def update_context(
        self, 
        party_box_id: str, 
        context_updates: Dict[str, Any] = None,
        new_attachments: List[FileAttachment] = None
    ) -> bool:
        """
        Update existing context information
        
        Args:
            party_box_id: Party Box identifier
            context_updates: Dictionary of context fields to update
            new_attachments: Additional attachments to add
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Retrieve existing context
            existing_data = await self.retrieve_context(party_box_id)
            if existing_data is None:
                logger.warning(f"Cannot update context - Party Box {party_box_id} not found")
                return False
            
            context, attachments = existing_data
            
            # Apply context updates
            if context_updates:
                for field, value in context_updates.items():
                    if hasattr(context, field):
                        setattr(context, field, value)
                    else:
                        logger.warning(f"Unknown context field: {field}")
            
            # Add new attachments
            if new_attachments:
                attachments.extend(new_attachments)
            
            # Store updated context
            await self.store_context(party_box_id, context, attachments)
            
            logger.info(f"Updated context for Party Box {party_box_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update context for Party Box {party_box_id}: {str(e)}")
            return False
    
    async def delete_context(self, party_box_id: str) -> bool:
        """
        Delete context information and attachments for a Party Box
        
        Args:
            party_box_id: Party Box identifier
            
        Returns:
            True if successful, False otherwise
        """
        try:
            context_storage_dir = self.context_dir / party_box_id
            
            if context_storage_dir.exists():
                import shutil
                shutil.rmtree(context_storage_dir)
                logger.info(f"Deleted context for Party Box {party_box_id}")
                return True
            else:
                logger.warning(f"Context not found for deletion: Party Box {party_box_id}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to delete context for Party Box {party_box_id}: {str(e)}")
            return False
    
    async def get_context_stats(self) -> Dict[str, Any]:
        """
        Get statistics about stored contexts
        
        Returns:
            Dictionary with context statistics
        """
        try:
            stats = {
                "total_contexts": 0,
                "total_attachments": 0,
                "total_size_bytes": 0,
                "contexts_by_os": {},
                "content_types": {}
            }
            
            for context_dir in self.context_dir.iterdir():
                if context_dir.is_dir() and context_dir.name != ".gitkeep":
                    stats["total_contexts"] += 1
                    
                    # Get context info
                    context_file = context_dir / "context.json"
                    if context_file.exists():
                        with open(context_file, 'r', encoding='utf-8') as f:
                            context_data = json.load(f)
                        
                        os_type = context_data.get("os_type", "unknown")
                        stats["contexts_by_os"][os_type] = stats["contexts_by_os"].get(os_type, 0) + 1
                    
                    # Count attachments
                    attachments_file = context_dir / "attachments.json"
                    if attachments_file.exists():
                        with open(attachments_file, 'r', encoding='utf-8') as f:
                            attachments_data = json.load(f)
                        
                        stats["total_attachments"] += len(attachments_data)
                        
                        for attachment in attachments_data:
                            stats["total_size_bytes"] += attachment.get("size", 0)
                            content_type = attachment.get("content_type", "unknown")
                            stats["content_types"][content_type] = stats["content_types"].get(content_type, 0) + 1
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get context stats: {str(e)}")
            return {"error": str(e)}
    
    def validate_attachment(self, attachment: FileAttachment) -> List[str]:
        """
        Validate file attachment for security and integrity
        
        Args:
            attachment: FileAttachment to validate
            
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        
        # Check file size (limit to 10MB)
        max_size = 10 * 1024 * 1024  # 10MB
        if attachment.size > max_size:
            errors.append(f"File too large: {attachment.size} bytes (max: {max_size})")
        
        # Check for suspicious file paths
        if ".." in attachment.path or attachment.path.startswith("/"):
            errors.append(f"Suspicious file path: {attachment.path}")
        
        # Verify checksum
        calculated_checksum = self._calculate_checksum(attachment.content)
        if calculated_checksum != attachment.checksum:
            errors.append(f"Checksum mismatch: expected {attachment.checksum}, got {calculated_checksum}")
        
        # Check for potentially dangerous content types
        dangerous_types = [
            'application/x-executable',
            'application/x-msdownload',
            'application/x-msdos-program'
        ]
        
        if attachment.content_type in dangerous_types:
            errors.append(f"Potentially dangerous content type: {attachment.content_type}")
        
        return errors