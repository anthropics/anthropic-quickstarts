# Updated Str Edit Tool Branch Summary

## Overview
This branch modernizes the computer-use demo with Claude 4 models and introduces the new streamlined `str_replace_based_edit_tool`.

## New str_replace_based_edit_tool (EditTool20250429)
The major enhancement is the new `str_replace_based_edit_tool` that replaces the previous `str_replace_editor`:

### Key Changes
- **Tool name**: `str_replace_editor` → `str_replace_based_edit_tool`
- **API type**: `text_editor_20250124` → `str_replace_based_edit_tool`
- **Removed `undo_edit` command** - streamlined from 5 to 4 commands for cleaner UX
- **Kept all core functionality**: `view`, `create`, `str_replace`, `insert` work identically
- **277+ lines added** to implement the new tool version

## Model Configuration Updates
- **New default**: `claude-sonnet-4-20250514` (was `claude-opus-4@20250508`)
- **Added Claude 4 models**: `claude-opus-4-20250514` and `claude-sonnet-4-20250514`
- **Renamed config**: `OPUS_4` → `CLAUDE_4` for better naming consistency

## API Type Updates
- **Bash tool**: `bash_20241022` → `bash_20250124`
- **Edit tool**: Uses `text_editor_20250429` (for new API release)
- **Computer tool**: Kept as `computer_20241022` (type compatibility)

## Documentation & Bug Fixes
- **README updates**: Updated to highlight Claude 4 Sonnet as default and new edit tool
- **Beta header fixes**: Resolved `computer-use-2025-04-29` compatibility issues
- **Final preparation**: Ready for upcoming API release supporting the new tool

## Impact
The branch delivers a modernized computer-use demo with Claude 4 models as the default and a streamlined editing experience that removes undo functionality for simplified usage.