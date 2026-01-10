# Quick Push Guide

## Step 1: Create Private Repository
1. Go to: https://github.com/new
2. Owner: hks38
3. Repository name: `gmb-response-agent`
4. Description: `AI-powered Google Business Profile Review Response Agent`
5. Visibility: 🔒 **Private**
6. ⚠️ **DO NOT** check any initialization options (no README, .gitignore, license)
7. Click "Create repository"

## Step 2: Push the Code

After creating the repository, run:

```bash
cd /Users/hshah/cursor/gmbResponseAgent

# Add remote
git remote add origin https://github.com/hks38/gmb-response-agent.git

# Ensure branch is named 'main'
git branch -M main

# Push to GitHub (you'll be prompted for credentials)
git push -u origin main
```

## Step 3: Authenticate

When prompted:
- **Username**: `hks38`
- **Password**: Use a Personal Access Token (NOT your GitHub password)

To create a token:
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Name: `gmb-response-agent-push`
4. Expiration: Choose your preference (90 days recommended)
5. Scopes: Check `repo` (full control of private repositories)
6. Click "Generate token"
7. **Copy the token immediately** (you won't see it again)
8. Use this token as the password when pushing

## Alternative: Use SSH (if you have SSH keys set up)

If you have SSH keys configured with GitHub:

```bash
git remote set-url origin git@github.com:hks38/gmb-response-agent.git
git push -u origin main
```

