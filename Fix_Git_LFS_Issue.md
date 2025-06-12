# Fix Git LFS Issue - Large File Removal

## Problem
The file `old_method/v2_emdat_items.json` (100.47 MB) exceeds GitHub's 100 MB limit and is blocking repository pushes.

## Solution Steps

### 1. Remove Large File from Git History
```bash
# Remove the large file from Git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch old_method/v2_emdat_items.json' \
  --prune-empty --tag-name-filter cat -- --all

# Alternative using git-filter-repo (if available)
git filter-repo --path old_method/v2_emdat_items.json --invert-paths
```

### 2. Clean Up Git References
```bash
# Remove backup references
rm -rf .git/refs/original/

# Expire reflog entries
git reflog expire --expire=now --all

# Garbage collect
git gc --prune=now --aggressive
```

### 3. Force Push Changes
```bash
# Force push to overwrite remote history
git push origin --force --all
git push origin --force --tags
```

### 4. Verify File Removal
```bash
# Check repository size
du -sh .git/

# Verify file is gone from history
git log --all --full-history -- old_method/v2_emdat_items.json
```

## Updated .gitignore

The .gitignore has been updated to prevent future large file commits:

```gitignore
# Large data files
*.json
!.env.example
!package.json
!pyproject.toml
old_method/
*.csv
*.zip
*.gz
*.tar
*.7z

# Large output files
*_items.json
*_events.json
*_analysis.json
*_results.json
*_export.json
```

## Alternative: Use Git LFS

If you need to track large files, set up Git LFS:

```bash
# Install Git LFS
git lfs install

# Track large file types
git lfs track "*.json"
git lfs track "old_method/*"

# Add .gitattributes
git add .gitattributes
git commit -m "Configure Git LFS"

# Add large files
git add old_method/v2_emdat_items.json
git commit -m "Add large file with LFS"
git push
```

## Prevention

- Keep data files under 100 MB
- Use .gitignore for data directories
- Consider external storage for large datasets
- Use Git LFS for necessary large files

## Quick Fix Command Sequence

```bash
# 1. Remove from history
git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch old_method/v2_emdat_items.json' --prune-empty --tag-name-filter cat -- --all

# 2. Clean up
rm -rf .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 3. Force push
git push origin --force --all

# 4. Verify
git log --oneline | head -5
```

This will permanently remove the large file from Git history and allow successful pushes to GitHub.