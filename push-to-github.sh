#!/bin/bash

# Script to push gmb-response-agent to GitHub
# Usage: ./push-to-github.sh YOUR_USERNAME [REPO_NAME]

set -e

USERNAME=${1:-""}
REPO_NAME=${2:-"gmb-response-agent"}

if [ -z "$USERNAME" ]; then
    echo "❌ Error: GitHub username required"
    echo ""
    echo "Usage: ./push-to-github.sh YOUR_GITHUB_USERNAME [REPO_NAME]"
    echo ""
    echo "Example:"
    echo "  ./push-to-github.sh hshah"
    echo "  ./push-to-github.sh hshah my-custom-repo-name"
    exit 1
fi

echo "🚀 Preparing to push to GitHub..."
echo ""

# Check if remote already exists
if git remote get-url origin &>/dev/null; then
    echo "⚠️  Remote 'origin' already exists:"
    git remote get-url origin
    read -p "Do you want to update it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git remote set-url origin "https://github.com/$USERNAME/$REPO_NAME.git"
    else
        echo "Keeping existing remote. Exiting."
        exit 0
    fi
else
    git remote add origin "https://github.com/$USERNAME/$REPO_NAME.git"
fi

# Ensure branch is named 'main'
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
    git branch -M main
fi

echo ""
echo "📤 Pushing to GitHub..."
echo "Repository: https://github.com/$USERNAME/$REPO_NAME"
echo ""

# Push to GitHub
if git push -u origin main; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo ""
    echo "🔗 Repository URL: https://github.com/$USERNAME/$REPO_NAME"
    echo ""
    echo "💡 Note: Make sure the repository exists on GitHub and is set to Private"
    echo "   If it doesn't exist yet, create it at: https://github.com/new"
else
    echo ""
    echo "❌ Push failed. Common issues:"
    echo "   1. Repository doesn't exist yet - create it at: https://github.com/new"
    echo "   2. Authentication required - use Personal Access Token (not password)"
    echo "   3. Repository name mismatch - check the repository name on GitHub"
    echo ""
    echo "If the repository doesn't exist, create it first:"
    echo "   1. Go to: https://github.com/new"
    echo "   2. Repository name: $REPO_NAME"
    echo "   3. Set to Private"
    echo "   4. DO NOT initialize with README/gitignore"
    echo "   5. Click 'Create repository'"
    echo "   6. Run this script again"
    exit 1
fi


