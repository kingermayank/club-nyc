#!/bin/bash
# Setup script for playtest harness

set -e

echo "Setting up Club NYC Playtest Harness..."

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install -r tools/playtest/requirements.txt

# Install Playwright browsers
echo "Installing Playwright browsers..."
playwright install chromium

echo "✅ Setup complete!"
echo ""
echo "To run the playtest:"
echo "  npm run playtest"
echo ""
echo "Make sure the dev server is running first:"
echo "  npm run dev"
