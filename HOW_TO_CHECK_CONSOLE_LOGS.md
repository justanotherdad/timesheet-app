# How to Check Console Logs on a Laptop

## Quick Methods (All Browsers)

### Method 1: Keyboard Shortcut (Fastest)
- **Windows/Linux:** Press `F12` or `Ctrl + Shift + I` (or `Ctrl + Shift + J` for just console)
- **Mac:** Press `Cmd + Option + I` (or `Cmd + Option + J` for just console)

### Method 2: Right-Click Menu
1. Right-click anywhere on the page
2. Select **"Inspect"** or **"Inspect Element"**
3. DevTools will open

### Method 3: Browser Menu
- **Chrome/Edge:** Menu (three dots) → More Tools → Developer Tools
- **Firefox:** Menu (three lines) → More Tools → Web Developer Tools
- **Safari:** First enable Developer menu: Safari → Preferences → Advanced → Check "Show Develop menu"
  - Then: Develop → Show Web Inspector

---

## Step-by-Step: Chrome/Edge (Most Common)

1. **Open the page** with the error (the "Set Your Password" page)

2. **Open DevTools:**
   - Press `F12` OR
   - Press `Ctrl + Shift + I` (Windows) or `Cmd + Option + I` (Mac) OR
   - Right-click → "Inspect"

3. **Go to Console Tab:**
   - Click the **"Console"** tab at the top of DevTools
   - You should see messages in different colors

4. **What to Look For:**
   - **Red messages** = Errors (these are important!)
   - **Yellow messages** = Warnings
   - **White/Gray messages** = Info/Logs (our debug messages)

5. **Clear Console (Optional):**
   - Click the 🚫 icon or press `Ctrl + L` to clear old messages
   - Then refresh the page or click the invite link again

---

## Step-by-Step: Safari (Mac)

1. **First Time Setup (One-time):**
   - Safari → Preferences (or Settings)
   - Go to "Advanced" tab
   - Check ✅ "Show Develop menu in menu bar"

2. **Open DevTools:**
   - Develop → Show Web Inspector
   - OR Press `Cmd + Option + I`

3. **Go to Console:**
   - Click the "Console" tab

---

## What to Look For in Console

When you click the invitation link, you should see messages like:

### Good Signs (Should See):
```
Setup password page loaded. Full URL: https://ctgtimesheet.com/auth/setup-password#access_token=...
Found hash in URL: #access_token=...
Hash params: { hasAccessToken: true, hasRefreshToken: true, type: "invite" }
Attempting token exchange...
Session created successfully, user: user@example.com
Session verified successfully
```

### Bad Signs (Errors to Look For):
```
setSession error: ...
Token exchange error: ...
No session found after error: ...
Auth session missing!
Invalid JWT
```

### When Setting Password:
```
Checking for user session before password update...
User found: user@example.com
Updating password for user: user@example.com
Password updated successfully
```

OR if there's an error:
```
No user found, attempting to refresh session...
Session refresh failed: ...
Auth session missing!
```

---

## How to Copy Console Logs

1. **Select All:**
   - Click in the console
   - Press `Ctrl + A` (Windows) or `Cmd + A` (Mac) to select all

2. **Copy:**
   - Press `Ctrl + C` (Windows) or `Cmd + C` (Mac)

3. **Paste:**
   - Paste into a text file or email to share

---

## Network Tab (Also Useful)

If console doesn't show errors, check Network tab:

1. **Open DevTools** (F12)
2. **Click "Network" tab**
3. **Refresh the page** or click the invite link
4. **Look for red/failed requests:**
   - Red = Failed request
   - Click on it to see error details
   - Check "Response" tab for error message

---

## Common Issues in Console

### "Cookies blocked" or "SameSite" warnings
- **Fix:** Check browser cookie settings
- Allow cookies for `ctgtimesheet.com`

### "CORS error" or "Cross-origin" errors
- **Fix:** Check Supabase redirect URLs include your domain

### "Invalid JWT" or "Token expired"
- **Fix:** Link might be expired, generate a new one

### "Network error" or "Failed to fetch"
- **Fix:** Check internet connection or Supabase status

---

## Quick Test Steps

1. **Open Console** (F12 → Console tab)
2. **Clear console** (🚫 icon or Ctrl+L)
3. **Click the invitation link** (or refresh if already on the page)
4. **Watch the console** for messages
5. **Try to set password** and watch for errors
6. **Copy any red error messages** and share them

---

## Screenshot Alternative

If you can't copy the logs:
1. Take a screenshot of the Console tab
2. Make sure you can see the error messages
3. Share the screenshot

---

## Need Help?

If you see errors in the console, copy them and share:
- The exact error message (red text)
- Any warnings (yellow text)
- The URL you're on when the error happens
