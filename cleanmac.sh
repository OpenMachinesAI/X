#!/bin/bash

echo "╔════════════════════════════════════════════════╗"
echo "║     MAC CLEANUP UTILITY v1.5 - BYALEX          ║"
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

echo "▶️  Quitting Chrome..."
killall "Google Chrome" 2>/dev/null
sleep 1

echo "▶️  [1/3] Cleaning Chrome profiles..."
rm -rf ~/Library/"Application Support"/Google/Chrome
echo "   ✓ Chrome profiles cleanup complete"

echo ""

echo "▶️  [2/3] Cleaning Downloads folder..."
rm -rf ~/Downloads/*
echo "   ✓ Downloads cleaned"

echo ""

echo "▶️  [3/3] Cleaning Desktop..."
rm -rf ~/Desktop/*
echo "   ✓ Desktop cleaned"

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  ✓ CLEANUP COMPLETE - System ready for use     ║"
echo "╚════════════════════════════════════════════════╝"
