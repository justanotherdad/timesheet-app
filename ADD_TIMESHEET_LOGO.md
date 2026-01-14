# Adding Company Logo to Timesheet Export

## What Was Fixed

1. **Text Readability Issues:**
   - Changed all text colors to black (`#000`) for maximum contrast
   - Fixed sub-total rows (yellow background) to use black text instead of light grey
   - Fixed all table headers, cells, and labels to use black text
   - Ensured all signature sections use black text

2. **Logo Header:**
   - Replaced the text-based header with a logo image
   - Added fallback to text header if logo image is not found

## How to Add the Logo

1. **Save the Logo Image:**
   - Save your CTG header logo image to the `public` folder
   - Name it exactly: `ctg-header-logo.png`
   - Recommended format: PNG with transparent background (if needed)
   - Recommended size: Width should be around 800-1200px for good print quality

2. **File Location:**
   ```
   /public/ctg-header-logo.png
   ```

3. **Alternative Formats:**
   If you prefer a different format, you can use:
   - `ctg-header-logo.jpg` (if using JPEG)
   - `ctg-header-logo.svg` (if using SVG - best for scaling)

   **Note:** If using a different filename, update line 199 in `components/WeeklyTimesheetExport.tsx`:
   ```tsx
   <img src="/your-logo-filename.png" ... />
   ```

## Testing

After adding the logo:
1. Go to a timesheet
2. Click "Export" or "View"
3. The logo should appear at the top of the timesheet
4. All text should now be clearly readable with black text on all backgrounds

## Fallback

If the logo image is not found, the system will automatically show the text-based header with company information as a fallback.
