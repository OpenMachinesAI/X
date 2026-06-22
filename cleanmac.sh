#!/bin/bash

echo "╔════════════════════════════════════════════════╗"
echo "║     MAC CLEANUP UTILITY v1.0 - BY ALEX          ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "⚠️  WARNING: This operation will PERMANENTLY delete:"
echo "   • All Chrome user profiles"
echo "   • All files in Downloads folder"
echo "   • All files on Desktop"
read -p "Are you absolutely certain? (type 'yes' to proceed): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo "Operation cancelled. Wise decision."
    exit 0
fi

echo ""
echo "Proceeding with cleanup..."
echo ""

# Quit Chrome if running
echo "▶️  Quitting Chrome..."
killall "Google Chrome" 2>/dev/null
sleep 1

# DELETE CHROME PROFILES
echo "▶️  [1/3] Cleaning Chrome profiles..."
CHROME_PATH="$HOME/Library/Application Support/Google/Chrome"
rm -rf "$CHROME_PATH/Default" 2>/dev/null
rm -rf "$CHROME_PATH/Profile"* 2>/dev/null
rm -rf "$CHROME_PATH/Guest Profile" 2>/dev/null
echo "   ✓ Chrome profiles cleanup complete"

echo ""

# DELETE DOWNLOADS
echo "▶️  [2/3] Cleaning Downloads folder..."
rm -rf "$HOME/Downloads"/* 2>/dev/null
rm -rf "$HOME/Downloads"/.[!.]* 2>/dev/null
echo "   ✓ Downloads cleaned"

echo ""

# DELETE DESKTOP
echo "▶️  [3/3] Cleaning Desktop..."
rm -rf "$HOME/Desktop"/* 2>/dev/null
rm -rf "$HOME/Desktop"/.[!.]* 2>/dev/null
echo "   ✓ Desktop cleaned"

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  ✓ CLEANUP COMPLETE - System ready for use     ║"
echo "╚════════════════════════════════════════════════╝"
