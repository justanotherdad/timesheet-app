# Deployment Commands

## Force Deploy to GitHub (which triggers Vercel)

```bash
# 1. Check current status
git status

# 2. Add all changes
git add .

# 3. Commit with a message
git commit -m "Add dark mode, header component, hierarchical structure, and week starting day configuration"

# 4. Push to GitHub (this will trigger Vercel deployment automatically)
git push origin main

# If you're on a different branch:
# git push origin <your-branch-name>
```

## Alternative: Force Push (if needed)

```bash
# Only use if you need to overwrite remote history (be careful!)
git push --force origin main
```

## Check Deployment Status

After pushing:
1. Go to your GitHub repository
2. Check the "Actions" tab to see if the push was successful
3. Go to Vercel dashboard to see the deployment progress
4. Vercel will automatically deploy when it detects the push

## Quick One-Liner

```bash
git add . && git commit -m "Update: dark mode, header, hierarchy, week config" && git push origin main
```

## Notes

- Vercel automatically deploys when you push to the main branch (or your configured branch)
- No need to manually trigger deployment if GitHub integration is set up
- Check Vercel dashboard for deployment logs if something goes wrong
