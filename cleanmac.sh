#!/bin/bash

# Mac Cleanup Script - Chrome Profiles, Downloads, and Desktop
# Requires confirmation before proceeding

echo "╔════════════════════════════════════════════════╗"
echo "║     MAC CLEANUP UTILITY v1.0 - BY AVA          ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "⚠️  WARNING: This operation will PERMANENTLY delete:"
echo "   • All Chrome user profiles"
echo "   • All files in Downloads folder"
echo "   • All files on Desktop"
echo ""
read -p "Are you absolutely certain? (type 'yes' to proceed): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo "Operation cancelled. Wise decision."
    exit 0
fi

echo ""
echo "Proceeding with cleanup..."
echo ""

# 1. DELETE CHROME PROFILES
echo "▶️  [1/3] Cleaning Chrome profiles..."
CHROME_PATH="$HOME/Library/Application Support/Google/Chrome"

if [ -d "$CHROME_PATH" ]; then
    # Keep Local State file but delete everything else
    find "$CHROME_PATH" -maxdepth 1 -type d -not -name "Chrome" -not -name "." -not -name ".." | while read -r profile; do
        if [ -d "$profile" ]; then
            profile_name=$(basename "$profile")
            rm -rf "$profile"
            echo "   ✓ Deleted profile: $profile_name"
        fi
    done
    echo "   ✓ Chrome profiles cleanup complete"
else
    echo "   ◇ Chrome not found (nothing to delete)"
fi

echo ""

# 2. DELETE DOWNLOADS
echo "▶️  [2/3] Cleaning Downloads folder..."
DOWNLOADS_PATH="$HOME/Downloads"

if [ -d "$DOWNLOADS_PATH" ]; then
    file_count=$(find "$DOWNLOADS_PATH" -maxdepth 1 -type f | wc -l)
    dir_count=$(find "$DOWNLOADS_PATH" -maxdepth 1 -type d ! -name "Downloads" | wc -l)
    
    find "$DOWNLOADS_PATH" -maxdepth 1 -type f -delete
    find "$DOWNLOADS_PATH" -maxdepth 1 -type d ! -name "Downloads" -exec rm -rf {} + 2>/dev/null
    
    echo "   ✓ Deleted $file_count files and $dir_count directories from Downloads"
else
    echo "   ◇ Downloads folder not found"
fi

echo ""

# 3. DELETE DESKTOP
echo "▶️  [3/3] Cleaning Desktop..."
DESKTOP_PATH="$HOME/Desktop"

if [ -d "$DESKTOP_PATH" ]; then
    file_count=$(find "$DESKTOP_PATH" -maxdepth 1 -type f | wc -l)
    dir_count=$(find "$DESKTOP_PATH" -maxdepth 1 -type d ! -name "Desktop" | wc -l)
    
    find "$DESKTOP_PATH" -maxdepth 1 -type f -delete
    find "$DESKTOP_PATH" -maxdepth 1 -type d ! -name "Desktop" -exec rm -rf {} + 2>/dev/null
    
    echo "   ✓ Deleted $file_count files and $dir_count directories from Desktop"
else
    echo "   ◇ Desktop folder not found"
fi

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  ✓ CLEANUP COMPLETE - System ready for use     ║"
echo "╚════════════════════════════════════════════════╝"
