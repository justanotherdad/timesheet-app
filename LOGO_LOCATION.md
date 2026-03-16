# Where to Change the Website Header Logo

## Location

**File:** `components/Header.tsx`  
**Lines:** 47-71

## Current Setup

The header currently uses a **text-based logo** (active):
- Lines 58-70: Text logo showing "CTG" with company name

The **image logo code** is commented out:
- Lines 49-55: Image logo code (commented with `{/* */}`)

## How to Change to Image Logo

### Step 1: Add Your Logo File

1. Save your logo image to the `public` folder
2. Recommended filename: `ctg-logo.png` (or `.svg`, `.jpg`)
3. Recommended size: 120-200px width, 40-60px height (or proportional)

### Step 2: Update Header.tsx

1. Open `components/Header.tsx`
2. **Uncomment** lines 49-55 (remove the `{/* */}` markers):
   ```tsx
   <Image
     src="/ctg-logo.png"
     alt="CTG Logo"
     width={120}
     height={40}
     className="h-10 w-auto"
   />
   ```
3. **Comment out** lines 58-70 (add `{/* */}` markers around the text logo)

### Step 3: Adjust Size (if needed)

If your logo is a different size, adjust the `width` and `height` props:
```tsx
<Image
  src="/ctg-logo.png"
  alt="CTG Logo"
  width={150}  // Adjust as needed
  height={50}  // Adjust as needed
  className="h-10 w-auto"
/>
```

## Example: After Changes

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

## File Location

- Logo image: `/public/ctg-logo.png`
- Header component: `/components/Header.tsx`

## See Also

For more detailed instructions, see: `updating-favicon-and-logo.md`
