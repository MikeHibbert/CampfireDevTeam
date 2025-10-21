#!/usr/bin/env python3
"""
Comprehensive Error Handling for CampfireValley Backend
Requirements: 12.3, 12.7, 13.7
"""

import logging
import traceback
from datetime import datetime
from enum import Enum
from typing import Dict, Any, List, Optional, Union
from dataclasses import dataclass, asdict
import json

logger = logging.getLogger(__name__)

class ErrorType(Enum):
    """Error type enumeration"""
    SECURITY_VALIDATION = "security_validation"
    PARTY_BOX_VALIDATION = "party_box_validation"
    PROCESSING = "processing"
    NETWORK = "network"
    STORAGE = "storage"
    CONFIGURATION = "configuration"
    RESOURCE = "resource"
    TIMEOUT = "timeout"
    UNKNOWN = "unknown"

class ErrorSeverity(Enum):
    """Error severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class CampfireError:
    """Standardized error structure for CampfireValley"""
    error_type: ErrorType
    severity: ErrorSeverity
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None
    timestamp: Optional[datetime] = None
    retryable: bool = False
    user_message: str = ""
    technical_message: str = ""
    suggested_actions: List[str] = None
    context: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()
        if self.suggested_actions is None:
            self.suggested_actions = []
        if not self.user_message:
            self.user_message = self.message
        if not self.technical_message:
            self.technical_message = self.message

    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary for JSON serialization"""
        result = asdict(self)
        result['error_type'] = self.error_type.value
        result['severity'] = self.severity.value
        result['timestamp'] = self.timestamp.isoformat() if self.timestamp else None
        return result

    def to_response_format(self) -> Dict[str, Any]:
        """Convert to API response format"""
        return {
            "error": {
                "code": self.code,
                "message": self.user_message,
                "details": self.details or {},
                "retry_possible": self.retryable,
                "timestamp": self.timestamp.isoformat() if self.timestamp else None,
                "severity": self.severity.value,
                "suggested_actions": self.suggested_actions
            }
        }

