# Complete Git Large File Fix

## Problem Analysis
The error shows `File v2_emdat_items.json is 100.47 MB` (note: no path prefix), indicating the file exists in Git history at the root level, not in `old_method/` directory.

## Complete Solution

### Step 1: Remove File from All Possible Locations
```bash
# Remove from root directory
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch v2_emdat_items.json' \
  --prune-empty --tag-name-filter cat -- --all

# Remove from old_method directory (backup)
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch old_method/v2_emdat_items.json' \
  --prune-empty --tag-name-filter cat -- --all
```

### Step 2: Alternative - Use BFG Repo Cleaner (Recommended)
```bash
# Download BFG Repo Cleaner
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# Remove large files
java -jar bfg-1.14.0.jar --delete-files v2_emdat_items.json

# Clean up
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

### Step 3: Complete Cleanup
```bash
# Remove all backup references
rm -rf .git/refs/original/

# Expire all reflog entries immediately
git reflog expire --expire=now --all

# Aggressive garbage collection
git gc --prune=now --aggressive

# Verify repository size
du -sh .git/
```

### Step 4: Force Push All Branches
```bash
# Push all branches with force
git push origin --force --all

# Push all tags with force  
git push origin --force --tags
```

## Alternative: Start Fresh Repository

If the above doesn't work, create a clean repository:

```bash
# 1. Backup current work
cp -r . ../backup-workspace

# 2. Create new repository
git init
git remote add origin https://github.com/nishadhka/deploy-eo-api.git

# 3. Add only necessary files
git add .env.example .gitignore README.md *.py *.md
git add -f pyproject.toml  # Force add important config

# 4. Commit and push
git commit -m "Clean repository without large files"
git push origin main --force
```

## Verification Commands

```bash
# Check for large files in history
git rev-list --objects --all | grep "$(git verify-pack -v .git/objects/pack/*.idx | sort -k 3 -nr | head -10 | awk '{print$1}')"

# Check repository size
du -sh .git/

# List all files ever committed
git log --pretty=format: --name-only --diff-filter=A | sort -u
```

## Quick One-Line Fix

Try this comprehensive command:
```bash
git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch v2_emdat_items.json old_method/v2_emdat_items.json' --prune-empty --tag-name-filter cat -- --all && rm -rf .git/refs/original/ && git reflog expire --expire=now --all && git gc --prune=now --aggressive && git push origin --force --all
```

The key issue is the file path - the error shows `v2_emdat_items.json` without the `old_method/` prefix, so it's likely in the root directory of your repository history.