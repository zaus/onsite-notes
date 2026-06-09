---
description: "Added optional line filtering and context extraction to the breakdown script, allowing users to extract only lines matching a pattern (regex or literal) plus optional following lines."
timestamp: "2026-06-09 0514"
model: "GitHub Copilot / Claude Haiku 4.5"
applyTo: "src/standalone/breakdown.ps1"
---

## User Prompt

i'd like to add an optional filter to the breakdown script to only keep lines containing the filtered text (regex or just 'find' string). with an optional argument to include the following X lines.

## Summary

- Added three new optional parameters to `breakdown.ps1`:
  - `-FilterPattern` — text or regex pattern to match
  - `-ContextLines <int>` — number of lines to include after each match (default: 0)
  - `-UseRegex` — switch to use regex instead of literal string matching
- Created internal `Get-FilteredLines` function that:
  - Finds all lines matching the pattern
  - Includes specified context lines after each match
  - Deduplicates overlapping context ranges
  - Returns the filtered line set
- Updated main chunking logic to apply the filter when `-FilterPattern` is provided, then chunk the filtered result normally
- Preserves original source path in chunk metadata for traceability

## Examples

```powershell
# Extract ERROR lines plus 3 context lines
.\breakdown.ps1 -Path .\logs -FilterPattern 'ERROR' -ContextLines 3

# Extract lines containing TODO
.\breakdown.ps1 -Path .\notes -FilterPattern 'TODO' -ContextLines 1 -UseRegex:$false

# Regex: find timestamp patterns plus 2 context lines
.\breakdown.ps1 -Path .\data -FilterPattern '^\d{4}-\d{2}-\d{2}' -ContextLines 2
```
