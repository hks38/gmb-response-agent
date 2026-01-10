# Push to GitHub - Quick Instructions

## Step 1: Create a Private Repository on GitHub

1. Go to https://github.com/new
2. Repository name: `gmb-response-agent` (or any name you prefer)
3. Description: "AI-powered Google Business Profile Review Response Agent"
4. **Set visibility to Private** ✓
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

## Step 2: Push Your Code

After creating the repository, run these commands:

```bash
cd /Users/hshah/cursor/gmbResponseAgent

# Add the remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/gmb-response-agent.git

# Or if you prefer SSH (recommended if you have SSH keys set up):
# git remote add origin git@github.com:YOUR_USERNAME/gmb-response-agent.git

# Rename branch to main if needed
git branch -M main

# Push to GitHub
git push -u origin main
```

## Step 3: Authenticate

If prompted for credentials:
- **Username**: Your GitHub username
- **Password**: Use a Personal Access Token (NOT your GitHub password)
  - Create token at: https://github.com/settings/tokens
  - Select scope: `repo` (full control of private repositories)
  - Copy the token and use it as the password

## Alternative: Use GitHub CLI

If you have GitHub CLI installed:
```bash
brew install gh  # Install if needed
gh auth login
gh repo create gmb-response-agent --private --source=. --remote=origin --push
```

## Verify

After pushing, check: https://github.com/YOUR_USERNAME/gmb-response-agent

## Important Notes

- ✅ `.env` file is already in `.gitignore` (your secrets are safe)
- ✅ Database files are excluded
- ✅ Sensitive tokens and credentials are excluded
- ✅ All source code is included