class ErrorHandler:
    """Centralized error handling for CampfireValley backend"""
    
    def __init__(self):
        self.error_history: List[CampfireError] = []
        self.max_history_size = 1000
        self.error_counts: Dict[str, int] = {}

    def create_error(
        self,
        error_type: ErrorType,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        retryable: bool = False,
        context: Optional[Dict[str, Any]] = None
    ) -> CampfireError:
        """Create a standardized error object"""
        
        error = CampfireError(
            error_type=error_type,
            severity=severity,
            code=code,
            message=message,
            details=details,
            retryable=retryable,
            user_message=self._generate_user_message(error_type, code, message),
            technical_message=message,
            suggested_actions=self._generate_suggested_actions(error_type, code),
            context=context
        )
        
        self._log_error(error)
        self._track_error(error)
        
        return error

    def handle_security_validation_error(
        self,
        validation_type: str,
        reason: str,
        details: Optional[Dict[str, Any]] = None
    ) -> CampfireError:
        """Handle security validation errors"""
        
        code = f"SECURITY_{validation_type.upper()}_FAILED"
        message = f"Security validation failed: {reason}"
        
        return self.create_error(
            error_type=ErrorType.SECURITY_VALIDATION,
            code=code,
            message=message,
            details=details,
            severity=ErrorSeverity.CRITICAL,
            retryable=False,
            context={"validation_type": validation_type, "reason": reason}
        )

    def handle_party_box_validation_error(
        self,
        validation_errors: List[str],
        party_box_data: Optional[Dict[str, Any]] = None
    ) -> CampfireError:
        """Handle Party Box validation errors"""
        
        return self.create_error(
            error_type=ErrorType.PARTY_BOX_VALIDATION,
            code="PARTY_BOX_INVALID",
            message=f"Party Box validation failed: {'; '.join(validation_errors)}",
            details={
                "validation_errors": validation_errors,
                "party_box_preview": self._sanitize_party_box_for_logging(party_box_data)
            },
            severity=ErrorSeverity.HIGH,
            retryable=False
        )

    def handle_processing_error(
        self,
        component: str,
        operation: str,
        original_error: Exception,
        context: Optional[Dict[str, Any]] = None
    ) -> CampfireError:
        """Handle processing errors from campfires"""
        
        code = f"PROCESSING_{component.upper()}_{operation.upper()}_FAILED"
        message = f"Processing failed in {component} during {operation}: {str(original_error)}"
        
        # Determine if error is retryable
        retryable = self._is_retryable_error(original_error)
        
        # Determine severity based on error type
        severity = self._determine_severity(original_error)
        
        return self.create_error(
            error_type=ErrorType.PROCESSING,
            code=code,
            message=message,
            details={
                "component": component,
                "operation": operation,
                "original_error": str(original_error),
                "error_type": type(original_error).__name__,
                "traceback": traceback.format_exc()
            },
            severity=severity,
            retryable=retryable,
            context=context
        )

    def handle_network_error(
        self,
        operation: str,
        original_error: Exception,
        endpoint: Optional[str] = None
    ) -> CampfireError:
        """Handle network-related errors"""
        
        code = "NETWORK_ERROR"
        message = f"Network error during {operation}: {str(original_error)}"
        
        if "timeout" in str(original_error).lower():
            code = "NETWORK_TIMEOUT"
            message = f"Network timeout during {operation}"
        elif "connection" in str(original_error).lower():
            code = "NETWORK_CONNECTION_ERROR"
            message = f"Connection error during {operation}"
        
        return self.create_error(
            error_type=ErrorType.NETWORK,
            code=code,
            message=message,
            details={
                "operation": operation,
                "endpoint": endpoint,
                "original_error": str(original_error)
            },
            severity=ErrorSeverity.HIGH,
            retryable=True
        )

    def handle_storage_error(
        self,
        operation: str,
        file_path: Optional[str],
        original_error: Exception
    ) -> CampfireError:
        """Handle storage-related errors"""
        
        code = f"STORAGE_{operation.upper()}_FAILED"
        message = f"Storage operation failed: {operation}"
        
        if "permission" in str(original_error).lower():
            code = "STORAGE_PERMISSION_DENIED"
            message = "Storage permission denied"
        elif "space" in str(original_error).lower():
            code = "STORAGE_NO_SPACE"
            message = "Insufficient storage space"
        elif "not found" in str(original_error).lower():
            code = "STORAGE_NOT_FOUND"
            message = "Storage path not found"
        
        return self.create_error(
            error_type=ErrorType.STORAGE,
            code=code,
            message=message,
            details={
                "operation": operation,
                "file_path": file_path,
                "original_error": str(original_error)
            },
            severity=ErrorSeverity.HIGH,
            retryable=self._is_retryable_storage_error(original_error)
        )

    def handle_resource_error(
        self,
        resource_type: str,
        limit_exceeded: str,
        current_usage: Optional[Dict[str, Any]] = None
    ) -> CampfireError:
        """Handle resource limit errors"""
        
        return self.create_error(
            error_type=ErrorType.RESOURCE,
            code=f"RESOURCE_{resource_type.upper()}_EXCEEDED",
            message=f"Resource limit exceeded: {limit_exceeded}",
            details={
                "resource_type": resource_type,
                "limit_exceeded": limit_exceeded,
                "current_usage": current_usage
            },
            severity=ErrorSeverity.HIGH,
            retryable=True
        )

    def handle_timeout_error(
        self,
        operation: str,
        timeout_duration: float,
        context: Optional[Dict[str, Any]] = None
    ) -> CampfireError:
        """Handle timeout errors"""
        
        return self.create_error(
            error_type=ErrorType.TIMEOUT,
            code="OPERATION_TIMEOUT",
            message=f"Operation timed out: {operation}",
            details={
                "operation": operation,
                "timeout_duration": timeout_duration,
                "context": context
            },
            severity=ErrorSeverity.HIGH,
            retryable=True
        )

    def get_error_statistics(self) -> Dict[str, Any]:
        """Get error statistics for monitoring"""
        
        total_errors = len(self.error_history)
        
        # Count by type
        by_type = {}
        for error_type in ErrorType:
            by_type[error_type.value] = sum(
                1 for error in self.error_history 
                if error.error_type == error_type
            )
        
        # Count by severity
        by_severity = {}
        for severity in ErrorSeverity:
            by_severity[severity.value] = sum(
                1 for error in self.error_history 
                if error.severity == severity
            )
        
        # Recent errors (last 10)
        recent_errors = [
            {
                "code": error.code,
                "message": error.user_message,
                "timestamp": error.timestamp.isoformat() if error.timestamp else None,
                "severity": error.severity.value
            }
            for error in self.error_history[-10:]
        ]
        
        return {
            "total_errors": total_errors,
            "by_type": by_type,
            "by_severity": by_severity,
            "recent_errors": recent_errors,
            "error_counts": dict(self.error_counts)
        }

    def clear_error_history(self) -> None:
        """Clear error history"""
        self.error_history.clear()
        self.error_counts.clear()

    def export_error_history(self) -> str:
        """Export error history as JSON"""
        return json.dumps([error.to_dict() for error in self.error_history], indent=2, default=str)

    def _log_error(self, error: CampfireError) -> None:
        """Log error based on severity"""
        
        log_message = f"[{error.error_type.value}:{error.code}] {error.technical_message}"
        
        if error.severity == ErrorSeverity.CRITICAL:
            logger.critical(log_message, extra={"error_details": error.details})
        elif error.severity == ErrorSeverity.HIGH:
            logger.error(log_message, extra={"error_details": error.details})
        elif error.severity == ErrorSeverity.MEDIUM:
            logger.warning(log_message, extra={"error_details": error.details})
        else:
            logger.info(log_message, extra={"error_details": error.details})

    def _track_error(self, error: CampfireError) -> None:
        """Track error in history and statistics"""
        
        # Add to history
        self.error_history.append(error)
        
        # Maintain history size limit
        if len(self.error_history) > self.max_history_size:
            self.error_history = self.error_history[-self.max_history_size:]
        
        # Update error counts
        self.error_counts[error.code] = self.error_counts.get(error.code, 0) + 1

    def _generate_user_message(self, error_type: ErrorType, code: str, message: str) -> str:
        """Generate user-friendly error message"""
        
        user_messages = {
            "SECURITY_PATH_TRAVERSAL_FAILED": "Security check failed: Invalid file path detected",
            "SECURITY_WORKSPACE_BOUNDARY_FAILED": "Security check failed: File path outside workspace",
            "SECURITY_DANGEROUS_PATTERNS_FAILED": "Security check failed: Potentially dangerous content detected",
            "SECURITY_FILE_SIZE_LIMITS_FAILED": "Security check failed: File size limits exceeded",
            "PARTY_BOX_INVALID": "Invalid request format. Please check your input.",
            "NETWORK_TIMEOUT": "Request timed out. Please try again.",
            "NETWORK_CONNECTION_ERROR": "Unable to connect to external service.",
            "STORAGE_PERMISSION_DENIED": "Permission denied. Please check file permissions.",
            "STORAGE_NO_SPACE": "Insufficient storage space available.",
            "OPERATION_TIMEOUT": "Operation took too long to complete. Please try again."
        }
        
        return user_messages.get(code, message)

    def _generate_suggested_actions(self, error_type: ErrorType, code: str) -> List[str]:
        """Generate suggested actions for error resolution"""
        
        action_map = {
            "SECURITY_PATH_TRAVERSAL_FAILED": ["Check file paths", "Ensure paths are relative to workspace"],
            "SECURITY_WORKSPACE_BOUNDARY_FAILED": ["Verify workspace configuration", "Check file paths"],
            "SECURITY_DANGEROUS_PATTERNS_FAILED": ["Review content for security issues", "Contact administrator"],
            "PARTY_BOX_INVALID": ["Check request format", "Validate input data"],
            "NETWORK_TIMEOUT": ["Check network connection", "Retry request", "Increase timeout"],
            "NETWORK_CONNECTION_ERROR": ["Check service status", "Verify network connectivity"],
            "STORAGE_PERMISSION_DENIED": ["Check file permissions", "Run with appropriate privileges"],
            "STORAGE_NO_SPACE": ["Free up disk space", "Check storage limits"],
            "OPERATION_TIMEOUT": ["Retry operation", "Check system resources"]
        }
        
        return action_map.get(code, ["Contact support", "Check logs for details"])

    def _is_retryable_error(self, error: Exception) -> bool:
        """Determine if an error is retryable"""
        
        retryable_patterns = [
            "timeout",
            "connection",
            "network",
            "temporary",
            "busy",
            "unavailable"
        ]
        
        error_str = str(error).lower()
        return any(pattern in error_str for pattern in retryable_patterns)

    def _determine_severity(self, error: Exception) -> ErrorSeverity:
        """Determine error severity based on exception type"""
        
        critical_patterns = ["security", "permission", "authentication"]
        high_patterns = ["connection", "timeout", "not found"]
        
        error_str = str(error).lower()
        
        if any(pattern in error_str for pattern in critical_patterns):
            return ErrorSeverity.CRITICAL
        elif any(pattern in error_str for pattern in high_patterns):
            return ErrorSeverity.HIGH
        else:
            return ErrorSeverity.MEDIUM

    def _is_retryable_storage_error(self, error: Exception) -> bool:
        """Determine if a storage error is retryable"""
        
        non_retryable_patterns = ["permission", "not found", "invalid"]
        error_str = str(error).lower()
        
        return not any(pattern in error_str for pattern in non_retryable_patterns)

    def _sanitize_party_box_for_logging(self, party_box_data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Sanitize Party Box data for safe logging"""
        
        if not party_box_data:
            return None
        
        # Create a safe copy with sensitive data removed
        safe_data = {}
        
        if "torch" in party_box_data:
            torch = party_box_data["torch"]
            safe_data["torch"] = {
                "claim": torch.get("claim"),
                "task": torch.get("task", "")[:100] + "..." if len(torch.get("task", "")) > 100 else torch.get("task"),
                "os": torch.get("os"),
                "workspace_root": "***REDACTED***" if torch.get("workspace_root") else None,
                "attachments_count": len(torch.get("attachments", []))
            }
        
        if "metadata" in party_box_data:
            safe_data["metadata"] = {
                key: value for key, value in party_box_data["metadata"].items()
                if key not in ["workspace_root", "file_paths", "file_contents"]
            }
        
        return safe_data

# Global error handler instance
error_handler = ErrorHandler()

# Custom exception classes
class SecurityValidationError(Exception):
    """Raised when security validation fails"""
    def __init__(self, message: str, validation_type: str = "unknown", details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.validation_type = validation_type
        self.details = details or {}

class PartyBoxValidationError(Exception):
    """Raised when Party Box validation fails"""
    def __init__(self, message: str, validation_errors: List[str], party_box_data: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.validation_errors = validation_errors
        self.party_box_data = party_box_data

class RiverboatProcessingError(Exception):
    """Raised when riverboat processing fails"""
    def __init__(self, message: str, component: str, operation: str, original_error: Optional[Exception] = None):
        super().__init__(message)
        self.component = component
        self.operation = operation
        self.original_error = original_error