# Updating Favicon and Logo

This guide explains how to change the favicon and logo for the CTG Timesheet application.

---

## 1. Favicon (Browser Tab Icon)

### Location
- **File:** `app/favicon.ico`

### How to Change

1. **Prepare your favicon:**
   - Create or obtain a `.ico` file
   - Recommended sizes: 16x16, 32x32, or 48x48 pixels
   - You can use online tools to convert PNG/JPG to ICO format

2. **Replace the file:**
   - Delete or rename the existing `app/favicon.ico`
   - Place your new favicon file at `app/favicon.ico`
   - Keep the exact filename: `favicon.ico`

3. **Alternative location:**
   - You can also place `favicon.ico` in the `public` folder
   - Next.js will automatically use it

4. **Test:**
   - Clear your browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)
   - Hard refresh the page (Ctrl+F5 or Cmd+Shift+R)
   - The new favicon should appear in the browser tab

---

## 2. Logo (Header Logo)

### Location
- **Component:** `components/Header.tsx`
- **Image file:** `public/ctg-logo.png` (or your preferred format)

### Current Setup
The header currently uses a text-based logo displaying "CTG" with the company name.

### How to Change to Image Logo

#### Step 1: Add Your Logo File

1. **Prepare your logo:**
   - Recommended formats: PNG, SVG, or JPG
   - Recommended size: 120-200px width, 40-60px height (or proportional)
   - For best quality, use SVG or high-resolution PNG

2. **Place the file:**
   - Add your logo file to the `public` folder
   - Name it `ctg-logo.png` (or `.svg`, `.jpg`, etc.)
   - Full path: `public/ctg-logo.png`

#### Step 2: Update the Header Component

1. **Open the file:**
   - Navigate to `components/Header.tsx`

2. **Uncomment the image code:**
   - Find the commented-out `<Image>` section (around lines 24-29)
   - Remove the comment markers (`{/* */}`) to uncomment it

3. **Comment out the text logo:**
   - Find the text-based logo section (around lines 32-42)
   - Add comment markers to comment it out

4. **Adjust the image path (if needed):**
   - If your logo has a different name or format, update the `src` attribute:
     ```tsx
     src="/ctg-logo.png"  // Change to match your filename
     ```

5. **Adjust the size (optional):**
   - Modify the `width` and `height` attributes to fit your logo:
     ```tsx
     width={120}  // Adjust as needed
     height={40}  // Adjust as needed
     ```

#### Example: After Changes

```tsx
{/* CTG Logo */}
<Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
  {/* Image logo - now active */}
  <Image
    src="/ctg-logo.png"
    alt="CTG Logo"
    width={120}
    height={40}
    className="h-10 w-auto"
  />
  
  {/* Text-based logo - now commented out */}
  {/* <div className="flex items-center">
    <span className="text-2xl font-bold text-blue-700 dark:text-blue-400">
      CT
    </span>
    <span className="text-2xl font-bold text-blue-700 dark:text-blue-400 border-2 border-blue-700 dark:border-blue-400 rounded-sm px-1">
      G
    </span>
  </div>
  <div className="text-xs text-blue-700 dark:text-blue-400 font-semibold leading-tight">
    COMPLIANCE<br />
    TECHNOLOGY<br />
    GROUP, INC.
  </div> */}
</Link>
```

---

## Quick Reference

### Favicon
- **File to replace:** `app/favicon.ico`
- **Format:** `.ico`
- **Size:** 16x16, 32x32, or 48x48 pixels

### Logo
- **Image location:** `public/ctg-logo.png` (or your preferred name/format)
- **Component to edit:** `components/Header.tsx`
- **Format:** PNG, SVG, or JPG
- **Recommended size:** 120-200px width

---

## Troubleshooting

### Favicon not showing?
- Clear browser cache
- Hard refresh the page (Ctrl+F5 or Cmd+Shift+R)
- Check that the file is named exactly `favicon.ico`
- Verify the file is in `app/` folder (or `public/` folder)

### Logo not showing?
- Check that the image file exists in the `public` folder
- Verify the filename in `Header.tsx` matches your actual file
- Check browser console for 404 errors
- Ensure the image code is uncommented in `Header.tsx`
- Try using an absolute path: `/ctg-logo.png` (starts with `/`)

### Logo too large/small?
- Adjust the `width` and `height` attributes in the `<Image>` component
- Use `className="h-10 w-auto"` to maintain aspect ratio
- For responsive sizing, use Tailwind classes like `w-32` or `h-12`

---

## Notes

- Next.js automatically serves files from the `public` folder at the root URL
- The favicon is automatically detected by Next.js when placed in `app/` or `public/`
- Image optimization is handled automatically by Next.js `Image` component
- SVG logos work great for scalability and small file sizes
