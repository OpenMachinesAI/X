#!/bin/bash

echo "╔════════════════════════════════════════════════╗"
echo "║     MAC CLEANUP UTILITY - BY AVA              ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "⚠️  WARNING: This will:"
echo "   • Quit Chrome (if running)"
echo "   • Delete all Chrome profiles"
echo "   • Delete all Downloads"
echo "   • Delete all Desktop files"
echo ""
read -p "Type 'yes' to proceed: " confirmation

if [ "$confirmation" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Starting cleanup..."
echo ""

# Quit Chrome if running
echo "▶️  [0/3] Quitting Chrome..."
killall "Google Chrome" 2>/dev/null
sleep 1
echo "   ✓ Chrome closed"

echo ""

# Delete Chrome profiles
echo "▶️  [1/3] Cleaning Chrome profiles..."
rm -rf "$HOME/Library/Application Support/Google/Chrome/Default" 2>/dev/null
rm -rf "$HOME/Library/Application Support/Google/Chrome/Profile "* 2>/dev/null
echo "   ✓ Chrome profiles deleted"

echo ""

# Delete Downloads
echo "▶️  [2/3] Cleaning Downloads..."
rm -rf "$HOME/Downloads"/* 2>/dev/null
echo "   ✓ Downloads cleaned"

echo ""

# Delete Desktop
echo "▶️  [3/3] Cleaning Desktop..."
rm -rf "$HOME/Desktop"/* 2>/dev/null
echo "   ✓ Desktop cleaned"

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  ✓ CLEANUP COMPLETE                            ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
read -p "Press Enter to close this window..."
