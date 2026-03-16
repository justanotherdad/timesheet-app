# How to Add the CTG Logo to Timesheet Exports

## Quick Steps

1. **Save your logo image file** to the `public` folder in your project
2. **Name it exactly:** `ctg-header-logo.png`
3. **Location:** `/public/ctg-header-logo.png`

## File Requirements

- **Filename:** `ctg-header-logo.png` (must match exactly)
- **Format:** PNG (recommended) or JPG
- **Size:** Recommended width: 800-1200px for good print quality
- **Location:** Must be in the `public` folder at the root of your project

## File Structure

Your project should look like this:
```
timesheet-app/
  ├── public/
  │   ├── ctg-header-logo.png  ← Your logo file goes here
  │   └── ...
  ├── components/
  ├── app/
  └── ...
```

## Alternative Formats

If you prefer a different format, you can use:
- `ctg-header-logo.jpg` (JPEG format)
- `ctg-header-logo.svg` (SVG format - best for scaling)

**Note:** If you use a different filename, you'll need to update the code in `components/WeeklyTimesheetExport.tsx` on line 192.

## Testing

After adding the logo file:

1. **Restart your development server** (if running locally):
   ```bash
   npm run dev
   ```

2. **Go to a timesheet** and click "Export" or "View"

3. **The logo should appear** at the top of the timesheet instead of the text header

4. **If the logo doesn't appear:**
   - Check that the filename is exactly `ctg-header-logo.png`
   - Check that the file is in the `public` folder (not in a subfolder)
   - Check the browser console for any image loading errors
   - Make sure the file isn't corrupted

## For Production/Deployment

When you deploy to Vercel (or another hosting service):

1. Make sure the `public` folder is included in your deployment
2. The logo file should be accessible at: `https://yourdomain.com/ctg-header-logo.png`
3. The timesheet export will automatically use the logo from your deployed site

## Current Status

The code is already set up to:
- ✅ Display the logo if the file exists
- ✅ Fall back to text header if the logo is missing
- ✅ Use absolute URLs for print/PDF export
- ✅ Scale the logo appropriately for printing

You just need to add the actual logo file to the `public` folder!
